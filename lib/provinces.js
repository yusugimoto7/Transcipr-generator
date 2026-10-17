// Provincial nominee draws, from the province itself. News sites report a
// PNP draw a day later with their own header and ads around it; the
// province's own page is the original. For a draw topic this finds the
// province's official results page and checks that it really holds THIS
// draw (the invitation count next to a date within a week of the news)
// before anything uses it, so a page that only lists other draws is never
// taken as the source.
//
// Official tables are turned into "header: value | header: value" lines:
// a row of bare numbers means nothing on its own, and a quote copied from
// such a line can still be found in the text (lib/story) and photographed
// as its row with the table's header (lib/story/webshot.js).

import { fetchHtml } from "./story/webshot.js";

const PROVINCES = [
  { key: "pe", name: "Prince Edward Island (official)", re: /prince edward island|\bP\.?E\.?I\b|پرنس ادوارد/i, pages: () => ["https://www.princeedwardisland.ca/en/information/office-of-immigration/expression-of-interest-draws"] },
  { key: "bc", name: "British Columbia PNP (official)", re: /british columbia|\bB\.?C\.? ?PNP\b|بریتیش کلمبیا/i, pages: () => ["https://www.welcomebc.ca/Immigrate-to-B-C/Invitations-To-Apply"] },
  { key: "on", name: "Ontario OINP (official)", re: /ontario|\bOINP\b|انتاریو|انتاریو/i, pages: (y) => [`https://www.ontario.ca/page/${y}-ontario-immigrant-nominee-program-updates`] },
  // The index lists each draw as its own post; the newest few are read.
  { key: "mb", name: "Manitoba MPNP (official)", re: /manitoba|\bMPNP\b|منیتوبا|مانیتوبا/i, pages: () => ["https://immigratemanitoba.com/draws/"], follow: /https:\/\/immigratemanitoba\.com\/\d{4}\/\d{2}\/expression-of-interest-draw-\d+\/?/g },
  { key: "sk", name: "Saskatchewan SINP (official)", re: /saskatchewan|\bSINP\b|ساسکاچوان/i, pages: () => ["https://www.saskatchewan.ca/residents/moving-to-saskatchewan/live-in-saskatchewan/by-immigrating/saskatchewan-immigrant-nominee-program/browse-sinp-programs/applicants-international-skilled-workers/international-skilled-worker-eoi-system"] },
  { key: "ab", name: "Alberta AAIP (official)", re: /alberta|\bAAIP\b|آلبرتا/i, pages: () => ["https://www.alberta.ca/aaip-processing-information"] },
  { key: "ns", name: "Nova Scotia NSNP (official)", re: /nova scotia|\bNSNP\b|نوا ?اسکوشیا/i, pages: () => ["https://liveinnovascotia.com/eoi-selection"] },
  { key: "nb", name: "New Brunswick NBPNP (official)", re: /new brunswick|\bNBPNP\b|نیو ?برانزویک/i, pages: () => ["https://www.gnb.ca/en/topic/family-home-community/immigration/provincial-nominee-program.html"] },
  { key: "nl", name: "Newfoundland and Labrador NLPNP (official)", re: /newfoundland|\bNLPNP\b|نیوفاندلند/i, pages: () => ["https://www.gov.nl.ca/immigration/invitations-to-apply-updates/"] },
];

const DRAW = /\bdraws?\b|invitations?|\bITAs?\b|\bLAAs?\b|letters? of advice|\bEOI\b|selection|قرعه|دعوت/i;

function about(topic) {
  return [topic.title_en, topic.title_fa, topic.why_now, String(topic.snippet || "").slice(0, 600)].filter(Boolean).join(" \n ");
}

export function provinceOf(topic) {
  if (!topic || topic.newsletter === "lexbase" || topic.evergreen || topic.custom) return null;
  const t = about(topic);
  if (!DRAW.test(t)) return null;
  // The title decides when it names a province; the excerpt only when the title does not.
  const head = [topic.title_en, topic.title_fa].filter(Boolean).join(" ");
  return PROVINCES.find((p) => p.re.test(head)) || PROVINCES.find((p) => p.re.test(t)) || null;
}

// ---- page text ----------------------------------------------------------

