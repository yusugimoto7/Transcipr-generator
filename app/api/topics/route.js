import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiTopics, openaiRewrite } from "../../../lib/openai";
import { sheetEnabled, getSeen, normalizeUrl } from "../../../lib/sheet";
import {
  fetchFeedItems,
  fetchArticleText,
  collapseStories,
  articleKey,
  isGoogleNews,
} from "../../../lib/news";
import { loadHarvest, mergeCandidates, relevance, isDrawResult, sourceTier } from "../../../lib/candidates";
import { resolveGoogleNewsUrl } from "../../../lib/gnews";
import { getInstagramItems } from "../../../lib/social/instagram";
import { getLexbaseItems } from "../../../lib/newsletter/lexbase";
import {
  topicPrompt,
  selectTopicsPrompt,
  writeCardsPrompt,
  parseTopics,
} from "../../../lib/prompts";

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
// Cost guardrails. These were tight when generation ran on (expensive) Claude
// web-search. On OpenAI's cheap search model a generation costs ~$0.02, so the
// limits exist only to stop a runaway loop — they're loose enough that pressing
// "Refresh" always returns fresh topics for a real person.
const FORCE_COOLDOWN_MS = 12 * 1000; // just a double-tap guard on "Refresh"
const MAX_GENERATIONS_PER_HOUR = 60; // hard ceiling on live generations, any trigger
const MAX_GENERATIONS_PER_DAY = 300; // second ceiling — catches a slow-burn runaway an hourly cap alone would miss over 24h

let cache = { topics: null, timestamp: 0, provider: null };
let lastForceAt = 0;
let generationTimestamps = []; // sliding window backing both caps

function underHourlyCap() {
  const hourCutoff = Date.now() - 60 * 60 * 1000;
  const dayCutoff = Date.now() - 24 * 60 * 60 * 1000;
  generationTimestamps = generationTimestamps.filter((t) => t > dayCutoff);
  const lastHour = generationTimestamps.filter((t) => t > hourCutoff).length;
  return lastHour < MAX_GENERATIONS_PER_HOUR && generationTimestamps.length < MAX_GENERATIONS_PER_DAY;
}

const MAX_AGE_DAYS = 30; // drop any dated news older than this — hard recency guard
const NEWS_WINDOW_DAYS = 30; // how far back topics are drawn from
const SELECT_FROM = 70; // candidates shown to the selection call (token cap)
const MAX_CARDS = 14; // cards returned per generation
const MAX_PER_SOURCE = 4; // shortlist slots any one source may take
const MAX_PER_SOURCE_DECK = 2; // cards any one source or creator may take in a deck
const MAX_NEWSLETTER_DECK = 5; // a newsletter issue is many developments, so it may take more
const MAX_CASES = 3; // shortlist slots for individual court decisions
const MAX_SOCIAL = 15; // shortlist slots for creators' posts (news stays the backbone)
const HARVEST_FRESH_MS = 3 * 60 * 60 * 1000; // skip the live fetch if the pool is newer
const GROUND_BUDGET_MS = 12000; // wall-clock cap on fetching text for chosen items
const WRITE_BATCH = 2; // cards per write call; batches run in parallel
const MIN_GROUND = 200; // characters of real text needed to call a card fully grounded

// Why the last generation produced what it did — surfaced in the API response
// so an empty deck explains itself instead of just saying "no new topics".
let lastStats = null;

// Belt-and-suspenders: drop any Express Entry topic even if the model ignored
// the prompt's exclusion (the brand already covers EE draws elsewhere).
function isExpressEntry(t) {
  const field = String(t.field || "").toLowerCase();
  if (field.includes("express")) return true;
  // Only drop items that are actually ABOUT a draw. The old rule killed any
  // topic that merely mentioned Express Entry or CRS in passing — which is a
  // large share of Canadian immigration coverage, including PNP and policy
  // stories the brand does want. Matching on draw language instead keeps those.
  const hay = (
    String(t.title_fa || "") + " " + String(t.title_en || "") + " " + String(t.why_now || "")
  ).toLowerCase();
  return (
    /(express\s*entry|اکسپرس\s*انتری|اکسپرس‌انتری)[^.]{0,40}(draw|round|قرعه|دراو)/.test(hay) ||
    /(draw|round of invitations|قرعه‌کشی)[^.]{0,40}(express\s*entry|اکسپرس)/.test(hay) ||
    /\bcrs\s*(cut[- ]?off|score of|minimum)/.test(hay) ||
    /latest\s+draw|draw\s+results|نتایج\s+قرعه/.test(hay)
  );
}

