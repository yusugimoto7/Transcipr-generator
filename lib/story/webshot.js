// A real screenshot from a web source: the page's own HTML and stylesheets,
// with the quoted sentence marked like a highlighter, photographed by a cloud
// browser and cropped to the paragraph that holds it. No shot of the site's
// header: the team found a news site's logo, search box and buttons above the
// fact weird.
//
// Scripts are removed before the page is drawn: they are what moves or hides
// text after load (and what brings cookie walls), and the quote's position
// must be the one we found.

import { norm, locate } from "./match.js";
import { hctiImage, photographAreas } from "./hcti.js";
import { planWindow, stackPieces } from "./window.js";
import { keepImage } from "../carousel.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const TEXT_BLOCKS = ["p", "li", "blockquote", "h1", "h2", "h3", "h4", "h5", "h6", "td", "dd", "figcaption"];

export async function fetchHtml(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" } });
    if (!res.ok) throw new Error(`the source page answered ${res.status}`);
    return { html: await res.text(), finalUrl: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

// The visible text of the HTML, normalised, with the HTML position of each
// character. Tags, comments, scripts, styles and entities are skipped.
function htmlIndex(html) {
  let text = "";
  const pos = [];
  let i = 0;
  const n = html.length;
  while (i < n) {
    const ch = html[i];
    if (ch === "<") {
      const low = html.slice(i, i + 9).toLowerCase();
      let close = ">";
      if (low.startsWith("<!--")) close = "-->";
      else if (low.startsWith("<script")) close = "</script>";
      else if (low.startsWith("<style")) close = "</style>";
      const j = html.toLowerCase().indexOf(close, i + 1);
      i = j < 0 ? n : j + close.length;
      continue;
    }
    if (ch === "&") {
      const m = html.slice(i, i + 10).match(/^&#?\w+;/);
      if (m) {
        i += m[0].length;
        continue;
      }
    }
    const k = norm(ch);
    if (k) {
      text += k;
      pos.push(i);
    }
    i++;
  }
  return { text, pos };
}

// Wraps every text run between start and end in <mark>, so the highlight
// follows the sentence across links and bold text.
function markRange(html, start, end) {
  const inner = html.slice(start, end).replace(/(^|>)([^<]+)(?=<|$)/g, (m, gt, txt) => (txt.trim() ? `${gt}<mark class="sv-mark">${txt}</mark>` : m));
  return html.slice(0, start) + inner + html.slice(end);
}

// The innermost paragraph-like element still open at `at`; a div when the
// page puts text straight into divs.
function enclosingBlock(html, at) {
  const before = html.slice(0, at).toLowerCase();
  const openAt = (tag) => {
    const re = new RegExp(`<${tag}\\b[^>]*>`, "g");
    let m;
    let last = null;
    while ((m = re.exec(before))) last = { index: m.index, tag: html.slice(m.index, m.index + m[0].length) };
    // Closed again before the quote: the quote is not inside it.
    return last && before.indexOf(`</${tag}>`, last.index) < 0 ? last : null;
  };
  const innermost = (tags) => tags.map(openAt).filter(Boolean).sort((x, y) => y.index - x.index)[0] || null;
  return innermost(TEXT_BLOCKS) || innermost(["div", "section", "article"]);
}

export function prepareHtml(html, baseUrl, quote) {
  const idx = htmlIndex(html);
  const hit = locate(idx.text, quote);
  if (!hit) return null;
  const start = idx.pos[hit.start];
  const end = idx.pos[hit.end - 1] + 1;
  const block = enclosingBlock(html, start);
  let out = markRange(html, start, end);
  if (block) {
    out = out.slice(0, block.index) + block.tag.replace(/^<(\w+)/, '<$1 data-sv-quote="1"') + out.slice(block.index + block.tag.length);
  }
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const base = `<base href="${baseUrl.replace(/"/g, "&quot;")}">`;
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (h) => h + base) : base + out;
  return { html: out, hasBlock: !!block };
}

// A quote copied from an official table line ("Date: … | Invitations: 163")
// is found as its table row: every cell of the row is in the quote. The
// shot is the table with only its header row and that row, highlighted,
// since one cell or a bare row of numbers says nothing.
const cellText = (s) => norm(String(s || "").replace(/<[^>]+>/g, " ").replace(/&#?\w+;/g, " "));
function rowShotHtml(html, baseUrl, quote) {
  const q = norm(quote);
  let best = null;
  for (const m of html.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)) {
    const cells = [...m[0].matchAll(/<t([hd])\b[^>]*>([\s\S]*?)<\/t\1>/gi)];
    const texts = cells.map((c) => cellText(c[2])).filter(Boolean);
    if (texts.length < 2 || cells.some((c) => c[1].toLowerCase() === "h") || !texts.some((t) => /\d/.test(t))) continue;
    if (!texts.every((t) => q.includes(t))) continue;
    if (!best || texts.length > best.n) best = { index: m.index, n: texts.length };
  }
  if (!best) return null;
  const low = html.toLowerCase();
  const tStart = low.lastIndexOf("<table", best.index);
  const tEnd = low.indexOf("</table>", best.index);
  if (tStart < 0 || tEnd < 0) return null;
  let table = html.slice(tStart, tEnd + 8);
  const rowAt = best.index - tStart;
  const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)];
  const head = rows.find((r) => /<th\b/i.test(r[0])) || rows[0];
  // Every other row goes, from the end so earlier positions stay right.
  for (const r of rows.slice().reverse()) {
    if (r.index === rowAt) {
      const marked = r[0]
        .replace(/^<tr\b/i, '<tr data-sv-row="1"')
        .replace(/(<t[hd]\b[^>]*>)([\s\S]*?)(<\/t[hd]>)/gi, (m, a, inner, b) => a + inner.replace(/(^|>)([^<]+)(?=<|$)/g, (mm, gt, txt) => (txt.trim() ? `${gt}<mark class="sv-mark">${txt}</mark>` : mm)) + b);
      table = table.slice(0, r.index) + marked + table.slice(r.index + r[0].length);
    } else if (r !== head) {
      table = table.slice(0, r.index) + table.slice(r.index + r[0].length);
    }
  }
  table = table.replace(/^<table\b/i, '<table data-sv-quote="1"');
  let out = html.slice(0, tStart) + table + html.slice(tEnd + 8);
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  const base = `<base href="${baseUrl.replace(/"/g, "&quot;")}">`;
  out = /<head[^>]*>/i.test(out) ? out.replace(/<head[^>]*>/i, (h) => h + base) : base + out;
  return { html: out, hasBlock: true };
}

const SHOT_CSS = `mark.sv-mark{background:#ffe14d !important;color:inherit !important;padding:0 2px;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
[data-sv-quote]{position:relative !important;z-index:2147483647 !important;padding:18px 22px !important;margin:0 !important;background:#fff !important;max-width:620px !important;float:none !important;width:auto !important}
table[data-sv-quote] th,table[data-sv-quote] td{padding:8px 10px !important;border:1px solid #ddd !important;font-size:15px !important;text-align:left !important}
tr[data-sv-row] td{background:#fff8c4 !important}`;

export async function webQuoteShot(url, quote) {
  const { html, finalUrl } = await fetchHtml(url);
  let prepared = prepareHtml(html, finalUrl, quote);
  if (!prepared || !prepared.hasBlock) prepared = rowShotHtml(html, finalUrl, quote);
  if (!prepared || !prepared.hasBlock) throw new Error("the quoted sentence was not found on the source page");
  return { quote: await hctiImage({ html: prepared.html, css: SHOT_CSS, selector: "[data-sv-quote]", viewport_width: 640, viewport_height: 1400, device_scale: 2, ms_delay: 600 }) };
}

// ── the article itself (Nov 11 2026) ─────────────────────────────────────────
// Every quoted sentence marked (the page's main quote and the other important ones), scripts out.
function markAll(html, quotes) {
  const idx = htmlIndex(html);
  const ranges = [];
  for (const q of quotes) {
    const hit = q && locate(idx.text, q);
    if (!hit) continue;
    const r = [idx.pos[hit.start], idx.pos[hit.end - 1] + 1];
    if (!ranges.some(([a, b]) => r[0] < b && a < r[1])) ranges.push(r);
  }
  if (!ranges.length) return null;
  let out = html;
  for (const [a, b] of ranges.sort((x, y) => y[0] - x[0])) out = markRange(out, a, b);
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  return out;
}

const ARTICLE_CSS = `mark.sv-mark{background:#ffe14d !important;color:#111 !important;padding:0 2px;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
html,body{overflow:visible !important;height:auto !important}`;

// Runs in the page: hides what floats over the text (bars, cookie banners), then says where the
// article, its headline and the highlights are, in page pixels.
function measureArticle() {
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position === "fixed" || cs.position === "sticky") el.style.setProperty("display", "none", "important");
  }
  for (const el of document.querySelectorAll('[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[class*="newsletter-popup" i],[aria-modal="true"]')) el.style.setProperty("display", "none", "important");
  const sy = window.scrollY;
  const rect = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left, y: b.top + sy, w: b.width, h: b.height, b: b.bottom + sy, r: b.right };
  };
  const marks = [...document.querySelectorAll("mark.sv-mark")].map(rect).filter((m) => m.h > 0 && m.w > 0);
  if (!marks.length) return null;
  const first = document.querySelector("mark.sv-mark");
  let box = first.closest('article,main,[itemprop="articleBody"],[role="main"]');
  if (!box || (box.innerText || "").length > 60000) {
    box = first.parentElement;
    while (box.parentElement && box.parentElement !== document.body && (box.innerText || "").length < 1500) box = box.parentElement;
  }
  const B = rect(box);
  const markTop = Math.min(...marks.map((m) => m.y));
  const markBottom = Math.max(...marks.map((m) => m.b));
  // the headline above the highlights, in the article or just above it
  const h1 = [...document.querySelectorAll("h1")].map(rect).filter((h) => h.h > 0 && h.b <= markTop + 2 && h.y > B.y - 900).sort((p, q) => q.y - p.y)[0] || null;
  const top = Math.max(0, Math.min(B.y, h1 ? h1.y : B.y) - 10);
  const vw = document.documentElement.clientWidth;
  const left = Math.max(0, Math.min(B.x, h1 ? h1.x : B.x) - 8);
  const right = Math.min(vw, Math.max(B.r, h1 ? h1.r : 0, ...marks.map((m) => m.r)) + 8);
  // every line of text, so no cut goes through one
  const lines = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let n = walk.nextNode(); n && lines.length < 4000; n = walk.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.height > 0 && r.bottom + sy > top && r.top + sy < B.b + 400) lines.push([r.top + sy, r.bottom + sy]);
  }
  return { top, bottom: B.b + 10, head: h1 ? h1.b : 0, markTop, markBottom, left, right, vw, lines };
}

