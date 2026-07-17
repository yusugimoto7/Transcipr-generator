import { callClaude } from "../../../lib/anthropic";
import { topicPrompt, parseTopics } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generating topics does real multi-round web search and can take several
// minutes. Two layers make normal loads fast:
//
// 1. In-memory cache, stale-while-revalidate: once a batch is "fresh enough"
//    to have gone stale (past FRESH_MS) but still under SERVE_MAX_MS old, we
//    serve it immediately AND kick off a background regenerate (not
//    awaited) so the NEXT request gets new data — no visitor ever blocks on
//    that refresh. Only a genuinely empty/too-old cache forces a request to
//    wait on a live call.
// 2. GET /api/topics/../health (see health/route.js) lets an external pinger
//    keep this process warm on free hosting tiers, so the cache above
//    actually survives between visits instead of being wiped by every
//    spin-down/spin-up cycle.
const FRESH_MS = 20 * 60 * 1000; // serve as-is, no refresh needed
const SERVE_MAX_MS = 3 * 60 * 60 * 1000; // serve stale + background-refresh up to this age
let cache = { topics: null, timestamp: 0 };
let inFlight = null; // de-dupe concurrent live generations

async function generate(exclude) {
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local date
  const text = await callClaude(
    [{ role: "user", content: topicPrompt(today, exclude) }],
    true
  );
  const parsed = parseTopics(text);
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("parse");
  }
  return parsed;
}

// Kick off a regenerate without making the caller wait for it. Guarded by
// `inFlight` so concurrent requests don't trigger duplicate live searches.
function refreshInBackground(exclude) {
  if (inFlight) return;
  const task = generate(exclude)
    .then((parsed) => {
      cache = { topics: parsed, timestamp: Date.now() };
    })
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
    }

    const task = generate(exclude);
    if (!force) inFlight = task.finally(() => { inFlight = null; });
    const parsed = await task;
    cache = { topics: parsed, timestamp: Date.now() };
    return Response.json({ topics: parsed, cached: false });
  } catch (e) {
    if (String(e?.message || e) === "parse") {
      return Response.json({ error: "parse" }, { status: 502 });
    }
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
