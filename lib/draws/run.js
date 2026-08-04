// One full cycle: collect every program, drop anything already posted, publish
// the rest, record what went out, and (optionally) refresh the WordPress page.
//
// Designed to be safe to call as often as you like — dedup makes idle runs
// no-ops. Never throws: failures are collected and reported.
import { collectAll } from "./sources";
import { getPostedKeys, markPosted, storeIsDurable } from "./store";
import { publishItem } from "./publish";
import { updateWordPressPage, wordpressEnabled } from "./wordpress";

// Ping a Telegram chat when a channel starts failing — an expired LinkedIn or
// Instagram token is the usual cause, and it would otherwise fail silently
// while the other channels keep posting. No-op unless DRAWS_ALERT_CHAT_ID is
// set. Never throws: alerting must not break a run.
async function alertFailures(results) {
  const token = process.env.DRAWS_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.DRAWS_ALERT_CHAT_ID;
  if (!token || !chatId) return;

  const broken = [];
  for (const r of results) {
    for (const [channel, outcome] of Object.entries(r.channels || {})) {
      if (outcome && !outcome.ok && !outcome.skipped) {
        broken.push(`• ${channel} (${r.program}): ${outcome.error}`);
      }
    }
  }
  if (!broken.length) return;

  const text =
    "⚠️ Draw auto-poster: a channel failed\n\n" +
    broken.slice(0, 10).join("\n") +
    "\n\nAn expired LinkedIn (~60 days) or Instagram token is the most common cause.";

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (_) {
    // Alerting is best-effort.
  }
}

// Only one publishing run at a time. Two overlapping runs both read the posted
// keys before either writes, so both see the same draws as new and both publish
// them — the per-draw claim below catches most of that, but not the window
// between the two reads. Refusing to start is simpler and closes it entirely.
// Held on globalThis because API routes and the scheduler are separate bundles.
function lock() {
  return (globalThis.__drawsRunLock ||= { busy: false, since: null });
}

export async function runDrawCycle(opts = {}) {
  const { dryRun = false } = opts;
  // A dry run sends nothing, so it never needs the lock.
  if (dryRun) return runDrawCycleUnlocked(opts);

  const l = lock();
  if (l.busy) {
    return {
      startedAt: new Date().toISOString(),
      ok: true,
      skipped: true,
      reason: `A run started at ${l.since} is still in progress. Skipping this one so the same draw cannot be published twice.`,
    };
  }
  l.busy = true;
  l.since = new Date().toISOString();
  try {
    return await runDrawCycleUnlocked(opts);
  } finally {
    l.busy = false;
  }
}