// Enforce recency deterministically, regardless of what the model returned.
// News topics carry a "date" (YYYY-MM-DD); if that date is older than
// MAX_AGE_DAYS, drop it. Evergreen topics (empty/absent/unparseable date) are
// always kept.
function recentEnough(t, todayStr) {
  const d = String(t.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true; // evergreen / no date
  const dt = Date.parse(d + "T00:00:00Z");
  if (Number.isNaN(dt)) return true;
  const cutoff = Date.parse(todayStr + "T00:00:00Z") - MAX_AGE_DAYS * 86400000;
  return dt >= cutoff;
}

// Per-card checks applied as each card is produced (they used to run once over
// the finished batch): drop Express Entry draws, cards too old, articles
// already used, and duplicates within this run.
function makeAcceptor(today) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  return (t, seenUrlSet) => {
    if (isExpressEntry(t) || !recentEnough(t, today)) return false;
    const uk = normalizeUrl(t.source_url);
    if (uk && seenUrlSet && seenUrlSet.has(uk)) return false;
    const tk = String(t.title_fa || t.title_en || "").trim().toLowerCase();
    if ((uk && seenUrl.has(uk)) || (tk && seenTitle.has(tk))) return false;
    if (uk) seenUrl.add(uk);
    if (tk) seenTitle.add(tk);
    return true;
  };
}

// Primary source: the harvested pool (topped up live when stale). Fallback: the
// old LLM web-search path. Cards are handed to `run.push` one at a time as
// they are written, so a waiting page shows the first card in seconds instead
// of waiting for the whole batch. `cache.provider` records which path ran.
async function generate(clientExclude, run) {
  generationTimestamps.push(Date.now());
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local date
  const nowMs = Date.now();

  // The Sheet is the durable, cross-device record of what was already used.
  // Started now and awaited later, so its round trip overlaps the news load
  // instead of preceding it.
  const seenP = sheetEnabled()
    ? getSeen()
        .then((seen) => ({ urls: new Set(seen.urls.map(normalizeUrl).filter(Boolean)), titles: seen.titles || [] }))
        .catch(() => null) // sheet unreachable — degrade gracefully
    : Promise.resolve(null);
  const accept = makeAcceptor(today);

  let provider = "feeds";
  try {
    const n = await collectFeedTopics({ today, nowMs, clientExclude, seenP, accept, emit: run.push });
    if (n) provider = openaiEnabled() ? "feeds+openai" : "feeds+anthropic";
    console.log(`[topics] ${n} news topics from feeds`);
  } catch (e) {
    console.log("[topics] feed path failed:", String(e?.message || e));
  }

  // Fallback to the LLM web-search path only if the feeds produced nothing.
  if (!run.topics.length) {
    const seen = await seenP;
    const exclude = [...new Set([...(clientExclude || []), ...((seen && seen.titles) || [])])].slice(-100);
    const r = await collectSearchTopics(exclude, today);
    provider = r.provider;
    for (const t of r.list) if (accept(t, seen && seen.urls)) run.push(t);
  }
  if (!run.topics.length) throw new Error("parse"); // nothing usable at all

  // NOTE: topics are NOT logged to the durable Sheet here. A suggested topic is
  // only recorded once the user actually acts on it — an APPROVED topic is sent
  // to /api/seen by the client. This way topics you never reached stay
  // available next run, and the Sheet holds only what you approved.
  cache = { topics: run.topics.slice(), timestamp: Date.now(), provider };
  return cache.topics;
}

// Plain model call used by both topic stages, with the Claude fallback.
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

// Coverage only counts as heat while a story is recent.
function heatWeight(ms, nowMs) {
  if (!ms) return 1;
  const days = (nowMs - ms) / 86400000;
  return days <= 7 ? 3 : days <= 14 ? 1 : 0;
}

function recencyBoost(ms, nowMs) {
  if (!ms) return 2;
  const days = (nowMs - ms) / 86400000;
  return days <= 2 ? 12 : days <= 7 ? 8 : days <= 14 ? 4 : 0;
}

