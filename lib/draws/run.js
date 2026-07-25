// One full cycle: collect every program, drop anything already posted, publish
// the rest, record what went out, and (optionally) refresh the WordPress page.
//
// Designed to be safe to call as often as you like — dedup makes idle runs
// no-ops. Never throws: failures are collected and reported.
import { collectAll } from "./sources";
import { getPostedKeys, markPosted, storeIsDurable } from "./store";
import { publishItem } from "./publish";
import { updateWordPressPage, wordpressEnabled } from "./wordpress";

export async function runDrawCycle({
  dryRun = false,
  only = null,
  withWordPress = true,
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

  const results = [];
  for (const item of fresh) {
    if (dryRun) {
      results.push({ program: item.program, dedupKey: item.dedupKey, dryRun: true });
      continue;
    }
    const channels = await publishItem(item);
    // Record it if at least one channel actually accepted the post, so a
    // transient all-channel outage is retried on the next run instead of being
    // silently swallowed.
    const anyOk = Object.values(channels).some((c) => c?.ok);
    let recorded = false;
    let recordError = null;
    if (anyOk) {
      try {
        await markPosted(item, channels);
        recorded = true;
      } catch (err) {
        recordError = String(err?.message || err);
      }
    }
    results.push({
      program: item.program,
      dedupKey: item.dedupKey,
      channels,
      recorded,
      recordError,
    });
  }

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
    published: results.length,
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
