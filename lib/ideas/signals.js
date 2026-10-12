// Demand signals for the general-ideas section, gathered once a day by the
// harvester (scripts/harvest.mjs) and written to signals.json on the
// harvest-data branch. Run from GitHub Actions on purpose: canada.ca and
// Google rate-limit bursts from a single host, and the app's own host must
// never be the one that gets blocked.
//
//   autocomplete  Google (web and YouTube) completions of each subject's seed
//                 phrases, in English and Persian, widened with a letter or a
//                 question word after the seed — the classic keyword-tool
//                 trick; each completion is something people actually type
//   reddit        titles of the most upvoted and newest posts in the
//                 immigration community: the situations people are stuck in
//   helpcentre    the questions IRCC's own Help Centre lists per topic
//   covered       the brand's published post and page titles, so an idea the
//                 site already answers is only offered with a new angle
//   pages         text of the official pages ideas are grounded on, fetched
//                 here once so scripts never wait on canada.ca

import { SUBJECTS, ALL_PAGES, HC_TOPICS, SUBREDDITS } from "./seeds.js";
import { fetchArticleText } from "../news.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getText(url, { timeoutMs = 20000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, ...headers } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function decode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "’").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s+/g, " ")
    .trim();
}

// ── Google / YouTube autocomplete ─────────────────────────────────────────────
const EN_WIDEN = "abcdefghijklmnopqrstuvwxyz".split("").concat(["how", "can", "what", "without", "after", "before", "with", "for", "vs", "or"]);
const FA_WIDEN = ["برای", "بدون", "با", "چقدر", "چند", "شرایط", "هزینه", "مدت", "بعد از", "قبل از", "ا", "ب", "پ", "ت", "د", "س", "ک", "م", "ن", "و", "ه", "ی"];
const NOISE = /\b(login|sign in|pdf|form\b|reddit|forum|tracker|number|phone|address|contact|jobs?|salary|song|movie|wiki)\b/i;

async function suggest(q, hl, yt) {
  const u = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${hl}&gl=ca${yt ? "&ds=yt" : ""}&q=${encodeURIComponent(q)}`;
  try {
    const j = JSON.parse(await getText(u, { timeoutMs: 8000 }));
    return Array.isArray(j[1]) ? j[1].map((s) => String(s).trim()).filter(Boolean) : [];
  } catch (_) {
    return [];
  }
}

// Per seed: the base completions (Google's own popularity order) first, then
// the widened ones, capped. Everything is lowercase and deduped.
async function autocompleteFor(seed, hl, yt, cap) {
  const out = [];
  const seen = new Set();
  const add = (s) => {
    const k = s.toLowerCase();
    if (seen.has(k) || NOISE.test(k)) return;
    seen.add(k);
    out.push(s);
  };
  for (const s of await suggest(seed, hl, yt)) add(s);
  await sleep(120);
  for (const w of hl === "fa" ? FA_WIDEN : EN_WIDEN) {
    if (out.length >= cap) break;
    for (const s of await suggest(`${seed} ${w}`, hl, yt)) add(s);
    await sleep(120);
  }
  return out.slice(0, cap);
}

// ── Reddit ────────────────────────────────────────────────────────────────────
async function redditTitles() {
  const out = [];
  for (const sub of SUBREDDITS) {
    for (const listing of ["top.rss?t=month&limit=100", "top.rss?t=week&limit=50", "new.rss?limit=50"]) {
      try {
        const xml = await getText(`https://www.reddit.com/r/${sub}/${listing}`, { headers: { Accept: "application/atom+xml" } });
        const titles = [...xml.matchAll(/<entry>[\s\S]*?<title>([^<]*)<\/title>/g)].map((m) => decode(m[1]));
        for (const t of titles) if (t && t.length > 15 && !out.includes(t)) out.push(t);
      } catch (e) {
        console.log(`[signals] reddit ${sub} ${listing}: ${String(e.message || e).slice(0, 80)}`);
      }
      await sleep(2500);
    }
  }
  return out;
}

