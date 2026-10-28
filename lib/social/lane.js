// The social lane (Hamed, Oct 27 2026): every post of the accounts the team follows becomes a
// topic card within minutes, without waiting for the two-hourly harvest or the editor model's
// pick. Before it, a creator's reel reached the deck only if the selector chose it from a
// 160-character brief, which for Instagram and Facebook posts was the cover picture read as text;
// one social card a day came of nine active accounts.
//
// Every few minutes (SOCIAL_LANE_MINUTES, default 5: lane-clock.js calls /api/social-lane/tick;
// the keep-awake call and /api/social-lane?poll=1 poll too) the rss.app social feeds and the Instagram creators are read. A post
// not seen before is grounded on what it really holds — a video's transcript (Supadata), the
// page it links to, else its caption — and the writing model makes one card per post, or says
// why the post holds nothing (an ad, a testimonial, a greeting, a draw result). Cards go to the
// front of the deck at once and are remembered so the main run never writes them again.
//
// Costs are capped per day: cards (SOCIAL_LANE_MAX_PER_DAY, 40), cards per account (6) and
// transcripts (SOCIAL_LANE_MAX_TRANSCRIPTS, 40). What was seen and the cards themselves are kept
// on the editing-data branch (social/lane.json), so a deploy neither repeats nor loses them.

import { fetchFeedItems, socialFeeds, fetchArticleText, articleKey, isReadableText, dropDisclaimers } from "../news.js";
import { getInstagramItems } from "./instagram.js";
import { relevance, isDrawResult, isDrawCard } from "../candidates.js";
import { videoTranscript, transcriptsEnabled, transcriptCredits, transcriptWays, transcriptWay, supadataEnabled } from "../video-transcript.js";
import { creatorCardsPrompt, parseTopics } from "../prompts.js";
import { glossaryBlock } from "../glossary.js";
import { openaiEnabled, openaiRewrite } from "../openai.js";
import { callClaude } from "../anthropic.js";
import { cleanText } from "../clean-text.js";
import { saveRecord } from "../workspace.js";

const POST_AGE_MS = 3 * 24 * 3600 * 1000; // a post older than this is not news any more
const KEEP_CARDS_MS = 7 * 24 * 3600 * 1000;
const MAX_CARDS_KEPT = 200;
const MAX_SEEN_KEPT = 800;
const PER_POLL = 8; // posts handled per poll; the rest wait five minutes (keeps a backlog gentle)
const WRITE_BATCH = 3;
const STORE_PATH = "social/lane.json";

const S =
  globalThis.__sugimotoSocialLane ||
  (globalThis.__sugimotoSocialLane = {
    cards: [],
    seen: new Map(), // post key -> { ts, why }
    loaded: false,
    loading: null,
    polling: null,
    sha: null,
    lastPoll: 0,
    lastError: "",
    day: "",
    made: 0,
    transcripts: 0,
    byAuthor: {},
    ways: {}, // today's transcripts by way: groq / openai / supadata
    log: [],
    feeds: [],
    transcriptsPausedUntil: 0,
  });

const num = (name, dflt) => Number(process.env[name]) || dflt;
export function laneEnabled() {
  return process.env.SOCIAL_LANE !== "off" && (openaiEnabled() || !!process.env.ANTHROPIC_API_KEY);
}

async function rewrite(prompt, maxTokens) {
  if (openaiEnabled()) {
    try {
      return await openaiRewrite(prompt);
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
    }
  }
  return callClaude([{ role: "user", content: prompt }], false, maxTokens);
}

// ── durable state (editing-data branch) ───────────────────────────────────────
async function store() {
  try {
    const m = await import("../editing/store.js");
    return m.storeConfigured() ? m : null;
  } catch (_) {
    return null;
  }
}

async function load() {
  if (S.loaded) return;
  if (!S.loading) {
    S.loading = (async () => {
      const st = await store();
      if (st) {
        try {
          const cur = await st.get(STORE_PATH);
          if (cur && cur.data) {
            S.sha = cur.sha;
            for (const [k, ts, why] of cur.data.seen || []) S.seen.set(k, { ts, why });
            S.cards = (cur.data.cards || []).filter((c) => c && c.title_fa);
          }
        } catch (e) {
          console.log("[social lane] state not read:", String(e.message || e));
        }
      }
      S.loaded = true;
    })().finally(() => (S.loading = null));
  }
  await S.loading;
}

