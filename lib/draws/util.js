// Shared helpers for the draw pipeline: fetching, HTML cleanup, date math.
// No external dependencies — Node 18+ global fetch only.

const UA = "Mozilla/5.0 (SugimotoDrawsBot)";

async function request(url, { timeout = 20000, headers = {} } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": UA, ...headers },
      signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson(url, opts) {
  const res = await request(url, opts);
  return res.json();
}

export async function fetchText(url, opts) {
  const res = await request(url, opts);
  return res.text();
}

// Escape for Telegram HTML parse_mode.
export function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function stripTags(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Turn Telegram-flavoured HTML into plain text for X / LinkedIn.
export function htmlToPlain(html) {
  return String(html)
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, "$2: $1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// "July 10, 2026" -> "2026-07-10" ("" when unparseable).
export function toISO(input) {
  const t = Date.parse(input);
  if (isNaN(t)) return "";
  const d = new Date(t);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isoOfDate(d) {
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${m}-${day}`;
}

// Days between now and an ISO date. Infinity when unparseable.
export function daysSince(iso) {
  const t = Date.parse(iso);
  if (isNaN(t)) return Infinity;
  return (Date.now() - t) / 86400000;
}

// Extract all <tr> rows of a table chunk as arrays of cleaned cell text.
export function tableRows(html) {
  const rows = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null) {
    const cells = [];
    const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let td;
    while ((td = tdRe.exec(tr[1])) !== null) cells.push(stripTags(td[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

export const DATE_CELL = /^[A-Z][a-z]+ \d{1,2},\s*20\d{2}$/;

// Sum only pure-numeric values ("Less than 10" / "N/A" are skipped).
export function sumNumeric(values) {
  let total = 0;
  for (const v of values) {
    const raw = String(v).replace(/,/g, "");
    if (/^\d+$/.test(raw)) total += parseInt(raw, 10);
  }
  return total;
}

export const SITE = "www.sugimotovisa.com";