async function runDrawCycleUnlocked({
  dryRun = false,
  only = null,
  withWordPress = true,
  seed = false,
} = {}) {
  const startedAt = new Date().toISOString();
  const { items, errors } = await collectAll({ only });

  let posted;
  try {
    posted = await getPostedKeys();
  } catch (err) {
    // Without the memory we cannot safely post — we would risk duplicates.
    return {
      startedAt,
      ok: false,
      error: `dedup store unavailable: ${String(err?.message || err)}`,
      found: items.length,
      sourceErrors: errors,
    };
  }

  const fresh = items.filter((i) => i.dedupKey && !posted.has(i.dedupKey));

  // SEED mode: record the current draws as already-posted WITHOUT sending
  // anything. Run this ONCE before enabling the poster so the existing backlog
  // is skipped and only genuinely NEW draws post afterwards.
  if (seed) {
    const seeded = [];
    for (const item of fresh) {
      try {
        await markPosted(item, {});
        seeded.push(item.dedupKey);
      } catch (_) {}
    }
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: true,
      mode: "seed",
      durableDedup: storeIsDurable(),
      found: items.length,
      seeded: seeded.length,
      seededKeys: seeded,
      note: storeIsDurable()
        ? "These draws are now marked posted and will NOT be sent. Only new draws will post."
        : "WARNING: durable dedup is off (Sheet not reachable) — seeding won't survive a restart. Fix the Apps Script first.",
      sourceErrors: errors,
    };
  }

  // ── Safety rail 1: never post without a durable memory ────────────────────
  // In-process memory is wiped by every restart, and a free instance restarts
  // constantly — that combination reposts the same draw forever. Refuse instead.
  if (!dryRun && !storeIsDurable()) {
    return {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      blocked: true,
      error:
        "Refusing to post: SHEET_WEBHOOK_URL / SHEET_SECRET are not set, so there is " +
        "no durable record of what has already gone out. Without it the same draw " +
        "would repost on every run.",
      found: items.length,
      wouldPost: fresh.length,
      sourceErrors: errors,
    };
  }

  // ── Safety rail 2: cap how much a single run can ever publish ─────────────
  // A backlog or a dedup fault can surface many "new" draws at once. A cap turns
  // that into a few posts and a visible warning rather than a flood.
  const maxPerRun = Math.max(1, Number(process.env.DRAWS_MAX_POSTS_PER_RUN || 3));
  const toPublish = dryRun ? fresh : fresh.slice(0, maxPerRun);
  const heldBack = fresh.length - toPublish.length;

  const results = [];
  for (const item of toPublish) {
    if (dryRun) {
      results.push({ program: item.program, dedupKey: item.dedupKey, dryRun: true });
      continue;
    }

    // ── Safety rail 3: RESERVE FIRST, THEN POST ─────────────────────────────
    // Recording used to happen after publishing, so a failed write meant the
    // draw looked new again on the next run and posted again, every 15 minutes.
    // Claiming the key first — and verifying it stuck — makes the failure mode
    // "this draw does not post" instead of "this draw posts forever".
    try {
      const claim = await markPosted(item, {});
      // Another run got this draw first — it is publishing it, so we must not.
      if (claim?.alreadyClaimed) {
        results.push({
          program: item.program,
          dedupKey: item.dedupKey,
          posted: false,
          recorded: true,
          note: "Skipped: another run claimed this draw first and is publishing it.",
        });
        continue;
      }
    } catch (err) {
      results.push({
        program: item.program,
        dedupKey: item.dedupKey,
        posted: false,
        recorded: false,
        recordError: String(err?.message || err),
        note: "Not published: the draw could not be recorded first, so publishing it would risk repeating.",
      });
      continue;
    }

    const channels = await publishItem(item);
    results.push({
      program: item.program,
      dedupKey: item.dedupKey,
      posted: Object.values(channels).some((c) => c?.ok),
      recorded: true,
      channels,
    });
  }

  if (!dryRun) await alertFailures(results);

  let wordpress = null;
  if (withWordPress && wordpressEnabled()) {
    try {
      wordpress = await updateWordPressPage({ dryRun });
    } catch (err) {
      wordpress = { updated: false, error: String(err?.message || err) };
    }
  }

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    ok: true,
    dryRun,
    durableDedup: storeIsDurable(),
    found: items.length,
    alreadyPosted: items.length - fresh.length,
    published: results.filter((r) => r.posted).length,
    attempted: results.length,
    heldBack,
    heldBackNote: heldBack
      ? `${heldBack} more were held back by DRAWS_MAX_POSTS_PER_RUN (${maxPerRun}). They go out on later runs.`
      : undefined,
    results,
    wordpress,
    sourceErrors: errors,
  };
}

// What *would* post right now, without sending anything.
export async function previewDrawCycle({ only = null } = {}) {
  const { items, errors } = await collectAll({ only });
  let posted = new Set();
  let storeError = null;
  try {
    posted = await getPostedKeys();
  } catch (err) {
    storeError = String(err?.message || err);
  }
  return {
    durableDedup: storeIsDurable(),
    storeError,
    sourceErrors: errors,
    items: items.map((i) => ({
      program: i.program,
      dedupKey: i.dedupKey,
      isNew: !posted.has(i.dedupKey),
      skipInstagram: !!i.skipInstagram,
      telegram: i.telegram,
      x: i.x,
      linkedin: i.linkedin,
      igCaption: i.igCaption,
      card: i.card,
    })),
  };
}
