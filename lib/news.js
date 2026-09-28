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
import { CORE_FEEDS, YOUTUBE_SOURCES } from "./feeds.js";

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
  // YouTube's Atom feed carries the video description in media:group, not in
  // the standard content/summary fields, so ask for it explicitly — without it
  // every video item would reach the model as a bare title.
  customFields: {
    item: [
      ["media:group", "mediaGroup"],
      ["media:description", "mediaDescription"],
    ],
  },
});

// Feeds are fetched with our own fetch and handed to the parser as text, for
// two reasons. The old self-identifying bot user agent is exactly what
// Cloudflare-fronted outlets block from datacenter IPs, so present as a normal
// browser. And a failed fetch now reports its real HTTP status, so /api/feeds
// and the harvest log say "HTTP 403" instead of an opaque parser error.
const FEED_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
  "Accept-Language": "en-CA,en;q=0.9",
};

async function loadFeed(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: FEED_HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return await parser.parseString(xml);
  } catch (e) {
    if (e && e.name === "AbortError") throw new Error("timeout");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}


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

export function isGoogleNews(link) {
  return /(^|\.)news\.google\.com$/.test(hostOf(link));
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

// Identity of an ARTICLE: host + path. The original key stripped the path and
// kept only the hostname, so every feed yielded exactly one article per
// website — all the Google News queries together contributed ONE item, which
// is why the deck held at ~2 cards no matter how much news had appeared.
export function articleKey(link) {
  const s = String(link || "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return (u.hostname.replace(/^www\./, "") + u.pathname).replace(/\/+$/, "").toLowerCase();
  } catch (_) {
    return s.toLowerCase();
  }
}

// The brand's own blog is fetched as a feed so the engine knows what has
// already been covered — never to suggest our own articles back as topics.
export function isOwnSite(link) {
  return /(^|\.)sugimotovisa\.com$/.test(hostOf(link));
}

// Every usable item from every feed, normalised and filtered for substance,
// with NO seen-filter, cap or story-collapse — the raw material shared by the
// live topic path and the scheduled harvester.
export async function fetchFeedItems({ maxAgeDays = 30, nowMs = Date.now() } = {}) {
  const feeds = await resolvedFeeds();
  const cutoff = nowMs - maxAgeDays * 24 * 3600 * 1000;
  const results = await Promise.allSettled(feeds.map((f) => loadFeed(f.url)));

  const byKey = new Map();
  const ownTitles = [];
  const feedStatus = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const feed = feeds[i];
    if (r.status !== "fulfilled") {
      feedStatus.push({ name: feed.name, url: feed.url, ok: false, error: String(r.reason?.message || r.reason) });
      continue;
    }
    const items = r.value.items || [];
    feedStatus.push({ name: feed.name, url: feed.url, ok: true, count: items.length });
    for (const j of items) {
      const link = String(j.link || j.guid || "").trim();
      const key = articleKey(link);
      if (!key || byKey.has(key)) continue;
      let title = String(j.title || "").trim();
      if (!title) continue;
      // Checked before the age cutoff: something the brand already published
      // stays "covered" however long ago it went up.
      if (isOwnSite(link)) {
        ownTitles.push(title);
        continue;
      }
      const pub = pubMs(j);
      // Keep undated items (some feeds omit dates) but drop clearly-old ones.
      if (pub && pub < cutoff) continue;
      let snippet = cleanSnippet(j);
      let sourceName = hostSource(link, feed.name);
      // Google News glues the outlet onto the headline ("... - CBC News") and
      // its description is just that headline again. Split the outlet out so
      // cards name the real publisher, and treat the echo as NO snippet, so
      // nothing downstream mistakes a repeated headline for article text.
      if (isGoogleNews(link)) {
        const m = title.match(/^(.*\S)\s+-\s+([^-]{2,60})$/);
        if (m) {
          title = m[1];
          sourceName = m[2].trim();
        }
        const probe = title.slice(0, 40).toLowerCase();
        if (!snippet || snippet.toLowerCase().includes(probe)) snippet = "";
      }
      // Drop content-free advisories (they cause invented topics/scripts).
      if (isContentFree(title, snippet)) continue;
      // A video is the one source we cannot enrich later: fetchArticleText
      // deliberately refuses YouTube pages, so whatever the description holds
      // is ALL the grounding there will ever be. A promo-only or empty
      // description would leave the model with just a title to build on, which
      // is how invented facts get in. Require real substance instead.
      if (isVideo(link) && !hasUsableVideoText(snippet)) continue;
      byKey.set(key, {
        key,
        source_url: link,
        title,
        snippet,
        source_name: sourceName,
        published: pub ? new Date(pub).toISOString() : "",
        published_ms: pub,
        // From a keyword search over the whole web rather than a dedicated
        // immigration source, so scope has to be checked, not assumed.
        broad: isGoogleNews(link),
      });
    }
  }
  return { items: [...byKey.values()], ownTitles, feedStatus };
}

// Collapse the same story told by different outlets. Callers pass items sorted
// newest-first, so the freshest telling of each story is the one kept.
// Publish dates disambiguate the one case headlines cannot: recurring
// headline patterns. "BC PNP draw targets healthcare workers" and "...targets
// construction workers" are near-identical wording but different draws weeks
// apart, whereas outlets covering one announcement all publish within days.
export function collapseStories(items, limit = Infinity) {
  const MERGE_WINDOW_MS = 4 * 24 * 3600 * 1000;
  const unique = [];
  const kept = [];
  let collapsed = 0;
  for (const item of items) {
    const tk = storyTokens(item.title);
    const dup = kept.some((prev) => {
      if (item.published_ms && prev.ms && Math.abs(item.published_ms - prev.ms) > MERGE_WINDOW_MS) {
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
  return { items: unique, collapsed };
}

// Per-feed health check for /api/feeds. Feed failures are swallowed during
// normal ingest (one dead feed must never break a batch), which also means a
// feed can quietly rot for months. This reports each one individually.
export async function checkFeeds({ nowMs = Date.now() } = {}) {
  const feeds = await resolvedFeeds();
  const results = await Promise.allSettled(feeds.map((f) => loadFeed(f.url, 12000)));
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