// The article from its headline down, with every quote highlighted, as wide as a phone shows it.
// `ratio` is the tallest shot the story has room for, as height over width.
export async function webArticleShot(url, quotes, { ratio = 0.95, name = "story-shot" } = {}) {
  const { html, finalUrl } = await fetchHtml(url);
  const marked = markAll(html, quotes);
  if (!marked) throw new Error("the quoted sentence was not found on the source page");
  const base = `<base href="${finalUrl.replace(/"/g, "&quot;")}">`;
  const doc = /<head[^>]*>/i.test(marked) ? marked.replace(/<head[^>]*>/i, (h) => h + base) : base + marked;
  const scale = 2.5;
  const res = await photographAreas({
    html: doc,
    css: ARTICLE_CSS,
    width: 540,
    scale,
    measure: measureArticle,
    plan: (m) => {
      const x = Math.floor(m.left);
      const width = Math.max(200, Math.ceil(m.right - m.left));
      // a cut that falls inside a line of text moves up to just above that line
      const clear = (y) => {
        for (let k = 0; k < 20; k++) {
          const l = m.lines.find(([a, b]) => a < y && y < b);
          if (!l) return y;
          y = l[0] - 2;
        }
        return y;
      };
      return planWindow({ top: m.top, bottom: m.bottom, head: m.head, markTop: m.markTop, markBottom: m.markBottom, maxH: width * ratio })
        .map(([y0, y1]) => [clear(y0), clear(y1)])
        .map(([y0, y1]) => ({ x, y: Math.floor(y0), width, height: Math.max(40, Math.ceil(y1 - y0)) }));
    },
  });
  if (!res) return null;
  const jpeg = await stackPieces(res.shots, scale);
  return (await keepImage(jpeg, name)).url;
}