// Real article text for a chosen item, from the harvest if it already has it,
// otherwise fetched now. Google News links are resolved to the publisher first
// — the redirect page itself holds no article text.
async function groundTextFor(item) {
  if (item.text && item.text.length >= MIN_GROUND) return item.text;
  if ((item.snippet || "").length >= MIN_GROUND) return item.snippet;
  // An Instagram post page is a login wall; its caption is all the text there is.
  if (item.social) return "";
  let url = item.resolved_url || "";
  if (!url && isGoogleNews(item.source_url) && item.resolved_url === undefined) {
    url = (await resolveGoogleNewsUrl(item.source_url, { timeoutMs: 6000 })) || "";
    if (url) item.resolved_url = url;
  }
  if (!url && !isGoogleNews(item.source_url)) url = item.source_url;
  if (!url) return "";
  const t = await fetchArticleText(url, { timeoutMs: 8000, maxChars: 1500 });
  return t && t.length >= MIN_GROUND ? t : "";
}

// Candidates come from the harvested pool (accumulated every two hours by
// .github/workflows/harvest.yml), topped up with a live fetch when the pool is
// stale or unreachable. Then: filter -> collapse duplicates -> rank -> model
// SELECTS -> real text fetched for each pick -> model WRITES only from it.
async function collectFeedTopics({ today, nowMs, clientExclude, seenP, accept, emit }) {
  const t0 = Date.now();
  const [harvest, seen, social, lexbase] = await Promise.all([
    loadHarvest(),
    seenP,
    getInstagramItems({ maxAgeDays: NEWS_WINDOW_DAYS, waitMs: 6000 }).catch(() => ({ items: [] })),
    getLexbaseItems({ waitMs: 6000 }).catch(() => ({ items: [] })),
  ]);
  const seenUrlSet = seen ? seen.urls : null;
  const exclude = [...new Set([...(clientExclude || []), ...((seen && seen.titles) || [])])].slice(-100);
  const harvestAge = harvest ? nowMs - Date.parse(harvest.harvested_at || 0) : Infinity;
  const needLive = !(harvestAge < HARVEST_FRESH_MS);
  const live = needLive
    ? await fetchFeedItems({ maxAgeDays: NEWS_WINDOW_DAYS, nowMs }).catch(() => null)
    : null;

  const merged = mergeCandidates(
    harvest ? harvest.items : [],
    [...(live ? live.items : []), ...social.items, ...lexbase.items],
    nowMs
  ).items;
  // The brand's own published titles. They are Farsi and the news is mostly
  // English, so word matching cannot connect the two; they go to the
  // selection model as "already covered", which can.
  const ownTitles = [...((harvest && harvest.own_titles) || []), ...((live && live.ownTitles) || [])];
  const cutoff = nowMs - NEWS_WINDOW_DAYS * 86400000;

  const counts = { alreadyUsed: 0, offTopic: 0, untrusted: 0 };
  const eligible = [];
  for (const c of merged) {
    const t = c.published_ms || Date.parse(c.first_seen || "") || 0;
    if (t && t < (c.newsletter ? cutoff - 15 * 86400000 : cutoff)) continue;
    const keys = [articleKey(c.source_url), articleKey(c.resolved_url)].filter(Boolean);
    if (seenUrlSet && keys.some((k) => seenUrlSet.has(k))) {
      counts.alreadyUsed++;
      continue;
    }
    if (isDrawResult(c) || (!c.newsletter && relevance(c) === 0)) {
      counts.offTopic++;
      continue;
    }
    if (sourceTier(c) < 0) {
      counts.untrusted++;
      continue;
    }
    eligible.push(c);
  }
  eligible.sort((a, b) => (b.published_ms || 0) - (a.published_ms || 0));
  const { items: unique, collapsed } = collapseStories(eligible, Infinity, (a, b) => sourceTier(a) - sourceTier(b));

  // Diversity caps on the shortlist. Without them one prolific source fills
  // it: the Federal Court feed alone took 12 of 70 slots with bare case names
  // ("Williams v. Canada"), which tell the selector nothing, and one content
  // farm took 7. The selector can only choose from what it is shown.
  const perSource = new Map();
  let cases = 0;
  let socialN = 0;
  const ranked = [];
  const byRank = unique
    .map((c) => ({
      c,
      // Relevance and freshness as before, plus: a story several outlets or
      // creators carry at once is hot (up to +9, but only while it is recent:
      // wide coverage last month is not news now), and a primary or
      // established source wins a tie (+3).
      rank:
        Math.min(relevance(c), 12) +
        recencyBoost(c.published_ms, nowMs) +
        Math.min((c.coverage || 1) - 1, 3) * heatWeight(c.published_ms, nowMs) +
        (sourceTier(c) > 0 || c.newsletter ? 3 : 0),
    }))
    .sort((a, b) => b.rank - a.rank);
  for (const { c } of byRank) {
    const n = perSource.get(c.source_name) || 0;
    const isCase = /\bv\.?\s+canada\b|\bc\.\s+canada\b/i.test(c.title);
    if (isCase && cases >= MAX_CASES) continue;
    if (c.social && socialN >= MAX_SOCIAL) continue;
    // Newsletter items are exempt from the per-source shortlist cap: one
    // issue is many separate developments, each meant to become a topic.
    if (!c.newsletter && n >= MAX_PER_SOURCE) continue;
    perSource.set(c.source_name, n + 1);
    if (isCase) cases++;
    if (c.social) socialN++;
    ranked.push(c);
    if (ranked.length >= SELECT_FROM) break;
  }

  lastStats = {
    harvest: harvest ? { at: harvest.harvested_at, size: harvest.items.length } : null,
    liveFetch: needLive
      ? live
        ? {
            feedsOk: live.feedStatus.filter((f) => f.ok).length,
            feedsTotal: live.feedStatus.length,
          }
        : { failed: true }
      : null,
    pool: merged.length,
    socialPosts: social.items.length,
    newsletterItems: lexbase.items.length,
    ...counts,
    duplicateStories: collapsed,
    eligible: unique.length,
    selected: 0,
    written: 0,
    headlineOnly: 0,
    timings: { poolMs: Date.now() - t0 },
  };
  console.log("[topics]", JSON.stringify(lastStats));
  if (!ranked.length) return [];

  // Stage 1 — select.
  for (const c of ranked) {
    const body = c.text || c.snippet || "";
    c.brief =
      (c.newsletter ? "[Lexbase newsletter, " + c.kind + (c.citation ? " " + c.citation : "") + "] " : "") +
      (c.coverage > 1 && heatWeight(c.published_ms, nowMs) > 0
        ? `[covered by ${c.coverage} sources: ${c.outlets.slice(0, 4).join(", ")}] `
        : "") +
      (body ? body.slice(0, 160).replace(/\s+/g, " ") : "");
  }
  const excludeAll = [...exclude, ...ownTitles].slice(-120);
  let picks = [];
  try {
    const sel = parseTopics(await rewrite(selectTopicsPrompt(ranked, today, excludeAll, MAX_CARDS + 4), 2000)) || [];
    const seenIdx = new Set();
    // One prolific source or creator must not fill the deck (one account
    // took 3 of 14 cards); the extra picks requested above cover the gaps.
    const perDeck = new Map();
    for (const p of sel) {
      const i = Number(p.id);
      if (!Number.isInteger(i) || !ranked[i] || seenIdx.has(i)) continue;
      seenIdx.add(i);
      const who = ranked[i].author || ranked[i].source_name || "";
      if ((perDeck.get(who) || 0) >= (ranked[i].newsletter ? MAX_NEWSLETTER_DECK : MAX_PER_SOURCE_DECK)) continue;
      perDeck.set(who, (perDeck.get(who) || 0) + 1);
      picks.push({ item: ranked[i], field: p.field || "Policy", score: Number(p.score) || 75 });
      if (picks.length >= MAX_CARDS) break;
    }
  } catch (e) {
    console.log("[topics] selection failed:", String(e?.message || e));
  }
  // A failed selection must not empty the deck: fall back to the ranking.
  if (!picks.length) {
    picks = ranked.slice(0, MAX_CARDS).map((item) => ({ item, field: "Policy", score: 70 }));
  }
  lastStats.selected = picks.length;
  lastStats.timings.selectMs = Date.now() - t0;

  // Ground and write in small batches that run side by side, emitting each
  // batch's cards as soon as they are written. One call for all 14 meant the
  // first card waited for the last; now it waits for its own batch only.
  let emitted = 0;
  const chunks = [];
  for (let i = 0; i < picks.length; i += WRITE_BATCH) chunks.push(picks.slice(i, i + WRITE_BATCH));
  await Promise.all(
    chunks.map(async (chunk) => {
      const budget = new Promise((r) => setTimeout(r, GROUND_BUDGET_MS, "timeout"));
      await Promise.all(
        chunk.map((p) =>
          Promise.race([groundTextFor(p.item).then((t) => (p.groundText = t)), budget]).catch(() => {})
        )
      );
      const toWrite = chunk.map((p) => ({ ...p.item, groundText: p.groundText || "" }));
      let written = [];
      try {
        written = parseTopics(await rewrite(writeCardsPrompt(toWrite, today), 1500)) || [];
      } catch (e) {
        console.log("[topics] write batch failed:", String(e?.message || e));
        return;
      }
      const done = new Set();
      for (const w of written) {
        const i = Number(w.id);
        const p = chunk[i];
        if (!p || done.has(i) || !w.title_fa) continue;
        done.add(i);
        const src = p.item;
        const field = p.field;
        const grounded = (p.groundText || "").length >= MIN_GROUND;
        const topic = {
          title_fa: w.title_fa,
          title_en: w.title_en || src.title,
          field,
          page: w.page || (String(field).toLowerCase() === "europe" ? "EU" : "CA"),
          why_now: w.why_now || "",
          date: src.published ? src.published.slice(0, 10) : "",
          // The publisher's own article when known: better for you to read, and
          // the script/article steps fetch their source text from this link.
          source_url: src.resolved_url || src.source_url,
          source_name: src.source_name,
          snippet: (p.groundText || src.snippet || "").slice(0, 1500),
          grounding: grounded ? "full" : "headline",
          score: p.score,
          ...(src.social ? { social: src.social, author: src.author } : {}),
          ...(src.newsletter ? { newsletter: src.newsletter, citation: src.citation || "" } : {}),
          ...(src.coverage > 1 ? { coverage: src.coverage, outlets: src.outlets.slice(0, 6) } : {}),
        };
        if (!accept(topic, seenUrlSet)) continue;
        if (!emitted) lastStats.timings.firstCardMs = Date.now() - t0;
        emitted++;
        lastStats.written = emitted;
        if (!grounded) lastStats.headlineOnly++;
        emit(topic);
      }
    })
  );
  lastStats.timings.totalMs = Date.now() - t0;
  return emitted;
}