async function persist() {
  const st = await store();
  if (!st) return;
  const seen = [...S.seen.entries()]
    .sort((a, b) => b[1].ts - a[1].ts)
    .slice(0, MAX_SEEN_KEPT)
    .map(([k, v]) => [k, v.ts, v.why || ""]);
  const data = { updated: new Date().toISOString(), seen, cards: S.cards.slice(0, MAX_CARDS_KEPT) };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await st.put(STORE_PATH, data, S.sha, "app: social lane");
      const cur = await st.get(STORE_PATH).catch(() => null);
      S.sha = cur ? cur.sha : null;
      return;
    } catch (e) {
      // Another instance wrote meanwhile: take its version's id and write again.
      const cur = await st.get(STORE_PATH).catch(() => null);
      S.sha = cur ? cur.sha : null;
      if (attempt) console.log("[social lane] state not saved:", String(e.message || e));
    }
  }
}

// ── reading the accounts ──────────────────────────────────────────────────────
async function freshPosts(nowMs) {
  const feeds = await socialFeeds();
  const out = new Map();
  let feedStatus = [];
  if (feeds.length) {
    const r = await fetchFeedItems({ maxAgeDays: 3, nowMs, feeds }).catch((e) => {
      S.lastError = "feeds: " + String(e.message || e);
      return null;
    });
    if (r) {
      feedStatus = r.feedStatus;
      for (const it of r.items) if (it.social) out.set(it.key, it);
    }
  }
  // The Instagram creators (official API / Apify): captions, and which posts are reels.
  const ig = await getInstagramItems({ maxAgeDays: 3, wait: true }).catch(() => ({ items: [] }));
  for (const it of ig.items || []) {
    const key = it.key || articleKey(it.source_url);
    if (!key) continue;
    const have = out.get(key);
    // The same reel from rss.app and from Meta: Meta's copy knows the file and whether it is a video.
    if (have) {
      if (it.video && !have.video) have.video = true;
      if (it.video_url && !have.video_url) have.video_url = it.video_url;
      if (!have.lang && it.lang) have.lang = it.lang;
      continue;
    }
    out.set(key, { ...it, key, snippet: dropDisclaimers(it.snippet || ""), title: dropDisclaimers(it.title || "") || it.title });
  }
  S.feeds = feedStatus.map((f) => ({ name: f.name, ok: f.ok, count: f.count || 0, error: f.error || "" }));
  return [...out.values()].filter((p) => p.published_ms && p.published_ms >= nowMs - POST_AGE_MS).sort((a, b) => b.published_ms - a.published_ms);
}

const PROMO_ONLY = /(book|reserve|schedule)\s+(a\s+|your\s+)?(free\s+)?(consult|call|appointment)|رزرو\s*(وقت|مشاوره)|وقت\s*مشاوره|لینک\s*بایو|link in bio|dm\s+(us|me)|دایرکت|تخفیف|giveaway|webinar|وبینار|congrat|تبریک|قبولی\s+(ویزا|موکل)|موفقیت.{0,20}(موکل|این هفته)|happy clients|testimonial/i;

