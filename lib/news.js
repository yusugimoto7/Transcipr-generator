// Real news ingest for the Topic Engine. Instead of asking an LLM to "search"
// (which guesses at recency and repeats), we pull real, dated articles from
// trusted immigration RSS/Atom feeds — the same approach as the n8n
// "News Ingest" workflow — then hand the fresh, real items to the model only to
// write the Farsi hooks.
//
// Feeds are fetched in parallel and per-feed failures are swallowed, so one
// dead feed never breaks the batch. Extra feeds can be added at runtime via the
// NEWS_FEED_URLS env var (comma-separated), and X/Twitter accounts via
// X_FEED_URLS (comma-separated RSS URLs, e.g. from RSS.app) — no code change.

import Parser from "rss-parser";

// Curated, real immigration feeds. The first three are the ones already proven
// in the n8n workflow; the rest are reputable additions. Any that 404 or time
// out are skipped silently, so it is safe to keep a broad list here.
const CORE_FEEDS = [
  { url: "https://www.cicnews.com/feed", name: "CIC News" },
  { url: "https://immigrationnewscanada.ca/feed/", name: "Immigration News Canada" },
  {
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=25&format=atom",
    name: "IRCC",
  },
  { url: "https://www.canadim.com/feed/", name: "Canadim" },
  { url: "https://canadianimmigrant.ca/feed", name: "Canadian Immigrant" },
  { url: "https://www.immigration.ca/feed/", name: "Immigration.ca" },
  // Europe lane (uncontested white space for the brand):
  { url: "https://www.schengenvisainfo.com/news/feed/", name: "SchengenVisaInfo" },
];

function envFeeds(varName, label) {
  const raw = process.env[varName];
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((url) => ({ url, name: label }));
}

function allFeeds() {
  return [
    ...CORE_FEEDS,
    ...envFeeds("NEWS_FEED_URLS", "News"),
    // X/Twitter accounts (via an RSS bridge URL configured in env).
    ...envFeeds("X_FEED_URLS", "X"),
  ];
}

const parser = new Parser({
  timeout: 9000,
  headers: {
    // Some feeds reject requests without a browser-like UA.
    "User-Agent":
      "Mozilla/5.0 (compatible; SugimotoTopicBot/1.0; +https://sugimotovisa.com)",
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
  },
});

function hostSource(link, fallback) {
  try {
    let host = new URL(link).hostname.replace(/^www\./, "");
    const map = {
      "cicnews.com": "CIC News",
      "immigrationnewscanada.ca": "Immigration News Canada",
      "canada.ca": "IRCC",
      "canadim.com": "Canadim",
      "canadianimmigrant.ca": "Canadian Immigrant",
      "immigration.ca": "Immigration.ca",
      "schengenvisainfo.com": "SchengenVisaInfo",
      "x.com": "X",
      "twitter.com": "X",
      "nitter.net": "X",
    };
    return map[host] || fallback || host;
  } catch (_) {
    return fallback || "news";
  }
}

function cleanSnippet(j) {
  const raw = (j.contentSnippet || j.content || j.summary || j["content:encoded"] || "").toString();
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 900);
}

function pubMs(j) {
  const raw = j.isoDate || j.pubDate || j.published || j.date || j.updated || "";
  if (!raw) return 0;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

// Pull fresh, deduped, recent articles across all feeds.
//   maxAgeDays : drop anything older than this by its real published date
//   limit      : max items returned (newest first)
// `nowMs` is injected (never read the clock inside) so callers control "now".
export async function fetchNews({ maxAgeDays = 10, limit = 30, nowMs = Date.now() } = {}) {
  const feeds = allFeeds();
  const cutoff = nowMs - maxAgeDays * 24 * 3600 * 1000;

  // Hard per-feed timeout: rss-parser's own timeout can miss a connection that
  // hangs at the socket level, so race every fetch against a wall-clock limit.
  // A slow/stuck feed is dropped, never allowed to stall the whole request.
  const HARD_TIMEOUT_MS = 10000;
  const withTimeout = (promise) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("feed timeout")), HARD_TIMEOUT_MS)
      ),
    ]);

  const results = await Promise.allSettled(
    feeds.map((f) =>
      withTimeout(parser.parseURL(f.url)).then((parsed) => ({
        feed: f,
        items: parsed.items || [],
      }))
    )
  );

  const seen = new Set();
  const out = [];
  const feedStatus = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled") {
      feedStatus.push({ name: feeds[i].name, ok: false });
      continue;
    }
    feedStatus.push({ name: feeds[i].name, ok: true, count: r.value.items.length });
    for (const j of r.value.items) {
      const link = String(j.link || j.guid || "").trim();
      if (!link) continue;
      const key = link.replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#].*$/, "").toLowerCase();
      if (seen.has(key)) continue;
      const pub = pubMs(j);
      // Keep undated items (some feeds omit dates) but drop clearly-old ones.
      if (pub && pub < cutoff) continue;
      seen.add(key);
      out.push({
        source_url: link,
        title: String(j.title || "").trim(),
        snippet: cleanSnippet(j),
        source_name: hostSource(link, r.value.feed.name),
        published: pub ? new Date(pub).toISOString() : "",
        published_ms: pub,
      });
    }
  }

  out.sort((a, b) => (b.published_ms || 0) - (a.published_ms || 0));
  return { items: out.slice(0, limit), feedStatus };
}