// Old path: ask an LLM (OpenAI search model, else Claude web search) to both
// find and write the topics. Kept as an automatic fallback.
async function collectSearchTopics(exclude, today) {
  const prompt = topicPrompt(today, exclude);
  let text = "";
  let provider = "anthropic";
  if (openaiEnabled()) {
    try {
      text = await openaiTopics(prompt);
      provider = "openai";
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
      text = await callClaude([{ role: "user", content: prompt }], true);
      provider = "anthropic (openai failed)";
    }
  } else {
    text = await callClaude([{ role: "user", content: prompt }], true);
  }
  const parsed = parseTopics(text);
  return { list: Array.isArray(parsed) ? parsed : [], provider };
}

// ---- runs: one generation in progress, shared by everyone waiting on it ----
// A run collects cards as they are written. Every request that needs fresh
// topics follows the current run instead of starting its own: it is sent the
// cards written so far, then each new one as it lands.
let run = null;

function startRun(exclude) {
  const r = { topics: [], done: false, error: "", listeners: new Set() };
  r.push = (t) => {
    r.topics.push(t);
    for (const l of r.listeners) l({ type: "topic", topic: t });
  };
  run = r;
  r.promise = generate(exclude, r)
    .catch((e) => {
      r.error = String(e?.message || e);
    })
    .finally(() => {
      r.done = true;
      for (const l of r.listeners) l({ type: "end" });
      r.listeners.clear();
      if (run === r) run = null;
    });
  return r;
}

