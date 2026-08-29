// Real news ingest for the Topic Engine. Instead of asking an LLM to "search"
// (which guesses at recency and repeats), we pull real, dated articles from
// trusted immigration RSS/Atom feeds — the same approach as the n8n
// "News Ingest" workflow — then hand the fresh, real items to the model only to
// write the Farsi hooks.
//
// Feeds are fetched in parallel and per-feed failures are swallowed, so one
// dead feed never breaks the batch. Extra feeds can be added at runtime via the
// NEWS_FEED_URLS env var (comma-separated), X/Twitter accounts via X_FEED_URLS
// (comma-separated RSS URLs, e.g. from RSS.app), and YouTube channels via
// YOUTUBE_FEED_URLS (any YouTube URL — video, @handle or channel; the channel
// is resolved automatically) — all without a code change.

import Parser from "rss-parser";

// Curated, real immigration feeds. The first three are the ones already proven
// in the n8n workflow; the rest are reputable additions. Any that 404 or time
// out are skipped silently, so it is safe to keep a broad list here.
// Google News search feeds are the single strongest lever for breadth and
// freshness: free, no API key, and they aggregate hundreds of outlets we could
// never subscribe to individually. `when:30d` bounds each query at the source.
// One query per beat keeps each result set on-topic instead of one broad query
// whose top results are always the same big stories.
const GNEWS = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:30d")}&hl=en-CA&gl=CA&ceid=CA:en`;

const CORE_FEEDS = [
  // ── Dedicated immigration outlets ──────────────────────────────────────
  { url: "https://www.cicnews.com/feed", name: "CIC News" },
  { url: "https://immigrationnewscanada.ca/feed/", name: "Immigration News Canada" },
  {
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=departmentofcitizenshipandimmigration&sort=publishedDate&orderBy=desc&pick=25&format=atom",
    name: "IRCC",
  },
  { url: "https://www.canadim.com/feed/", name: "Canadim" },
  { url: "https://canadianimmigrant.ca/feed", name: "Canadian Immigrant" },
  { url: "https://www.immigration.ca/feed/", name: "Immigration.ca" },
  { url: "https://www.cimmigrationnews.com/feed/", name: "CI News" },
  { url: "https://www.schengenvisainfo.com/news/feed/", name: "SchengenVisaInfo" },
  { url: "https://www.imi-daily.com/feed/", name: "IMI Daily" },

  // ── Per-beat Google News queries ───────────────────────────────────────
  // Each one mines a different vein, so a quiet week in one beat does not
  // empty the whole deck.
  { url: GNEWS('"canada immigration" policy OR rules OR changes'), name: "Google News" },
  { url: GNEWS("IRCC announcement OR update OR memo"), name: "Google News" },
  { url: GNEWS('"study permit" OR PGWP OR "international students" canada'), name: "Google News" },
  { url: GNEWS('"work permit" OR LMIA OR "temporary foreign worker" canada'), name: "Google News" },
  { url: GNEWS('"provincial nominee" OR PNP OR "BC PNP" OR OINP canada'), name: "Google News" },
  { url: GNEWS("canada immigration processing times OR backlog OR fees"), name: "Google News" },
  { url: GNEWS('canada immigration "federal court" OR ruling OR lawsuit'), name: "Google News" },
  { url: GNEWS("canada sponsorship OR spousal OR parents grandparents immigration"), name: "Google News" },
  { url: GNEWS("citizenship canada rules OR test OR oath changes"), name: "Google News" },
  // Europe lane — uncontested white space for the brand.
  { url: GNEWS("germany opportunity card OR skilled worker visa"), name: "Google News" },
  { url: GNEWS("europe OR portugal OR netherlands OR spain residence permit visa changes"), name: "Google News" },
  { url: GNEWS("schengen visa rules OR EU blue card changes"), name: "Google News" },
  // Iranian-audience angle — passports, sanctions, consular access.
  { url: GNEWS("iranian OR iran visa OR immigration canada OR europe"), name: "Google News" },
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

export function allFeeds() {
  return [
    ...CORE_FEEDS,
    ...envFeeds("NEWS_FEED_URLS", "News"),
    // X/Twitter accounts (via an RSS bridge URL configured in env).
    ...envFeeds("X_FEED_URLS", "X"),
  ];
}

// ── YouTube ──────────────────────────────────────────────────────────────────
// Immigration lawyers and consultants often break down a change on YouTube
// before the written outlets cover it, and every channel exposes a free RSS
// feed — no API key, no quota.
//
// That feed is keyed by channel_id (UC…), which is not visible in a normal
// YouTube URL. Rather than make anyone hunt one down, ANY YouTube URL works
// here — a video link, an @handle, or a channel page — and the channel_id is
// resolved at runtime and cached. Add more via YOUTUBE_FEED_URLS.
const YOUTUBE_SOURCES = [
  "https://youtu.be/2PoyUt8oH1A",
  "https://youtu.be/6PK_EXszNrg",
  "https://youtu.be/s4ZhP7XFufM",
  "https://youtu.be/I0X2UpWpUpI",
];

const _ytFeedCache = new Map(); // input URL -> resolved RSS URL (or null)

function youtubeFeedFromChannelId(id) {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${id}`;
}

// Resolve any YouTube URL to that channel's RSS feed. Returns null if the page
// cannot be read or holds no channel id — the source is then simply skipped,
// exactly like an unreachable feed.
export async function resolveYouTubeFeed(input, { timeoutMs = 8000 } = {}) {
  const url = String(input || "").trim();
  if (!url) return null;
  if (_ytFeedCache.has(url)) return _ytFeedCache.get(url);

  let resolved = null;
  try {
    // Already a feed, or a /channel/UC… URL — no lookup needed.
    if (/\/feeds\/videos\.xml/.test(url)) {
      resolved = url;
    } else {
      const direct = url.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
      if (direct) {
        resolved = youtubeFeedFromChannelId(direct[1]);
      } else {
        // youtu.be/<id> short links -> a normal watch URL.
        const short = url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/);
        const page = short ? `https://www.youtube.com/watch?v=${short[1]}` : url;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(page, {
          signal: ctrl.signal,
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
            "Accept-Language": "en-CA,en;q=0.9",
          },
        });
        clearTimeout(timer);
        if (res.ok) {
          const html = await res.text();
          const m =
            html.match(/"channelId":"(UC[A-Za-z0-9_-]{22})"/) ||
            html.match(/"externalId":"(UC[A-Za-z0-9_-]{22})"/) ||
            html.match(/itemprop="channelId"\s+content="(UC[A-Za-z0-9_-]{22})"/) ||
            html.match(/\/channel\/(UC[A-Za-z0-9_-]{22})/);
          if (m) resolved = youtubeFeedFromChannelId(m[1]);
        }
      }
    }
  } catch (_) {
    resolved = null;
  }
  _ytFeedCache.set(url, resolved);
  return resolved;
}

