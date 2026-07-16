import { callClaude } from "../../../lib/anthropic";
import { topicPrompt, parseTopics } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generating topics does real multi-round web search and can take several
// minutes. Without a cache, every page load (not just an explicit refresh)
// would pay that cost. Cache the last generated batch in memory for a while
// so normal loads are instant; only an explicit "force" request (the
// Refresh trends button) bypasses the cache and does a live regenerate.
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cache = { topics: null, timestamp: 0 };
let inFlight = null; // de-dupe concurrent cold-cache requests

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

    const cacheFresh = cache.topics && Date.now() - cache.timestamp < CACHE_TTL_MS;
    if (!force && cacheFresh) {
      return Response.json({ topics: cache.topics, cached: true });
    }

    // Avoid duplicate concurrent generations (e.g. several tabs loading at once).
    if (!force && inFlight) {
      const topics = await inFlight;
      return Response.json({ topics, cached: true });
    }

    const task = generate(exclude);
    if (!force) inFlight = task;
    try {
      const parsed = await task;
      cache = { topics: parsed, timestamp: Date.now() };
      return Response.json({ topics: parsed, cached: false });
    } finally {
      if (!force) inFlight = null;
    }
  } catch (e) {
    if (String(e?.message || e) === "parse") {
      return Response.json({ error: "parse" }, { status: 502 });
    }
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