// ── a post on a social network (Nov 12 2026) ─────────────────────────────────
// A post's own page is a login wall, so it cannot be photographed (a story from an X post failed with
// "the quoted sentence was not found on the source page"). The network's official public embed draws
// the same post for anyone: that is what is photographed, with the quoted sentences marked in it when
// the post's own words hold them (a quote from the video's transcript or from a linked page is not in
// the post, and the post is then shown unmarked: it is still the real source).
function embedOf(url) {
  let m = String(url).match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/);
  if (m) return { url: `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&theme=light&dnt=true&lang=en`, ready: "article", root: "article" };
  m = String(url).match(/instagram\.com\/(?:[^/]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
  if (m) return { url: `https://www.instagram.com/${m[1] === "reels" ? "reel" : m[1]}/${m[2]}/embed/captioned/`, ready: "body", root: ".Embed, body" };
  return null;
}

// Runs in the page: marks each quote found in the post's text, then says where the post is.
function measurePost({ quotes, root }) {
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const box = document.querySelector(root) || document.body;
  const nodes = [];
  const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.trim()) nodes.push(n);
  // the post's letters in order, each with the text node and offset it came from
  let text = "";
  const at = [];
  nodes.forEach((n, i) => {
    for (let k = 0; k < n.nodeValue.length; k++) {
      const c = norm(n.nodeValue[k]);
      if (c) {
        text += c;
        at.push([i, k]);
      }
    }
  });
  let marked = 0;
  const spans = [];
  for (const q of quotes || []) {
    const nq = norm(q);
    if (nq.length < 20) continue;
    let start = text.indexOf(nq), len = nq.length;
    // not word for word: the longest opening run of the quote the post does hold
    for (const win of [80, 50, 30]) {
      if (start >= 0 || nq.length < win) continue;
      for (let off = 0; off + win <= nq.length && start < 0; off += 10) {
        const i = text.indexOf(nq.slice(off, off + win));
        if (i >= 0) {
          start = i;
          len = win;
          while (off + len < nq.length && i + len < text.length && text[i + len] === nq[off + len]) len++;
        }
      }
    }
    if (start < 0) continue;
    spans.push([start, start + len - 1]);
  }
  // from the last to the first, so earlier positions stay right while nodes are split
  for (const [a, b] of spans.sort((x, y) => y[0] - x[0])) {
    const [n0, k0] = at[a], [n1, k1] = at[b];
    for (let i = n1; i >= n0; i--) {
      const node = nodes[i];
      const from = i === n0 ? k0 : 0;
      const to = i === n1 ? k1 + 1 : node.nodeValue.length;
      if (to <= from) continue;
      const r = document.createRange();
      r.setStart(node, from);
      r.setEnd(node, to);
      const mark = document.createElement("mark");
      mark.className = "sv-mark";
      try {
        r.surroundContents(mark);
        marked++;
      } catch (_) {}
    }
  }
  const b = box.getBoundingClientRect();
  const marks = [...document.querySelectorAll("mark.sv-mark")].map((m) => m.getBoundingClientRect()).filter((r) => r.height > 0);
  return {
    marked,
    x: Math.max(0, b.left + window.scrollX), y: Math.max(0, b.top + window.scrollY), w: b.width, h: b.height,
    markTop: marks.length ? Math.min(...marks.map((r) => r.top + window.scrollY)) : -1,
    markBottom: marks.length ? Math.max(...marks.map((r) => r.bottom + window.scrollY)) : -1,
  };
}