// ── IRCC Help Centre ──────────────────────────────────────────────────────────
async function helpCentre() {
  const out = {};
  for (const [id, name] of Object.entries(HC_TOPICS)) {
    try {
      const html = await getText(`https://ircc.canada.ca/english/helpcentre/results-by-topic.asp?top=${id}`);
      const qs = [...html.matchAll(/answer\.asp\?qnum=(\d+)&amp;top=\d+"[^>]*>([^<]+)</g)].map((m) => ({ q: m[1], text: decode(m[2]) }));
      const seen = new Set();
      out[id] = { name, questions: qs.filter((x) => !seen.has(x.q) && seen.add(x.q)) };
    } catch (e) {
      console.log(`[signals] help centre topic ${id}: ${String(e.message || e).slice(0, 80)}`);
    }
    await sleep(800);
  }
  return out;
}

// ── The brand's own site ──────────────────────────────────────────────────────
async function siteTitles() {
  const base = (process.env.WP_BASE_URL || "https://sugimotovisa.com").replace(/\/+$/, "");
  const out = [];
  for (const type of ["posts", "pages"]) {
    for (let page = 1; page <= 8; page++) {
      try {
        const txt = await getText(`${base}/wp-json/wp/v2/${type}?per_page=100&page=${page}&_fields=title,link`, { timeoutMs: 15000 });
        const arr = JSON.parse(txt);
        if (!Array.isArray(arr) || !arr.length) break;
        for (const p of arr) out.push({ title: decode(p.title && p.title.rendered), url: p.link });
        if (arr.length < 100) break;
      } catch (_) {
        break;
      }
      await sleep(300);
    }
  }
  return out;
}

// ── Official pages ────────────────────────────────────────────────────────────
async function officialPages(previous) {
  const out = {};
  for (const p of ALL_PAGES) {
    let text = "";
    try {
      text = await fetchArticleText(p.url, { timeoutMs: 20000, maxChars: 7000 });
    } catch (_) {}
    if (text && text.length >= 300) {
      out[p.id] = { ...p, text, fetched_at: new Date().toISOString(), ok: true };
    } else {
      // Keep yesterday's text rather than lose the page to one bad fetch.
      const prev = previous && previous[p.id];
      out[p.id] = prev && prev.text ? { ...prev, ok: false, last_error: text ? "too short" : "unreachable" } : { ...p, text: "", ok: false };
    }
    await sleep(1500);
  }
  return out;
}

export async function harvestSignals({ previous = null, log = console.log } = {}) {
  const t0 = Date.now();
  const autocomplete = {};
  for (const s of SUBJECTS) {
    autocomplete[s.id] = { en: [], fa: [], yt: [] };
    for (const seed of s.seeds.en || []) autocomplete[s.id].en.push(...(await autocompleteFor(seed, "en", false, 45)));
    for (const seed of s.seeds.fa || []) autocomplete[s.id].fa.push(...(await autocompleteFor(seed, "fa", false, 40)));
    for (const seed of s.seeds.yt || []) autocomplete[s.id].yt.push(...(await autocompleteFor(seed, "en", true, 25)));
    log(`[signals] ${s.id}: en ${autocomplete[s.id].en.length} · fa ${autocomplete[s.id].fa.length} · yt ${autocomplete[s.id].yt.length}`);
  }
  const [reddit, helpcentre, covered, pages] = await Promise.all([
    redditTitles(),
    helpCentre(),
    siteTitles(),
    officialPages(previous && previous.pages),
  ]);
  const pagesOk = Object.values(pages).filter((p) => p.ok).length;
  log(`[signals] reddit ${reddit.length} · help centre ${Object.values(helpcentre).reduce((n, t) => n + t.questions.length, 0)} questions · site ${covered.length} titles · pages ${pagesOk}/${ALL_PAGES.length} · ${Math.round((Date.now() - t0) / 1000)}s`);
  return {
    harvested_at: new Date().toISOString(),
    autocomplete,
    reddit,
    helpcentre,
    covered,
    pages,
  };
}