function quickSkip(p) {
  const text = `${p.title || ""} ${p.snippet || ""}`;
  if (isDrawResult(p)) return "draw result";
  const letters = String(p.title || "").replace(/[^\p{L}\p{N}]/gu, "").length;
  if (!p.video && !p.resolved_url && letters < 12) return "nothing in the post";
  if (!p.video && PROMO_ONLY.test(text) && relevance(p) < 3) return "promotion";
  if (!p.video && !p.resolved_url && relevance(p) === 0) return "off-topic";
  return "";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function dayCounters() {
  const d = today();
  if (S.day !== d) Object.assign(S, { day: d, made: 0, transcripts: 0, byAuthor: {}, ways: {} });
}

// What the post really says: transcript, linked page, caption — in that order of worth.
async function ground(p) {
  const parts = [];
  let how = "caption";
  if (p.video && transcriptsEnabled() && S.transcripts < num("SOCIAL_LANE_MAX_TRANSCRIPTS", 40) && (Date.now() >= S.transcriptsPausedUntil || transcriptWays().some((w) => w !== "supadata"))) {
    S.transcripts++;
    const lang = p.lang || (/[؀-ۿ]/.test(`${p.title || ""} ${p.snippet || ""}`) ? "fa" : "");
    const t = await videoTranscript(p.source_url, { waitMs: 120000, video_url: p.video_url || "", lang }).catch((e) => {
      const msg = String(e.message || e);
      console.log("[social lane] transcript failed:", p.source_url, msg.slice(0, 120));
      // "Limit Exceeded" is either the rate (already retried) or the month's credits. Only when
      // the credits are spent is there no point asking again for a while; videos are written from
      // their captions meanwhile and the status page says so.
      if (/limit exceeded|quota|too many requests|402|429/i.test(msg)) S.limitHit = true;
      return "";
    });
    if (S.limitHit) {
      S.limitHit = false;
      const c = await transcriptCredits({ fresh: true });
      if (c && c.used >= c.max) S.transcriptsPausedUntil = Date.now() + 3 * 60 * 60 * 1000;
    }
    if (!t) S.ways.none = (S.ways.none || 0) + 1;
    if (t && isReadableText(t)) {
      parts.push("[Video transcript]\n" + t.slice(0, 6000));
      how = "transcript";
      S.ways[transcriptWay(p.source_url) || "?"] = (S.ways[transcriptWay(p.source_url) || "?"] || 0) + 1;
      // The script and article steps read the same words later without paying for them again.
      if (t.length > 1200) saveRecord({ id: "transcript:" + articleKey(p.source_url), type: "transcript", url: p.source_url, text: t.slice(0, 12000) }).catch(() => {});
    }
  }
  if (p.resolved_url) {
    const page = await fetchArticleText(p.resolved_url, { timeoutMs: 10000, maxChars: 3000 }).catch(() => "");
    if (page) {
      parts.push("[Linked page: " + p.resolved_url + "]\n" + page);
      if (how === "caption") how = "page";
    }
  }
  const caption = String(p.snippet || "").trim();
  if (caption && !parts.some((x) => x.includes(caption.slice(0, 80)))) parts.push("[Caption]\n" + caption);
  return { text: parts.join("\n\n"), how };
}

function toCard(p, w, g) {
  const title_fa = cleanText(String(w.title_fa || "")).trim();
  if (!title_fa) return null;
  return {
    title_fa,
    title_en: cleanText(String(w.title_en || p.title || "")).trim().slice(0, 140),
    field: w.field || "Policy",
    page: w.page === "EU" ? "EU" : "CA",
    why_now: cleanText(String(w.why_now || "")).trim(),
    date: p.published ? p.published.slice(0, 10) : today(),
    source_url: p.source_url,
    source_name: p.source_name,
    source_title: p.title || "",
    snippet: g.text.slice(0, 1500),
    grounding: g.how === "caption" && g.text.length < 200 ? "headline" : "full",
    score: Math.min(98, Math.max(60, Number(w.score) || 72)),
    social: p.social,
    author: p.author,
    ...(p.video ? { video: true } : {}),
    ...(p.outlier >= 2 ? { outlier: p.outlier } : {}),
    lane: true,
    _ts: Date.now(),
  };
}

async function writeCards(batch, log) {
  const prompt = creatorCardsPrompt(batch.map(({ p, g }) => ({ ...p, groundText: g.text })), today()) + (await glossaryBlock("fa"));
  let written = [];
  try {
    written = parseTopics(await rewrite(prompt, 1800)) || [];
  } catch (e) {
    S.lastError = "write: " + String(e.message || e);
    console.log("[social lane] write failed:", S.lastError);
    // Not marked seen: the next poll tries these posts again.
    return;
  }
  const done = new Set();
  for (const w of written) {
    const i = Number(w.id);
    if (!Number.isInteger(i) || !batch[i] || done.has(i)) continue;
    done.add(i);
    const { p, g } = batch[i];
    let why = "";
    if (w.skip) why = "model: " + String(w.reason || "nothing to cover").slice(0, 80);
    const card = why ? null : toCard(p, w, g);
    if (!why && !card) why = "model: no title";
    if (!why && isDrawCard(card)) why = "draw result";
    if (!why && (S.byAuthor[p.author] || 0) >= num("SOCIAL_LANE_MAX_PER_ACCOUNT", 6)) why = "account's daily cap";
    S.seen.set(p.key, { ts: Date.now(), why: why || "card" });
    if (why) {
      log.skipped[why.split(":")[0]] = (log.skipped[why.split(":")[0]] || 0) + 1;
      continue;
    }
    S.cards = [card, ...S.cards.filter((c) => c.source_url !== card.source_url)].slice(0, MAX_CARDS_KEPT);
    S.byAuthor[p.author] = (S.byAuthor[p.author] || 0) + 1;
    S.made++;
    log.made++;
    log.titles.push(card.title_fa);
  }
  // A post the model did not answer for is left for the next poll.
  for (let i = 0; i < batch.length; i++) if (!done.has(i)) log.unanswered++;
}

// ── the poll ──────────────────────────────────────────────────────────────────
export async function pollSocialLane({ reason = "clock" } = {}) {
  if (!laneEnabled()) return laneStatus();
  if (S.polling) return S.polling;
  S.polling = (async () => {
    const nowMs = Date.now();
    const log = { at: new Date(nowMs).toISOString(), reason, posts: 0, fresh: 0, made: 0, unanswered: 0, skipped: {}, titles: [] };
    try {
      await load();
      dayCounters();
      const posts = await freshPosts(nowMs);
      log.posts = posts.length;
      const cardKeys = new Set(S.cards.map((c) => articleKey(c.source_url)));
      const fresh = posts.filter((p) => !S.seen.has(p.key) && !cardKeys.has(p.key));
      log.fresh = fresh.length;
      const room = Math.max(0, num("SOCIAL_LANE_MAX_PER_DAY", 40) - S.made);
      const take = fresh.slice(0, Math.min(PER_POLL, room));
      if (fresh.length && !room) log.skipped["daily cap"] = fresh.length;
      const ready = [];
      for (const p of take) {
        const why = quickSkip(p);
        if (why) {
          S.seen.set(p.key, { ts: nowMs, why });
          log.skipped[why] = (log.skipped[why] || 0) + 1;
          continue;
        }
        const g = await ground(p);
        // Off-topic once what it really says is known (a video's caption is often only emoji).
        if (relevance({ title: p.title, snippet: g.text }) === 0) {
          S.seen.set(p.key, { ts: nowMs, why: "off-topic" });
          log.skipped["off-topic"] = (log.skipped["off-topic"] || 0) + 1;
          continue;
        }
        ready.push({ p, g });
      }
      for (let i = 0; i < ready.length; i += WRITE_BATCH) await writeCards(ready.slice(i, i + WRITE_BATCH), log);
      // Old cards fall off the lane's own list; the page keeps what a person already has.
      S.cards = S.cards.filter((c) => (c._ts || 0) >= nowMs - KEEP_CARDS_MS);
      if (log.made || Object.keys(log.skipped).length) await persist();
      // A failed write (logged by writeCards) stays visible on the status page until a poll writes.
      if (log.made || !/^write:/.test(S.lastError)) S.lastError = "";
    } catch (e) {
      S.lastError = String(e.message || e);
      console.log("[social lane] poll failed:", S.lastError);
    }
    S.lastPoll = Date.now();
    S.log = [log, ...S.log].slice(0, 50);
    if (log.made || log.fresh) console.log("[social lane]", JSON.stringify({ ...log, titles: undefined }));
    return laneStatus();
  })().finally(() => (S.polling = null));
  return S.polling;
}

// The lane's cards for the deck, newest first. After a restart they are on the store until the
// first poll; a deck served before that waits for them (laneReady) instead of showing none.
export function laneCards() {
  if (!S.loaded && !S.loading) load().catch(() => {});
  return S.cards;
}
export async function laneReady() {
  if (!laneEnabled()) return;
  await load().catch(() => {});
}

export function laneStatus() {
  dayCounters();
  transcriptCredits().catch(() => {});
  const c = globalThis.__supadataCredits && globalThis.__supadataCredits.value;
  return {
    transcript_credits: c || null,
    enabled: laneEnabled(),
    transcripts: transcriptsEnabled(),
    transcript_ways: transcriptWays(),
    transcripts_by_way: S.ways,
    supadata: supadataEnabled(),
    transcripts_paused_until: S.transcriptsPausedUntil > Date.now() ? new Date(S.transcriptsPausedUntil).toISOString() : "",
    last_poll: S.lastPoll ? new Date(S.lastPoll).toISOString() : "",
    polling: !!S.polling,
    error: S.lastError,
    today: { date: S.day, cards: S.made, transcripts: S.transcripts, by_account: S.byAuthor },
    cards: S.cards.length,
    seen: S.seen.size,
    feeds: S.feeds,
    log: S.log,
  };
}

