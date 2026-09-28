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
import { loadHarvest, mergeCandidates, relevance, isDrawResult } from "../../../lib/candidates";
import { resolveGoogleNewsUrl } from "../../../lib/gnews";
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

const MAX_AGE_DAYS = 30; // drop any dated news older than this — hard recency guard
const NEWS_WINDOW_DAYS = 30; // how far back topics are drawn from
const SELECT_FROM = 70; // candidates shown to the selection call (token cap)
const MAX_CARDS = 14; // cards returned per generation
const MAX_PER_SOURCE = 4; // shortlist slots any one source may take
const MAX_CASES = 3; // shortlist slots for individual court decisions
const HARVEST_FRESH_MS = 3 * 60 * 60 * 1000; // skip the live fetch if the pool is newer
const GROUND_BUDGET_MS = 12000; // wall-clock cap on fetching text for chosen items
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

// Drop duplicate topics WITHIN one batch (same article by URL, or same title).
function dedupeBatch(list) {
  const seenUrl = new Set();
  const seenTitle = new Set();
  const out = [];
  for (const t of list) {
    const uk = normalizeUrl(t.source_url);
    const tk = String(t.title_fa || t.title_en || "").trim().toLowerCase();
    if ((uk && seenUrl.has(uk)) || (tk && seenTitle.has(tk))) continue;
    if (uk) seenUrl.add(uk);
    if (tk) seenTitle.add(tk);
    out.push(t);
  }
  return out;
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

// Primary source: real RSS/Atom immigration feeds (grounded, dated, deduped).
// Fallback: the old LLM web-search path. `cache.provider` records which ran.
async function generate(clientExclude) {
  generationTimestamps.push(Date.now());
  const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local date
  const nowMs = Date.now();

  // If a Google Sheet is configured it is the durable, cross-device source of
  // truth for what's been shown. Pull it up front so we can avoid repeats.
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

  // 1. Real news feeds only. NO evergreen/how-to filler: those were generic
  // pages (not news), repeated, and some had dead links. An honest empty deck
  // beats filler — if there's no fresh news, the app says so.
  let list = [];
  let provider = "feeds";
  try {
    const news = await collectFeedTopics({ today, nowMs, exclude, seenUrlSet });
    list = news;
    if (list.length) provider = openaiEnabled() ? "feeds+openai" : "feeds+anthropic";
    console.log(`[topics] ${news.length} news topics from feeds`);
  } catch (e) {
    console.log("[topics] feed path failed:", String(e?.message || e));
    list = [];
  }

  // 2. Fallback to the LLM web-search path only if the feeds produced nothing.
  if (!list.length) {
    const r = await collectSearchTopics(exclude, today);
    list = r.list;
    provider = r.provider;
  }

  const out = finalize(list, today, seenUrlSet);
  if (!out.length) throw new Error("parse"); // nothing usable at all

  // NOTE: topics are NOT logged to the durable Sheet here. A suggested topic is
  // only recorded once the user actually acts on it — an APPROVED topic is sent
  // to /api/seen by the client. This way topics you never reached stay
  // available next run, and the Sheet holds only what you approved.

  cache = { topics: out, timestamp: Date.now(), provider };
  return out;
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
async function collectFeedTopics({ today, nowMs, exclude, seenUrlSet }) {
  const harvest = await loadHarvest();
  const harvestAge = harvest ? nowMs - Date.parse(harvest.harvested_at || 0) : Infinity;
  const needLive = !(harvestAge < HARVEST_FRESH_MS);
  const live = needLive
    ? await fetchFeedItems({ maxAgeDays: NEWS_WINDOW_DAYS, nowMs }).catch(() => null)
    : null;

  const merged = mergeCandidates(harvest ? harvest.items : [], live ? live.items : [], nowMs).items;
  // The brand's own published titles. They are Farsi and the news is mostly
  // English, so word matching cannot connect the two; they go to the
  // selection model as "already covered", which can.
  const ownTitles = [...((harvest && harvest.own_titles) || []), ...((live && live.ownTitles) || [])];
  const cutoff = nowMs - NEWS_WINDOW_DAYS * 86400000;

  const counts = { alreadyUsed: 0, offTopic: 0 };
  const eligible = [];
  for (const c of merged) {
    const t = c.published_ms || Date.parse(c.first_seen || "") || 0;
    if (t && t < cutoff) continue;
    const keys = [articleKey(c.source_url), articleKey(c.resolved_url)].filter(Boolean);
    if (seenUrlSet && keys.some((k) => seenUrlSet.has(k))) {
      counts.alreadyUsed++;
      continue;
    }
    if (isDrawResult(c) || relevance(c) === 0) {
      counts.offTopic++;
      continue;
    }
    eligible.push(c);
  }
  eligible.sort((a, b) => (b.published_ms || 0) - (a.published_ms || 0));
  const { items: unique, collapsed } = collapseStories(eligible);

  // Diversity caps on the shortlist. Without them one prolific source fills
  // it: the Federal Court feed alone took 12 of 70 slots with bare case names
  // ("Williams v. Canada"), which tell the selector nothing, and one content
  // farm took 7. The selector can only choose from what it is shown.
  const perSource = new Map();
  let cases = 0;
  const ranked = [];
  const byRank = unique
    .map((c) => ({ c, rank: Math.min(relevance(c), 12) + recencyBoost(c.published_ms, nowMs) }))
    .sort((a, b) => b.rank - a.rank);
  for (const { c } of byRank) {
    const n = perSource.get(c.source_name) || 0;
    if (n >= MAX_PER_SOURCE) continue;
    const isCase = /\bv\.?\s+canada\b|\bc\.\s+canada\b/i.test(c.title);
    if (isCase && cases >= MAX_CASES) continue;
    perSource.set(c.source_name, n + 1);
    if (isCase) cases++;
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
    ...counts,
    duplicateStories: collapsed,
    eligible: unique.length,
    selected: 0,
    written: 0,
    headlineOnly: 0,
  };
  console.log("[topics]", JSON.stringify(lastStats));
  if (!ranked.length) return [];

  // Stage 1 — select.
  for (const c of ranked) {
    const body = c.text || c.snippet || "";
    c.brief = body ? body.slice(0, 160).replace(/\s+/g, " ") : "";
  }
  const excludeAll = [...exclude, ...ownTitles].slice(-120);
  let picks = [];
  try {
    const sel = parseTopics(await rewrite(selectTopicsPrompt(ranked, today, excludeAll, MAX_CARDS), 2000)) || [];
    const seenIdx = new Set();
    for (const p of sel) {
      const i = Number(p.id);
      if (!Number.isInteger(i) || !ranked[i] || seenIdx.has(i)) continue;
      seenIdx.add(i);
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

  // Ground each pick in real text, under one overall time budget.
  const budget = new Promise((r) => setTimeout(r, GROUND_BUDGET_MS, "timeout"));
  await Promise.all(
    picks.map((p) =>
      Promise.race([groundTextFor(p.item).then((t) => (p.groundText = t)), budget]).catch(() => {})
    )
  );

  // Stage 2 — write, only from the text each pick carries.
  const toWrite = picks.map((p) => ({ ...p.item, groundText: p.groundText || "" }));
  const written = parseTopics(await rewrite(writeCardsPrompt(toWrite, today), 5000)) || [];
  const topics = [];
  const doneIdx = new Set();
  for (const w of written) {
    const i = Number(w.id);
    const p = picks[i];
    if (!p || doneIdx.has(i) || !w.title_fa) continue;
    doneIdx.add(i);
    const src = p.item;
    const field = p.field;
    const grounded = (p.groundText || "").length >= MIN_GROUND;
    topics.push({
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
    });
  }
  topics.sort((a, b) => (b.score || 0) - (a.score || 0));
  lastStats.written = topics.length;
  lastStats.headlineOnly = topics.filter((t) => t.grounding === "headline").length;
  return topics;
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

// Shared post-processing for either source: drop Express Entry, drop in-batch
// duplicates, enforce recency, and drop cross-batch repeats (news only).
function finalize(list, today, seenUrlSet) {
  const noEE = list.filter((t) => !isExpressEntry(t));
  if (list.length - noEE.length > 0) {
    console.log(`[topics] dropped ${list.length - noEE.length} Express Entry topic(s)`);
  }
  let out = recencyLogged(dedupeBatch(noEE), today);
  if (seenUrlSet) {
    out = out.filter((t) => {
      const k = normalizeUrl(t.source_url);
      return !(k && seenUrlSet.has(k));
    });
  }
  return out;
}

// Apply the recency filter and log how many were dropped (visible in Render logs).
function recencyLogged(list, todayStr) {
  const kept = list.filter((t) => recentEnough(t, todayStr));
  const dropped = list.length - kept.length;
  if (dropped > 0) {
    console.log(`[topics] dropped ${dropped} stale topic(s) older than ${MAX_AGE_DAYS} days`);
  }
  return kept;
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
          cached: true, stats: lastStats,
          throttled: true,
          retryAfterMs: FORCE_COOLDOWN_MS - sinceLastForce,
        });
      }
    }

    if (!force) {
      const age = cache.topics ? Date.now() - cache.timestamp : Infinity;

      if (age < FRESH_MS) {
        return Response.json({ topics: cache.topics, cached: true, stats: lastStats });
      }

      if (age < SERVE_MAX_MS) {
        // Stale but usable: serve instantly, refresh for next time.
        refreshInBackground(exclude);
        return Response.json({ topics: cache.topics, cached: true, stats: lastStats, stale: true });
      }

      // No usable cache at all — must wait on a live generation. Join an
      // already-running one if another request beat us to it.
      if (inFlight) {
        const topics = await inFlight.then(() => cache.topics);
        if (topics) return Response.json({ topics, cached: true, stats: lastStats });
      }

      // Hourly cap hit: serve whatever cache exists, however old, rather
      // than a hard failure; only error out if there's truly nothing.
      if (!underHourlyCap()) {
        if (cache.topics) {
          return Response.json({ topics: cache.topics, cached: true, stats: lastStats, stale: true });
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
          cached: true, stats: lastStats,
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
    return Response.json({
      topics: parsed,
      cached: false,
      provider: cache.provider,
      stats: lastStats,
    });
  } catch (e) {
    if (String(e?.message || e) === "parse") {
      return Response.json({ error: "parse", stats: lastStats }, { status: 502 });
    }
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