function youtubeInputs() {
  const extra = (process.env.YOUTUBE_FEED_URLS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  return [...new Set([...YOUTUBE_SOURCES, ...extra])];
}

// Feed list including YouTube, whose entries need an async lookup first.
// Unresolvable YouTube sources are dropped rather than surfaced as dead feeds.
export async function resolvedFeeds() {
  const yt = await Promise.all(
    youtubeInputs().map(async (u) => {
      const feed = await resolveYouTubeFeed(u);
      return feed ? { url: feed, name: "YouTube", from: u } : null;
    })
  );
  return [...allFeeds(), ...yt.filter(Boolean)];
}

const parser = new Parser({
  timeout: 9000,
  // YouTube's Atom feed carries the video description in media:group, not in
  // the standard content/summary fields, so ask for it explicitly — without it
  // every video item would reach the model as a bare title.
  customFields: {
    item: [
      ["media:group", "mediaGroup"],
      ["media:description", "mediaDescription"],
    ],
  },
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
      "youtube.com": "YouTube",
      "youtu.be": "YouTube",
      "x.com": "X",
      "twitter.com": "X",
      "nitter.net": "X",
    };
    return map[host] || fallback || host;
  } catch (_) {
    return fallback || "news";
  }
}

function mediaDescription(j) {
  const g = j.mediaGroup || {};
  const d = g["media:description"] || j.mediaDescription || j["media:description"];
  if (!d) return "";
  if (Array.isArray(d)) return String(d[0] && d[0]._ ? d[0]._ : d[0] || "");
  if (typeof d === "object") return String(d._ || "");
  return String(d);
}

function hostOf(u) {
  try {
    return new URL(u).hostname;
  } catch (_) {
    return "";
  }
}