// { url, marked } or null when the network has no public embed (or no browser of our own).
export async function socialPostShot(url, quotes, { ratio = 0.95, name = "story-shot" } = {}) {
  const e = embedOf(url);
  if (!e) return null;
  const scale = 2.5;
  let info = null;
  const res = await photographAreas({
    url: e.url,
    ready: e.ready,
    css: ARTICLE_CSS,
    width: 540,
    scale,
    measure: measurePost,
    arg: { quotes, root: e.root },
    plan: (m) => {
      info = m;
      if (!m || m.w < 100 || m.h < 60) return null;
      const maxH = m.w * ratio;
      // the whole post when it fits, else the part around the marked sentences (or its top)
      let y = m.y, h = m.h;
      if (m.h > maxH) {
        h = maxH;
        if (m.markTop >= 0) y = Math.max(m.y, Math.min(m.markTop - maxH * 0.3, m.y + m.h - maxH));
      }
      return [{ x: Math.floor(m.x), y: Math.floor(y), width: Math.ceil(m.w), height: Math.ceil(h) }];
    },
  });
  if (!res) return null;
  const jpeg = await stackPieces(res.shots, scale);
  return { url: (await keepImage(jpeg, name)).url, marked: (info && info.marked) || 0 };
}

export { rowShotHtml };