function follow(r, send) {
  for (const t of r.topics) send({ type: "topic", topic: t });
  if (r.done) return Promise.resolve();
  return new Promise((resolve) => {
    r.listeners.add((ev) => (ev.type === "topic" ? send(ev) : resolve()));
  });
}

// Newline-delimited JSON, flushed per card. `no-transform` keeps the
// compression layer from buffering the stream until it ends.
function ndjson(producer) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        } catch (_) {} // the page went away; the run carries on regardless
      };
      try {
        await producer(send);
      } catch (e) {
        send({ type: "error", error: String(e?.message || e) });
      }
      try {
        controller.close();
      } catch (_) {}
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// Decide where this request's topics come from: the cache, or a run.
function plan(force, exclude) {
  const age = cache.topics ? Date.now() - cache.timestamp : Infinity;
  if (force) {
    if (run) return { run }; // a fresh batch is already being made: follow it
    if (Date.now() - lastForceAt < FORCE_COOLDOWN_MS && cache.topics) return { cached: cache.topics, throttled: true };
    if (!underHourlyCap()) {
      return cache.topics
        ? { cached: cache.topics, throttled: true }
        : { fail: 429, error: "rate_limited", message: "Hourly live-search limit reached." };
    }
    lastForceAt = Date.now();
    return { run: startRun(exclude) };
  }
  if (age < FRESH_MS) return { cached: cache.topics };
  if (age < SERVE_MAX_MS) {
    // Stale but usable: serve it now, refresh for next time.
    if (!run && underHourlyCap()) startRun(exclude);
    return { cached: cache.topics, stale: true };
  }
  if (run) return { run };
  if (!underHourlyCap()) {
    return cache.topics
      ? { cached: cache.topics, stale: true }
      : { fail: 429, error: "rate_limited", message: "Too many live searches this hour — try again shortly." };
  }
  return { run: startRun(exclude) };
}

