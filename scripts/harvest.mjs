// Scheduled harvester — run by .github/workflows/harvest.yml every few hours.
//
//   node scripts/harvest.mjs <data-dir>
//
// Reads <data-dir>/candidates.json (the pool so far, if any), fetches every
// feed, folds new items in, enriches a bounded number of them, and writes the
// pool back along with health.json. The workflow commits the directory to the
// `harvest-data` branch, which the app reads (see lib/candidates.js).
//
// Also prints a per-feed health table to the job log and job summary: this is
// the one place the feed list is exercised from a real, unrestricted network
// on a schedule, so it doubles as the monitor for dead sources.

import fs from "node:fs";
import path from "node:path";
import { fetchFeedItems, fetchArticleText, isGoogleNews } from "../lib/news.js";
import { mergeCandidates, relevance, isDrawResult, KEEP_DAYS } from "../lib/candidates.js";
import { resolveGoogleNewsUrl } from "../lib/gnews.js";

const dir = process.argv[2] || "harvest-data";
const file = path.join(dir, "candidates.json");
const nowMs = Date.now();

// Per-run enrichment budgets. Each resolve/fetch is a network round trip, and
// Google may throttle bursts, so work through the backlog over several runs
// rather than hammering it once.
const MAX_RESOLVE = 80;
const MAX_TEXT = 120;
const CONCURRENCY = 4;
const THIN = 300; // below this many characters an item needs its article text

async function pool(items, n, fn) {
  const queue = [...items];
  const workers = Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift());
  });
  await Promise.all(workers);
}

function readStored() {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data.items) ? data : { items: [] };
  } catch (_) {
    return { items: [] };
  }
}

const stored = readStored();
const { items: fetched, ownTitles, feedStatus } = await fetchFeedItems({ maxAgeDays: KEEP_DAYS, nowMs });

// Store only what could become a topic: on-subject and not a draw result.
const eligible = fetched.filter((it) => relevance(it) > 0 && !isDrawResult(it));
const { items, added } = mergeCandidates(stored.items, eligible, nowMs);

// ── Enrichment ────────────────────────────────────────────────────────────────
// Newest first, so the budget goes where it matters most.
const needResolve = items.filter((c) => isGoogleNews(c.source_url) && c.resolved_url === undefined).slice(0, MAX_RESOLVE);
let resolvedOk = 0;
await pool(needResolve, CONCURRENCY, async (c) => {
  const url = await resolveGoogleNewsUrl(c.source_url);
  // null is recorded too, so a link that cannot be resolved is not retried
  // every run forever.
  c.resolved_url = url;
  if (url) resolvedOk++;
});

const needText = items
  .filter((c) => c.text === undefined && (c.snippet || "").length < THIN)
  .filter((c) => !isGoogleNews(c.source_url) || c.resolved_url)
  .slice(0, MAX_TEXT);
let textOk = 0;
await pool(needText, CONCURRENCY, async (c) => {
  const t = await fetchArticleText(c.resolved_url || c.source_url, { maxChars: 1500 });
  c.text = t && t.length >= THIN ? t : "";
  if (c.text) textOk++;
});

// ── Write ─────────────────────────────────────────────────────────────────────
fs.mkdirSync(dir, { recursive: true });
const out = {
  harvested_at: new Date(nowMs).toISOString(),
  keep_days: KEEP_DAYS,
  own_titles: ownTitles.slice(0, 300),
  items,
};
fs.writeFileSync(file, JSON.stringify(out));
const okFeeds = feedStatus.filter((f) => f.ok);
fs.writeFileSync(
  path.join(dir, "health.json"),
  JSON.stringify({ harvested_at: out.harvested_at, feeds: feedStatus }, null, 1)
);

// ── Report ────────────────────────────────────────────────────────────────────
const lines = [
  `## Harvest ${out.harvested_at}`,
  "",
  `- Feeds OK: **${okFeeds.length} / ${feedStatus.length}**`,
  `- Fetched ${fetched.length} items → ${eligible.length} on-topic → **${added} new**`,
  `- Pool: **${items.length}** candidates (last ${KEEP_DAYS} days)`,
  `- Google News links resolved: ${resolvedOk} / ${needResolve.length} attempted`,
  `- Article text fetched: ${textOk} / ${needText.length} attempted`,
  "",
  "| | Feed | Items / error |",
  "|---|---|---|",
  ...feedStatus.map(
    (f) => `| ${f.ok ? (f.count ? "✅" : "⚠️") : "❌"} | ${f.name} | ${f.ok ? f.count : f.error} |`
  ),
];
const report = lines.join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