const decode = (s) =>
  String(s || "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ndash;|&#8211;/g, "–")
    .replace(/&#\d+;|&\w+;/g, " ");
const strip = (s) => decode(String(s || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Each table as "header: value | …" lines (plain "a | b" when it has no header).
export function tableLines(table) {
  const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((m) => [...m[0].matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)].map((c) => ({ th: c[1].toLowerCase() === "h", text: strip(c[2]) })));
  if (!rows.length) return [];
  // Only a row of <th> with some words in it is a header; otherwise every row is data.
  let headIdx = rows.findIndex((r) => r.length && r.every((c) => c.th) && r.some((c) => c.text));
  // Some pages write the header as an ordinary first row: words, no numbers.
  if (headIdx < 0 && rows[0].length > 1 && rows[0].every((c) => c.text && !/\d/.test(c.text))) headIdx = 0;
  const head = headIdx >= 0 ? rows[headIdx].map((c) => c.text) : [];
  const body = rows.filter((r, i) => i !== headIdx && r.length && r.some((c) => c.text));
  return body.map((r) => r.map((c, i) => (head[i] ? `${head[i]}: ${c.text || "-"}` : c.text)).filter(Boolean).join(" | "));
}

// The page's readable text, tables as lines, scripts and menus left out.
export function officialText(html) {
  // The page's own title and date sit outside <main> on some sites (a draw post's date).
  const title = strip((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const after = html.slice(Math.max(0, html.search(/<h1\b/i)));
  const time =
    strip((html.match(/<time\b[^>]*>([\s\S]*?)<\/time>/i) || [])[1]) ||
    (strip(after.slice(0, 4000)).match(/\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}\b/) || [])[0] ||
    "";
  let main = (html.match(/<main[\s\S]*?<\/main>/i) || [])[0] || (html.match(/<article[\s\S]*?<\/article>/i) || [])[0] || html;
  main = main.replace(/<(script|style|noscript|nav|header|footer|form)\b[\s\S]*?<\/\1>/gi, " ");
  const tables = [];
  main = main.replace(/<table\b[\s\S]*?<\/table>/gi, (t) => {
    tables.push(tableLines(t).join("\n"));
    return `\n@@TABLE${tables.length - 1}@@\n`;
  });
  const text = main
    .replace(/<\/(p|li|h[1-6]|div|section|dd|dt)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decode([title, time].filter(Boolean).join("\n") + "\n" + text)
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/@@TABLE(\d+)@@/g, (m, i) => tables[Number(i)] || "");
}

// ---- is it THIS draw? -----------------------------------------------------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Ways a page may write each day from a week before the news to a day after.
function dateForms(iso) {
  const t = Date.parse(String(iso || "").slice(0, 10) + "T12:00:00Z");
  if (isNaN(t)) return [];
  const out = [];
  for (let k = -7; k <= 1; k++) {
    const d = new Date(t + k * 864e5);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const p = (n) => String(n).padStart(2, "0");
    const M = MONTHS[m - 1];
    // Monthly tables (Nova Scotia) give only the month.
    if (k === -7 || day === 1) out.push(`${M} ${y}`);
    out.push(`${m}/${day}/${y}`, `${p(m)}/${p(day)}/${y}`, `${y}-${p(m)}-${p(day)}`, `${M} ${day}, ${y}`, `${M.slice(0, 3)}. ${day}, ${y}`, `${M.slice(0, 3)} ${day}, ${y}`, `${day} ${M} ${y}`);
  }
  return out.map((s) => s.toLowerCase());
}

// Invitation counts named in the news (not years, not draw numbers).
function countsOf(topic) {
  const t = [topic.title_en, topic.why_now, topic.title_fa].filter(Boolean).join(" ").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const out = new Set();
  for (const m of t.matchAll(/(#|no\.?\s*)?\b(\d{1,3}(?:,\d{3})+|\d{2,5})\b/gi)) {
    if (m[1]) continue;
    const n = Number(m[2].replace(/,/g, ""));
    if (n >= 10 && !(n >= 2015 && n <= 2035)) out.add(n);
  }
  return [...out];
}

// The line or paragraph of the page that holds the draw, or "".
// `post`: the page is one draw's own post, so its date may be anywhere on it.
export function drawEvidence(text, topic, { post = false } = {}) {
  const counts = countsOf(topic);
  const dates = dateForms(topic.date);
  if (!counts.length || !dates.length) return "";
  const lines = String(text || "").split("\n");
  const whole = String(text || "").toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    // A table row or paragraph holds the date and count together, or a few lines apart.
    const near = post ? whole : lines.slice(Math.max(0, i - 3), i + 4).join(" ").toLowerCase();
    const line = lines[i];
    const hasCount = counts.some((n) => new RegExp(`(^|[^\\d,])(${n}|${n.toLocaleString("en-US")})(?![\\d,])`).test(line));
    if (hasCount && dates.some((d) => near.includes(d))) return line;
  }
  return "";
}

const cache = new Map(); // topic key -> { at, value }
const TTL_MS = 30 * 60 * 1000;

async function readPage(url) {
  try {
    const { html, finalUrl } = await fetchHtml(url, 15000);
    return { url: finalUrl || url, html, text: officialText(html) };
  } catch (_) {
    return null;
  }
}

// { url, name, text, evidence } for the official page that holds this draw,
// or null (not a provincial draw, the page is down, or it has no such draw).
export async function officialDrawSource(topic) {
  const prov = provinceOf(topic);
  if (!prov) return null;
  const key = `${prov.key}:${topic.title_en || topic.title_fa}:${topic.date || ""}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const year = String(topic.date || "").slice(0, 4) || String(new Date().getUTCFullYear());
  let value = null;
  for (const url of prov.pages(year)) {
    const page = await readPage(url);
    if (!page) continue;
    const candidates = [page];
    if (prov.follow) {
      let links = [...new Set(page.html.match(prov.follow) || [])];
      // A draw named by its number is read first.
      const num = (about(topic).match(/(?:#|draw\s*(?:no\.?\s*)?)(\d{2,4})\b/i) || [])[1];
      if (num) links = [...links.filter((l) => new RegExp(`-${num}/?$`).test(l)), ...links.filter((l) => !new RegExp(`-${num}/?$`).test(l))];
      for (const l of links.slice(0, 4).reverse()) {
        const p = await readPage(l);
        if (p) candidates.unshift({ ...p, post: true }); // a draw's own post beats the index
      }
    }
    for (const c of candidates) {
      const evidence = drawEvidence(c.text, topic, { post: !!c.post });
      if (evidence) {
        // Keep the evidence in what is handed on, however far down the page it is.
        const at = c.text.indexOf(evidence);
        const text = at < 10000 ? c.text.slice(0, 12000) : c.text.slice(0, 4000) + "\n…\n" + c.text.slice(Math.max(0, at - 3000), at + 5000);
        value = { url: c.url, name: prov.name, text, evidence };
        break;
      }
    }
    if (value) break;
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
