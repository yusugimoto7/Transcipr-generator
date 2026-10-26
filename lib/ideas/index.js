// General ideas: topics that are not news — the questions people keep
// asking, which the brand can answer any week ("can I apply for a study
// permit from inside Canada?", "why are sponsorships refused?"). The
// harvester gathers the demand signals (lib/ideas/signals.js); here the
// model turns them into idea cards, each grounded on one official page whose
// text the harvester also stored, so the scripts, article and carousel for an
// idea are written from canada.ca and nothing else.
//
// A batch is generated when the newest one is older than IDEAS_EVERY_DAYS (or
// on request), and kept in the Sheet like other material, so a restart shows
// the same ideas to everyone instead of paying for a new batch.

import { SUBJECTS, ALL_PAGES, HC_TOPICS } from "./seeds.js";
import { ideasPrompt, parseTopics } from "../prompts.js";
import { glossaryBlock } from "../glossary.js";
import { openaiEnabled, openaiScript } from "../openai.js";
import { callClaude } from "../anthropic.js";
import { getRecords, saveRecord, getEntries, keyOf } from "../workspace.js";

export const SIGNALS_URL =
  process.env.HARVEST_SIGNALS_URL ||
  "https://raw.githubusercontent.com/yusugimoto7/Transcipr-generator/harvest-data/signals.json";

const SIGNALS_CACHE_MS = 30 * 60 * 1000;
const IDEAS_EVERY_MS = (Number(process.env.IDEAS_EVERY_DAYS) || 7) * 86400000;
const KEEP_IDEAS_DAYS = 45;
const WANT = 24;

const state = globalThis.__sugimotoIdeas || (globalThis.__sugimotoIdeas = { signals: null, signalsAt: 0, generating: null, lastError: "", lastTry: 0 });

export async function loadSignals({ timeoutMs = 8000 } = {}) {
  if (state.signals && Date.now() - state.signalsAt < SIGNALS_CACHE_MS) return state.signals;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(SIGNALS_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!res.ok) return state.signals;
    const data = await res.json();
    if (data && data.harvested_at) {
      state.signals = data;
      state.signalsAt = Date.now();
    }
  } catch (_) {}
  return state.signals;
}

// The stored text of the official page an idea rests on.
export async function officialPageText(topic) {
  const id = topic && topic.page_id;
  if (!id) return "";
  const s = await loadSignals();
  const p = s && s.pages && s.pages[id];
  return p && p.text ? p.text : "";
}

function pageById(id) {
  return ALL_PAGES.find((p) => p.id === id) || null;
}

// ── compact view of the signals for the model ────────────────────────────────
function compact(signals) {
  const subjects = SUBJECTS.map((s) => {
    const a = (signals.autocomplete || {})[s.id] || { en: [], fa: [], yt: [] };
    const uniq = (arr, n) => [...new Set(arr.map((x) => String(x).toLowerCase()))].slice(0, n);
    const hc = (s.hc || []).flatMap((id) => (((signals.helpcentre || {})[id] || {}).questions || []).map((q) => q.text));
    return {
      id: s.id,
      label: s.label,
      // Only pages whose text is in hand: an idea tied to a page that could
      // not be read would have nothing to be written from.
      pages: s.pages.filter(([id]) => (signals.pages || {})[id] && signals.pages[id].text).map(([id, label]) => `${id}: ${label}`),
      google_fa: uniq(a.fa, 60),
      google_en: uniq(a.en, 70),
      youtube: uniq(a.yt, 30),
      ircc_help_centre: [...new Set(hc)].slice(0, 45),
    };
  });
  return {
    subjects,
    reddit: (signals.reddit || []).slice(0, 160),
    covered: (signals.covered || []).map((c) => c.title).filter(Boolean).slice(0, 700),
  };
}

