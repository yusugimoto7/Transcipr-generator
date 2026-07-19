import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiTopics } from "../../../lib/openai";
import { sheetEnabled, getSeen, appendRows, normalizeUrl } from "../../../lib/sheet";
import { topicPrompt, parseTopics } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generating topics does real multi-round web search — genuinely not cheap
// (multiple search calls + a large output budget). Safeguards here exist
// because a misconfigured pinger, a runaway automation, or someone mashing
// "Refresh trends" can otherwise rack up real cost fast with no ceiling.
//
// 1. In-memory cache, stale-while-revalidate: once a batch is "fresh enough"
//    to have gone stale (past FRESH_MS) but still under SERVE_MAX_MS old, we
//    serve it immediately AND kick off a background regenerate (not
//    awaited) so the NEXT request gets new data — no visitor ever blocks on
//    that refresh. Only a genuinely empty/too-old cache forces a request to
//    wait on a live call.
// 2. GET /api/health lets an external pinger keep this process warm on free
//    hosting tiers WITHOUT touching this endpoint or spending anything —
//    point any keep-alive cron at /api/health, never at /api/topics or "/".
// 3. Hard cost ceilings (below): a cooldown on forced refreshes, and a
//    rolling per-hour cap on ALL live generations (forced or automatic).
//    These cannot be bypassed by any client — including a broken pinger.
const FRESH_MS = 20 * 60 * 1000; // serve as-is, no refresh needed
const SERVE_MAX_MS = 3 * 60 * 60 * 1000; // serve stale + background-refresh up to this age
const FORCE_COOLDOWN_MS = 5 * 60 * 1000; // min time between explicit "Refresh trends" live calls
const MAX_GENERATIONS_PER_HOUR = 8; // hard ceiling on live generations, any trigger
const MAX_GENERATIONS_PER_DAY = 30; // second ceiling — catches a slow-burn runaway an hourly cap alone would miss over 24h

let cache = { topics: null, timestamp: 0, provider: null };
let inFlight = null; // de-dupe concurrent live generations
let lastForceAt = 0;
let generationTimestamps = []; // sliding window backing both caps

function underHourlyCap() {
  const hourCutoff = Date.now() - 60 * 60 * 1000;
  const dayCutoff = Date.now() - 24 * 60 * 60 * 1000;
  generationTimestamps = generationTimestamps.filter((t) => t > dayCutoff);
  const lastHour = generationTimestamps.filter((t) => t > hourCutoff).length;
  return lastHour < MAX_GENERATIONS_PER_HOUR && generationTimestamps.length < MAX_GENERATIONS_PER_DAY;
}

// Try OpenAI first when enabled; on ANY failure fall back to Claude so the app
// never breaks. `cache.provider` records which one actually produced the batch
// so you can confirm on Render whether OpenAI is really being used.
async function generate(clientExclude) {
  generationTimestamps.push(Date.now());
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local date

  // If a Google Sheet is configured it is the durable, cross-device source of
  // truth for what's been shown. Pull it up front so we can (a) tell the model
  // to avoid those titles and (b) drop any repeat article after generation.
  let seenUrlSet = null;
  let sheetTitles = [];
  if (sheetEnabled()) {
    try {
      const seen = await getSeen();
      seenUrlSet = new Set(seen.urls.map(normalizeUrl).filter(Boolean));
      sheetTitles = seen.titles || [];
    } catch (_) {
      seenUrlSet = null; // sheet unreachable — degrade gracefully
    }
  }

  const exclude = [...new Set([...(clientExclude || []), ...sheetTitles])].slice(-100);
  const prompt = topicPrompt(today, exclude);

  let text = "";
  let provider = "anthropic";
  if (openaiEnabled()) {
    try {
      text = await openaiTopics(prompt);
      provider = "openai";
    } catch (e) {
      // OpenAI failed — fall back to Claude if we can, else re-throw.
      if (!process.env.ANTHROPIC_API_KEY) throw e;
      text = await callClaude([{ role: "user", content: prompt }], true);
      provider = "anthropic (openai failed)";
    }
  } else {
    text = await callClaude([{ role: "user", content: prompt }], true);
  }

  const parsed = parseTopics(text);
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("parse"); // model genuinely returned nothing
  }

  // Server-side dedup by article + append the fresh ones to the history log.
  // An empty result here (everything already seen) is VALID, not an error.
  let out = parsed;
  if (seenUrlSet) {
    out = parsed.filter((t) => {
      const k = normalizeUrl(t.source_url);
      return !(k && seenUrlSet.has(k));
    });
    try {
      await appendRows(out);
    } catch (_) {
      // Logging failed — still serve the topics; don't lose the batch.
    }
  }

  cache = { topics: out, timestamp: Date.now(), provider };
  return out;
}