function cleanSnippet(j) {
  const raw = (
    j.contentSnippet ||
    j.content ||
    j.summary ||
    j["content:encoded"] ||
    mediaDescription(j) ||
    ""
  ).toString();
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

// Content-free items — media advisories, "minister to make an announcement",
// readouts, photo ops. These have NO substance to build a real topic/script
// on, so drop them at ingest (they're the #1 cause of invented content).
function isContentFree(title, snippet) {
  const t = (String(title || "") + " " + String(snippet || "")).toLowerCase();
  return (
    /to make an?\s+announcement|will make an?\s+announcement|to make announcements/.test(t) ||
    /media advisory|notice to media|media availability|photo opportunity|photo op\b|readout/.test(t) ||
    /minister[^.]*\bto\s+(visit|attend|hold|deliver remarks|participate|travel)/.test(t)
  );
}

// Four outlets covering the SAME announcement is the main reason the deck felt
// repetitive: URL dedupe cannot catch it, because each outlet has its own URL
// and its own headline wording. So compare stories by their content words and
// collapse near-identical ones, keeping whichever we saw first (the feed list
// is ordered newest-first, so that is the freshest telling of the story).
const STOPWORDS = new Set(
  ("a an the of for to in on at by with from as is are was were be been and or " +
   "new news says say said will would can could may might this that these those " +
   "canada canadian canadas immigration immigrants immigrant update updates").split(" ")
);

function storyTokens(title) {
  return new Set(
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

// Overlap coefficient (shared / smaller set), NOT Jaccard: outlets rewrite the
// same announcement at different headline lengths, and Jaccard punishes that
// length difference so hard that real duplicates slipped through. Requiring a
// minimum of 4 shared distinctive words stops false merges: two stories on the
// same subject but a DIFFERENT development ("study permit cap cut" vs "study
// permit cap challenged in court") overlap on the subject nouns only, while a
// genuine duplicate also shares the action word. Erring toward keeping both is
// deliberate — a duplicate card costs a scroll, a wrongly-dropped story costs a
// topic, and running short on topics is the problem being solved here.
function sameStory(aTokens, bTokens, threshold = 0.42, minShared = 4) {
  if (aTokens.size < 4 || bTokens.size < 4) return false;
  let shared = 0;
  for (const t of aTokens) if (bTokens.has(t)) shared++;
  if (shared < minShared) return false;
  return shared / Math.min(aTokens.size, bTokens.size) >= threshold;
}

function isVideo(link) {
  const h = hostOf(link);
  return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(h);
}

// Video descriptions are frequently pure promotion (booking links, socials,
// timestamps). Strip that scaffolding, drop the sentences that are calls to
// action, and measure what real prose is left. Counting promo mentions as a
// ratio was the wrong test: a genuinely substantive description often signs
// off with "book a consultation", and that one phrase should not discard it.
const PROMO_RE =
  /(subscribe|book a|booking|consultation|follow us|link in bio|dm us|whatsapp|instagram|telegram|join our|sign up)/i;

function hasUsableVideoText(snippet) {
  const cleaned = String(snippet || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*\d{1,2}:\d{2}.*$/gm, " ") // chapter timestamps
    .replace(/[#@]\w+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const prose = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((sentence) => sentence.trim() && !PROMO_RE.test(sentence))
    .join(" ")
    .trim();
  return prose.length >= 140 && prose.split(/\s+/).length >= 25;
}

// Fetch a real article's readable text so scripts/articles are grounded in the
// actual source instead of a thin headline. Short in-memory cache so the fa+en
// script calls (and article gen) don't re-fetch the same URL. Hard timeout;
// failures return "" (caller degrades to the snippet).
const _articleCache = new Map(); // url -> { text, ts }
const ARTICLE_TTL_MS = 10 * 60 * 1000;

export async function fetchArticleText(url, { timeoutMs = 8000, maxChars = 4500 } = {}) {
  if (!url) return "";
  // A YouTube watch page is a JavaScript shell — scraping it yields player
  // config and boilerplate, not what the video says. Returning "" makes the
  // caller fall back to the video description from the feed, which is real
  // text. Handing the model page scaffolding would invite invented facts.
  if (/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(hostOf(url))) return "";
  const cached = _articleCache.get(url);
  if (cached && Date.now() - cached.ts < ARTICLE_TTL_MS) return cached.text;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SugimotoTopicBot/1.0; +https://sugimotovisa.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const html = await res.text();
    // Prefer the main/article region to cut nav/footer noise.
    const region =
      (html.match(/<main[\s\S]*?<\/main>/i) || [])[0] ||
      (html.match(/<article[\s\S]*?<\/article>/i) || [])[0] ||
      html;
    const text = region
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#?\w+;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
    _articleCache.set(url, { text, ts: Date.now() });
    return text;
  } catch (_) {
    return "";
  }
}

// Pull fresh, deduped, recent articles across all feeds.
//   maxAgeDays : drop anything older than this by its real published date
//   limit      : max items returned (newest first)
//   isSeen     : optional (item) => bool. Applied BEFORE `limit`, so already-used
//                articles never occupy slots in the returned window. Filtering
//                after the cap is what made the deck run dry: the newest N were
//                a fixed set that slowly filled up with articles already used,
//                and nothing older could ever move up to replace them.
// `nowMs` is injected (never read the clock inside) so callers control "now".
export async function fetchNews({
  maxAgeDays = 30,
  limit = 120,
  nowMs = Date.now(),
  isSeen = null,
} = {}) {
  const feeds = await resolvedFeeds();
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
  let skippedSeen = 0;
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
      const title = String(j.title || "").trim();
      const snippet = cleanSnippet(j);
      // Drop content-free advisories (they cause invented topics/scripts).
      if (isContentFree(title, snippet)) continue;
      // A video is the one source we cannot enrich later: fetchArticleText
      // deliberately refuses YouTube pages, so whatever the description holds
      // is ALL the grounding there will ever be. A promo-only or empty
      // description would leave the model with just a title to build on, which
      // is how invented facts get in. Require real substance instead.
      if (isVideo(link) && !hasUsableVideoText(snippet)) continue;
      seen.add(key);
      const item = {
        source_url: link,
        title,
        snippet,
        source_name: hostSource(link, r.value.feed.name),
        published: pub ? new Date(pub).toISOString() : "",
        published_ms: pub,
      };
      // Drop already-used articles here, BEFORE the newest-N cap below.
      if (isSeen && isSeen(item)) {
        skippedSeen++;
        continue;
      }
      out.push(item);
    }
  }

  out.sort((a, b) => (b.published_ms || 0) - (a.published_ms || 0));

  // Collapse the same story told by different outlets (newest copy wins,
  // because `out` is already sorted newest-first).
  // Publish dates disambiguate the one case headlines cannot: recurring
  // headline patterns. "BC PNP draw targets healthcare workers" and "...targets
  // construction workers" are near-identical wording but different draws weeks
  // apart, whereas outlets covering one announcement all publish within days.
  const MERGE_WINDOW_MS = 4 * 24 * 3600 * 1000;
  const unique = [];
  const kept = [];
  let collapsed = 0;
  for (const item of out) {
    const tk = storyTokens(item.title);
    const dup = kept.some((prev) => {
      if (
        item.published_ms &&
        prev.ms &&
        Math.abs(item.published_ms - prev.ms) > MERGE_WINDOW_MS
      ) {
        return false; // too far apart in time to be the same announcement
      }
      return sameStory(tk, prev.tokens);
    });
    if (dup) {
      collapsed++;
      continue;
    }
    kept.push({ tokens: tk, ms: item.published_ms });
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return {
    items: unique,
    feedStatus,
    stats: {
      fetched: out.length + skippedSeen,
      alreadyUsed: skippedSeen,
      duplicateStories: collapsed,
      usable: unique.length,
      feedsOk: feedStatus.filter((f) => f.ok).length,
      feedsTotal: feedStatus.length,
    },
  };
}

// Per-feed health check for /api/feeds. Feed failures are swallowed during
// normal ingest (one dead feed must never break a batch), which also means a
// feed can quietly rot for months. This reports each one individually.
export async function checkFeeds({ nowMs = Date.now() } = {}) {
  const feeds = await resolvedFeeds();
  const HARD_TIMEOUT_MS = 12000;
  const results = await Promise.allSettled(
    feeds.map((f) =>
      Promise.race([
        parser.parseURL(f.url),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), HARD_TIMEOUT_MS)),
      ])
    )
  );
  return feeds.map((f, i) => {
    const r = results[i];
    if (r.status !== "fulfilled") {
      return {
        name: f.name,
        url: f.url,
        from: f.from || "",
        ok: false,
        error: String(r.reason?.message || r.reason),
      };
    }
    const items = r.value.items || [];
    const ages = items
      .map((j) => pubMs(j))
      .filter(Boolean)
      .map((ms) => Math.floor((nowMs - ms) / 86400000));
    return {
      name: f.name,
      url: f.url,
      from: f.from || "",
      // For YouTube this is the channel name, so a mis-resolved link is visible.
      title: r.value.title || "",
      ok: true,
      items: items.length,
      within30d: ages.filter((a) => a <= 30).length,
      newestDays: ages.length ? Math.min(...ages) : null,
    };
  });
}
