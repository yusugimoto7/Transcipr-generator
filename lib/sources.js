// Every source the app finds news and ideas in, edited by the team in the glossary's Google Sheet,
// tab «Sources» (Oct 27 2026). One row per source:
//   active   checkbox: unticked rows are kept in the sheet but never read
//   section  News | Ideas | Research | Blocked | Built-in (Built-in rows, and rows of type built-in,
//            only describe what the code does by itself: Lexbase, web search, autocomplete, the
//            sites lib/trust.js always blocks; the app ignores them)
//   group    Social media | Website | Video | Government | Court | Search | Community | Newsletter
//   platform X | Facebook | Instagram | YouTube | Reddit | Google News | Web (for filtering)
//   name     what the team calls it
//   link     feed URL, page URL, site, @handle, or the Google News search words
//   type     how the app reads it: rss | google-news | rss.app | youtube | instagram | page |
//            subreddit | site | built-in
//   market   Canada | Europe | Both (for filtering)
//   subject  Ideas pages only: which subject the page grounds (lib/ideas/seeds.js ids)
//   note     anything
//
// Per kind the sheet REPLACES the list in the code as soon as it has at least one row of that kind
// (ticked or not), so deleting or unticking a row really drops that source. A kind with no rows, or
// a sheet that cannot be read, falls back to the code's list: a bad edit or Google being down never
// leaves the app without sources.

import { parseCsv } from "./glossary.js";

const DEFAULT_SHEET_ID = "1LCIr_xkihaVrUPFWrvjIXA3w9PtLBQwG96K3b-agMy0";
const TTL = 10 * 60 * 1000;

function sheetId() {
  return (process.env.SOURCES_SHEET_ID || process.env.GLOSSARY_SHEET_ID || DEFAULT_SHEET_ID).trim();
}
function sheetTab() {
  return (process.env.SOURCES_SHEET_TAB || "Sources").trim();
}
export function sourcesSheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${sheetId()}/edit`;
}

// Which list a row feeds, by section + type.
const KINDS = {
  "news:rss": "feed",
  "news:google-news": "feed",
  "news:rss.app": "feed",
  "news:youtube": "youtube",
  "news:instagram": "instagram",
  "ideas:page": "page",
  "ideas:subreddit": "subreddit",
  "research:site": "trusted",
  "blocked:site": "blocked",
};

const state = globalThis.__sugimotoSources || (globalThis.__sugimotoSources = { rows: null, at: 0, error: "", loading: null });

const low = (s) => String(s || "").trim().toLowerCase();

function isOn(v) {
  const s = low(v);
  return s === "true" || s === "yes" || s === "1" || s === "✓" || s === "✔" || s === "بله";
}

export function kindOf(row) {
  return KINDS[`${low(row.section)}:${low(row.type)}`] || "";
}

// Rows that only describe what the code does by itself (section Built-in, or type built-in such as
// the sites blocked in lib/trust.js): shown for the team, never read.
function isInfo(row) {
  return low(row.section) === "built-in" || low(row.type) === "built-in";
}

export function hostOfLink(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {
    return "";
  }
}

function toObjects(rows) {
  const header = (rows[0] || []).map(low);
  return rows
    .slice(1)
    .map((r) => {
      const o = {};
      header.forEach((h, i) => {
        if (h) o[h] = String(r[i] == null ? "" : r[i]).trim();
      });
      return o;
    })
    .filter((o) => o.link || o.name);
}

async function fetchRows() {
  const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId())}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(sheetTab())}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal, headers: { Accept: "text/csv" } });
    if (res.status === 401 || res.status === 403) throw new Error('the sources sheet is not shared as "anyone with the link can view"');
    if (!res.ok) throw new Error("sheet " + res.status);
    const text = await res.text();
    if (/^\s*</.test(text)) throw new Error('the sources sheet answered with a sign-in page; share it as "anyone with the link can view"');
    const rows = toObjects(parseCsv(text));
    // A missing tab makes gviz answer with the first tab instead: that is the glossary, not sources.
    if (rows.length && !("section" in rows[0] && "type" in rows[0])) throw new Error(`no "${sheetTab()}" tab with section / type columns`);
    return rows;
  } finally {
    clearTimeout(timer);
  }
}

// Read the sheet (at most every 10 minutes). Never throws: on failure the last good rows stay.
export async function loadSources({ fresh = false } = {}) {
  if (!fresh && state.at && Date.now() - state.at < TTL) return state.rows;
  if (!state.loading) {
    state.loading = fetchRows()
      .then((rows) => {
        state.rows = rows;
        state.error = "";
      })
      .catch((e) => {
        state.error = String(e.message || e);
        console.log("[sources] sheet unreadable, using the lists in the code:", state.error);
      })
      .finally(() => {
        state.at = Date.now();
        state.loading = null;
      });
  }
  await state.loading;
  return state.rows;
}

// The sheet's ticked rows of one kind, or null when the sheet has no say over that kind (not read,
// or no rows of it) and the caller should use its own list.
export function sheetList(kind) {
  if (!state.rows) return null;
  const all = state.rows.filter((r) => kindOf(r) === kind);
  if (!all.length) return null;
  return all.filter((r) => isOn(r.active));
}

export function sourcesStatus() {
  const counts = {};
  for (const r of state.rows || []) {
    const k = kindOf(r) || (isInfo(r) ? "built-in" : "unknown");
    counts[k] = counts[k] || { rows: 0, active: 0 };
    counts[k].rows++;
    if (isOn(r.active)) counts[k].active++;
  }
  return {
    sheet_url: sourcesSheetUrl(),
    tab: sheetTab(),
    read: !!state.rows,
    rows: (state.rows || []).length,
    counts,
    error: state.error,
    loaded_at: state.at ? new Date(state.at).toISOString() : "",
  };
}

// Rows the app could not place (wrong section / type pair), so the team sees why a row does nothing.
export function unplacedRows() {
  return (state.rows || []).filter((r) => !kindOf(r) && !isInfo(r));
}