// ── ideas store ───────────────────────────────────────────────────────────────
async function storedSets() {
  const recs = await getRecords("ideaset:").catch(() => []);
  const cutoff = Date.now() - KEEP_IDEAS_DAYS * 86400000;
  return recs.filter((r) => (r.ts || 0) >= cutoff).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function toTopic(raw, batchTs) {
  const page = pageById(String(raw.page_id || "").trim());
  if (page && !(state.signals && state.signals.pages && state.signals.pages[page.id] && state.signals.pages[page.id].text)) return null;
  const subj = SUBJECTS.find((s) => s.id === raw.subject) || (page && SUBJECTS.find((s) => s.id === page.subject));
  if (!page || !raw.title_fa) return null;
  const why = Array.isArray(raw.why) ? raw.why.map((w) => String(w).trim()).filter(Boolean).slice(0, 4) : [];
  return {
    title_fa: String(raw.title_fa).trim().slice(0, 140),
    title_en: String(raw.title_en || "").trim().slice(0, 140),
    field: (subj && subj.field) || page.field || "Policy",
    page: "CA",
    why_now: String(raw.question_fa || "").trim().slice(0, 300),
    question: String(raw.question_fa || "").trim().slice(0, 300),
    gap: String(raw.gap_fa || "").trim().slice(0, 400),
    signals: why,
    format: ["video", "carousel", "article"].includes(raw.format) ? raw.format : "video",
    date: "",
    source_url: page.url,
    source_name: "canada.ca",
    page_id: page.id,
    subject: page.subject,
    evergreen: true,
    grounding: "full",
    score: Math.max(60, Math.min(98, Number(raw.score) || 75)),
    batch: batchTs,
  };
}

async function generate() {
  const signals = await loadSignals();
  if (!signals) throw new Error("no demand signals yet — the harvester has not run with signals");
  const [sets, entries] = await Promise.all([storedSets(), getEntries().catch(() => [])]);
  const proposed = sets.flatMap((r) => (r.ideas || []).map((i) => i.title_fa));
  const used = entries.map((e) => (e.topic && e.topic.title_fa) || "").filter(Boolean);
  const prompt = ideasPrompt(compact(signals), { proposed, used, want: WANT }) + (await glossaryBlock("fa"));
  let raw = "";
  if (openaiEnabled()) {
    try {
      // 24 ideas of Persian JSON run far past the script cap; a cut-off
      // answer loses most of the batch.
      raw = await openaiScript(prompt, { maxOutputTokens: 16000 });
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
      raw = await callClaude([{ role: "user", content: prompt }], false, 8000);
    }
  } else {
    raw = await callClaude([{ role: "user", content: prompt }], false, 8000);
  }
  const parsed = parseTopics(raw) || [];
  const ts = Date.now();
  const known = new Set([...proposed, ...used].map((t) => String(t).trim().toLowerCase()));
  const ideas = [];
  for (const r of parsed) {
    const t = toTopic(r, ts);
    if (!t || known.has(keyOf(t))) continue;
    known.add(keyOf(t));
    ideas.push(t);
  }
  if (!ideas.length) throw new Error("the model returned no usable ideas");
  await saveRecord({ id: `ideaset:${new Date(ts).toISOString()}`, type: "ideaset", title_en: `Ideas ${new Date(ts).toISOString().slice(0, 10)}`, signals_at: signals.harvested_at, ideas });
  return ideas;
}

function startGeneration() {
  if (state.generating) return state.generating;
  state.lastTry = Date.now();
  state.lastError = "";
  state.generating = generate()
    .catch((e) => {
      state.lastError = String(e?.message || e).slice(0, 300);
      console.log("[ideas] generation failed:", state.lastError);
    })
    .finally(() => (state.generating = null));
  return state.generating;
}

// Ideas for the page: every stored idea of the last weeks, newest batch
// first. Starts a new batch when due (or asked) and returns at once.
// After a restart the first read of the Sheet can take many seconds; the
// page must not show an empty section meanwhile. The last answer is kept and
// served at once while a fresh one is computed, except when a new batch was
// just asked for.
export async function getIdeas(opts = {}) {
  const fresh = computeIdeas(opts);
  if (!opts.refresh && state.lastAnswer && !opts.waitMs) {
    fresh.then((a) => (state.lastAnswer = a)).catch(() => {});
    const raced = await Promise.race([fresh, new Promise((r) => setTimeout(() => r(null), 1200))]);
    return raced || state.lastAnswer;
  }
  const a = await fresh;
  state.lastAnswer = a;
  return a;
}

async function computeIdeas({ refresh = false, waitMs = 0 } = {}) {
  const signals = await loadSignals();
  const sets = await storedSets();
  const newest = sets[0] ? sets[0].ts || 0 : 0;
  const due = signals && (refresh || Date.now() - newest > IDEAS_EVERY_MS);
  // A failed try is not repeated for a while: it costs money each time.
  if (due && !state.generating && Date.now() - state.lastTry > 10 * 60 * 1000) startGeneration();
  if (waitMs && state.generating) await Promise.race([state.generating, new Promise((r) => setTimeout(r, waitMs))]);
  const fresh = state.generating ? sets : await storedSets();
  const seen = new Set();
  const ideas = [];
  for (const r of fresh) for (const i of r.ideas || []) if (i && i.title_fa && !seen.has(keyOf(i)) && seen.add(keyOf(i))) ideas.push(i);
  const hc = signals && signals.helpcentre ? Object.values(signals.helpcentre).reduce((n, t) => n + (t.questions || []).length, 0) : 0;
  return {
    ideas,
    generatedAt: fresh[0] ? new Date(fresh[0].ts).toISOString() : "",
    generating: !!state.generating,
    error: state.lastError,
    signals: signals
      ? {
          at: signals.harvested_at,
          google: Object.values(signals.autocomplete || {}).reduce((n, a) => n + a.en.length + a.fa.length + a.yt.length, 0),
          reddit: (signals.reddit || []).length,
          helpcentre: hc,
          covered: (signals.covered || []).length,
          pages: Object.values(signals.pages || {}).filter((p) => p.ok).length,
          pagesTotal: ALL_PAGES.length,
        }
      : null,
  };
}

export { SUBJECTS, HC_TOPICS };