// Kick off a regenerate without making the caller wait for it. Guarded by
// `inFlight` (and the hourly cap) so concurrent requests don't trigger
// duplicate live searches.
function refreshInBackground(exclude) {
  if (inFlight || !underHourlyCap()) return;
  // generate() updates the cache itself on success.
  const task = generate(exclude)
    .catch(() => {
      // Keep serving the old cache on a failed background refresh; the next
      // request will just retry.
    })
    .finally(() => {
      inFlight = null;
    });
  inFlight = task;
}

export async function POST(request) {
  try {
    let exclude = [];
    let force = false;
    try {
      const body = await request.json();
      if (Array.isArray(body?.exclude)) {
        exclude = body.exclude.slice(0, 60).map((t) => String(t).slice(0, 200));
      }
      force = !!body?.force;
    } catch (_) {
      // no/invalid body — fine, just use defaults
    }

    // Explicit "Refresh trends" clicks still get a cooldown — otherwise
    // mashing the button (or a broken client retry loop) has no ceiling.
    if (force) {
      const sinceLastForce = Date.now() - lastForceAt;
      if (sinceLastForce < FORCE_COOLDOWN_MS && cache.topics) {
        return Response.json({
          topics: cache.topics,
          cached: true,
          throttled: true,
          retryAfterMs: FORCE_COOLDOWN_MS - sinceLastForce,
        });
      }
    }

    if (!force) {
      const age = cache.topics ? Date.now() - cache.timestamp : Infinity;

      if (age < FRESH_MS) {
        return Response.json({ topics: cache.topics, cached: true });
      }

      if (age < SERVE_MAX_MS) {
        // Stale but usable: serve instantly, refresh for next time.
        refreshInBackground(exclude);
        return Response.json({ topics: cache.topics, cached: true, stale: true });
      }

      // No usable cache at all — must wait on a live generation. Join an
      // already-running one if another request beat us to it.
      if (inFlight) {
        const topics = await inFlight.then(() => cache.topics);
        if (topics) return Response.json({ topics, cached: true });
      }

      // Hourly cap hit: serve whatever cache exists, however old, rather
      // than a hard failure; only error out if there's truly nothing.
      if (!underHourlyCap()) {
        if (cache.topics) {
          return Response.json({ topics: cache.topics, cached: true, stale: true });
        }
        return Response.json(
          { error: "rate_limited", message: "Too many live searches this hour — try again shortly." },
          { status: 429 }
        );
      }
    } else if (!underHourlyCap()) {
      return Response.json(
        {
          topics: cache.topics || [],
          cached: true,
          throttled: true,
          message: "Hourly live-search limit reached — showing the last known topics.",
        },
        { status: cache.topics ? 200 : 429 }
      );
    }

    if (force) lastForceAt = Date.now();
    const task = generate(exclude); // updates the cache (with provider) itself
    if (!force) inFlight = task.finally(() => { inFlight = null; });
    const parsed = await task;
    return Response.json({ topics: parsed, cached: false, provider: cache.provider });
  } catch (e) {
    if (String(e?.message || e) === "parse") {
      return Response.json({ error: "parse" }, { status: 502 });
    }
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
