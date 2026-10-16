// A real screenshot from a web source: the page's own HTML and stylesheets,
// with the quoted sentence marked like a highlighter, photographed by a cloud
// browser and cropped to the paragraph that holds it. A second, plain shot of
// the top of the page shows the site's header and headline.
//
// Scripts are removed before the page is drawn: they are what moves or hides
// text after load (and what brings cookie walls), and the quote's position
// must be the one we found.

import { norm, locate } from "./match.js";
import { hctiImage } from "./hcti.js";

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

const SHOT_CSS = `mark.sv-mark{background:#ffe14d !important;color:inherit !important;padding:0 2px;border-radius:3px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
[data-sv-quote]{position:relative !important;z-index:2147483647 !important;padding:18px 22px !important;margin:0 !important;background:#fff !important;max-width:620px !important;float:none !important;width:auto !important}`;

// Returns { quote: url, masthead: url } (either may be "" when it failed).
export async function webQuoteShot(url, quote, { masthead = true } = {}) {
  const { html, finalUrl } = await fetchHtml(url);
  const prepared = prepareHtml(html, finalUrl, quote);
  if (!prepared || !prepared.hasBlock) throw new Error("the quoted sentence was not found on the source page");
  const [q, top] = await Promise.allSettled([
    hctiImage({ html: prepared.html, css: SHOT_CSS, selector: "[data-sv-quote]", viewport_width: 640, viewport_height: 1400, device_scale: 2, ms_delay: 600 }),
    masthead ? hctiImage({ url: finalUrl, viewport_width: 1000, viewport_height: 620, device_scale: 2, ms_delay: 1500 }) : Promise.resolve(""),
  ]);
  if (q.status !== "fulfilled") throw q.reason;
  return { quote: q.value, masthead: top.status === "fulfilled" ? top.value : "" };
}