export async function POST(request) {
  let exclude = [];
  let force = false;
  let stream = false;
  try {
    const body = await request.json();
    if (Array.isArray(body?.exclude)) {
      exclude = body.exclude.slice(0, 60).map((t) => String(t).slice(0, 200));
    }
    force = !!body?.force;
    stream = !!body?.stream;
  } catch (_) {
    // no/invalid body — fine, just use defaults
  }

  let pl;
  try {
    pl = plan(force, exclude);
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }

  // Streaming: cards are sent one by one, the first as soon as it exists.
  if (stream) {
    return ndjson(async (send) => {
      if (pl.fail) {
        send({ type: "error", error: pl.error, message: pl.message });
        return;
      }
      if (pl.cached) {
        for (const t of pl.cached) send({ type: "topic", topic: t });
        send({ type: "stats", stats: lastStats, cached: true, stale: !!pl.stale, throttled: !!pl.throttled });
        send({ type: "done" });
        return;
      }
      await follow(pl.run, send);
      if (pl.run.error && !pl.run.topics.length) send({ type: "error", error: pl.run.error });
      send({ type: "stats", stats: lastStats });
      send({ type: "done" });
    });
  }

  // Plain JSON (older clients): the whole batch at once.
  if (pl.fail) return Response.json({ error: pl.error, message: pl.message }, { status: pl.fail });
  if (pl.cached) {
    return Response.json({ topics: pl.cached, cached: true, stats: lastStats, stale: !!pl.stale, throttled: !!pl.throttled });
  }
  await pl.run.promise;
  if (!pl.run.topics.length) {
    const err = pl.run.error || "parse";
    return Response.json({ error: err === "parse" ? "parse" : err, stats: lastStats }, { status: err === "parse" ? 502 : 500 });
  }
  return Response.json({ topics: pl.run.topics, cached: false, provider: cache.provider, stats: lastStats });
}

// Warm-up, called on a schedule by .github/workflows/keepwarm.yml. Keeps a
// recent deck ready so opening the app shows topics immediately instead of
// waiting for a generation. Regenerates only when the deck is older than
// WARM_MAX_MS, so it costs one generation every couple of hours at most.
const WARM_MAX_MS = 2 * 60 * 60 * 1000;
export async function GET(request) {
  const warm = new URL(request.url).searchParams.get("warm") === "1";
  const age = cache.topics ? Date.now() - cache.timestamp : Infinity;
  let started = false;
  if (warm && !run && age > WARM_MAX_MS && underHourlyCap()) {
    startRun([]);
    started = true;
  }
  return Response.json(
    {
      ok: true,
      cards: cache.topics ? cache.topics.length : 0,
      deckAgeMin: Number.isFinite(age) ? Math.round(age / 60000) : null,
      generating: !!run,
      started,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
