// A real screenshot from a PDF (Lexbase): find the sentence a story quotes,
// render that page, mark the sentence like a highlighter and crop around it.
//
// pdf.js does both jobs, the text positions and the drawing, with a prebuilt
// canvas package, so nothing has to be installed on the server itself.

import path from "node:path";
import sharp from "sharp";
import { norm, locate } from "./match.js";

const SCALE = 2.5; // ~180 dpi: sharp on a phone, small enough to send
const PAD_PT = 14; // margin around the quote, in PDF points

let pdfjsPromise = null;
function pdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

function assetDir(name) {
  return path.join(process.cwd(), "node_modules", "pdfjs-dist", name) + path.sep;
}

// The page's text as one normalised string, with the item each character
// came from.
function pageIndex(items) {
  let text = "";
  const owner = [];
  items.forEach((it, i) => {
    const n = norm(it.str);
    text += n;
    for (let k = 0; k < n.length; k++) owner.push(i);
  });
  return { text, owner };
}

function itemBox(it, viewport) {
  const [, , c, d, e, f] = it.transform;
  const h = it.height || Math.hypot(c, d) || 10;
  const [x1, y1] = viewport.convertToViewportPoint(e, f - h * 0.25);
  const [x2, y2] = viewport.convertToViewportPoint(e + it.width, f + h);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

// The part of the page a story shows (Hamed, Nov 11 2026: "the full screenshot, not one or two
// sentences"): the page's whole text width, as tall as the story has room for (`ratio` = height over
// width), with the highlights a third of the way down so the lines before them show what they follow.
function pageWindow(allBoxes, marks, W, H, ratio, within = null) {
  const pad = PAD_PT * SCALE;
  const left = Math.max(0, Math.floor(Math.min(...allBoxes.map((b) => b.x)) - pad));
  const right = Math.min(W, Math.ceil(Math.max(...allBoxes.map((b) => b.x + b.w)) + pad));
  // `within`: the one item of the page the story is about (a newsletter page holds several court
  // decisions; Hamed, Nov 12 2026: "the screenshot must include only the relevant court decision").
  // The shot never reaches into the item above or below it.
  let cTop = Math.max(0, (within ? within.top : Math.min(...allBoxes.map((b) => b.y))) - pad * (within ? 0.5 : 1));
  let cBottom = Math.min(H, (within ? within.bottom : Math.max(...allBoxes.map((b) => b.y + b.h))) + pad * (within ? 0.5 : 1));
  if (within) {
    // the margin around the item stops at the neighbouring lines
    const above = allBoxes.filter((b) => b.y + b.h <= within.top + 1).map((b) => b.y + b.h);
    const below = allBoxes.filter((b) => b.y >= within.bottom - 1).map((b) => b.y);
    if (above.length) cTop = Math.max(cTop, Math.max(...above) + 2);
    if (below.length) cBottom = Math.min(cBottom, Math.min(...below) - 2);
    const inside = marks.filter((b) => b.y + b.h / 2 >= within.top && b.y + b.h / 2 <= within.bottom);
    if (inside.length) marks = inside;
  }
  const width = right - left;
  const maxH = Math.min(cBottom - cTop, Math.round(width * ratio));
  const mTop = Math.min(...marks.map((b) => b.y));
  const mBottom = Math.max(...marks.map((b) => b.y + b.h));
  let top = mBottom - mTop + pad * 2 >= maxH ? mTop - pad : mTop - (maxH - (mBottom - mTop)) * 0.3;
  top = Math.max(cTop, Math.min(top, cBottom - maxH));
  // no edge through a line of text: an edge inside one moves up to just above it
  const clear = (y) => {
    for (let k = 0; k < 20; k++) {
      const b = allBoxes.find((x) => x.y < y && y < x.y + x.h);
      if (!b) return y;
      y = b.y - 2;
    }
    return y;
  };
  // an item's own edges are already between lines; only a cut inside it is moved
  top = Math.max(0, within && top <= cTop + 1 ? top : clear(top));
  const bottom = within && top + maxH >= cBottom - 1 ? Math.min(H, top + maxH) : clear(Math.min(H, top + maxH));
  return { left, top: Math.floor(top), width, height: Math.max(1, Math.floor(bottom - top)) };
}

// Where one item of the issue sits on a page: from its heading (or its first line) to its last line.
// The item's stored text and the page never agree on every character, so its start and its end are
// each looked for by a run of their letters; an end that is on another page leaves that side open.
function itemExtent(item, text, owner, items, viewport, quoteAt) {
  if (!item || !item.text) return null;
  const t = norm(item.text);
  if (t.length < 60) return null;
  const find = (probe, from = 0) => (probe.length >= 20 ? text.indexOf(probe, from) : -1);
  let start = -1;
  for (const off of [0, 15, 40, 80]) {
    const i = find(t.slice(off, off + 50));
    if (i >= 0 && i <= quoteAt) {
      start = i;
      break;
    }
  }
  let end = -1;
  for (const off of [0, 15, 40, 80]) {
    const probe = t.slice(Math.max(0, t.length - off - 50), t.length - off);
    const i = text.lastIndexOf(probe);
    if (probe.length >= 20 && i >= 0 && i + probe.length >= quoteAt) {
      end = i + probe.length - 1;
      break;
    }
  }
  if (start < 0 && end < 0) return null;
  const boxAt = (k) => itemBox(items[owner[k]], viewport);
  let top = start >= 0 ? boxAt(start).y : 0;
  // the item's heading sits just above its first line
  const title = norm(item.title || "");
  if (start >= 0 && title.length >= 12) {
    const ti = text.lastIndexOf(title.slice(0, 40), start);
    if (ti >= 0 && start - ti < title.length + 200) top = Math.min(top, boxAt(ti).y);
  }
  const eb = end >= 0 ? boxAt(end) : null;
  return { top: start >= 0 ? top : 0, bottom: eb ? eb.y + eb.h : Infinity };
}

// buffers: the issue's PDF files; quote: the page's sentence, also: the other important sentences
// (highlighted too when they are on the same page); item: { title, text } of the newsletter item the
// story is about, which the shot stays inside. Returns { jpeg, width, height, page } or null when no
// page carries the quote.
export async function pdfQuoteShot(buffers, quote, { also = [], ratio = 0.95, item = null } = {}) {
  const { getDocument } = await pdfjs();
  for (const buf of buffers) {
    const doc = await getDocument({
      data: new Uint8Array(buf),
      standardFontDataUrl: assetDir("standard_fonts"),
      cMapUrl: assetDir("cmaps"),
      cMapPacked: true,
      isEvalSupported: false,
    }).promise;
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const items = content.items.filter((it) => it.str !== undefined);
        const { text, owner } = pageIndex(items);
        const hit = locate(text, quote);
        if (!hit) continue;
        const hits = [hit, ...also.map((q) => q && locate(text, q)).filter((h) => h && !(h.start < hit.end && hit.start < h.end))];

        const viewport = page.getViewport({ scale: SCALE });
        // A PDF item is usually a whole line; the first and last are cut to
        // the quoted characters, in proportion to their length.
        const firstOf = new Map();
        owner.forEach((i, k) => firstOf.has(i) || firstOf.set(i, k));
        const boxesOf = (h) => {
          const span = new Map();
          for (let k = h.start; k < h.end; k++) {
            const i = owner[k];
            const s = span.get(i) || { first: k, last: k };
            s.last = k;
            span.set(i, s);
          }
          return [...span.entries()].map(([i, s]) => {
            const b = itemBox(items[i], viewport);
            const len = norm(items[i].str).length || 1;
            const a = (s.first - firstOf.get(i)) / len;
            const z = (s.last + 1 - firstOf.get(i)) / len;
            return { ...b, x: b.x + b.w * a, w: b.w * (z - a) };
          });
        };
        const boxes = hits.flatMap(boxesOf);
        const allBoxes = items.filter((it) => it.str.trim()).map((it) => itemBox(it, viewport));
        const W = Math.ceil(viewport.width);
        const H = Math.ceil(viewport.height);
        const { canvas, context } = doc.canvasFactory.create(W, H);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, W, H);
        await page.render({ canvasContext: context, viewport, canvas }).promise;

        // Highlighter: multiply keeps the ink black under the colour.
        context.save();
        context.globalCompositeOperation = "multiply";
        context.fillStyle = "#ffe14d";
        for (const b of boxes) context.fillRect(b.x - 3, b.y, b.w + 6, b.h);
        context.restore();

        const ext = itemExtent(item, text, owner, items, viewport, hit.start);
        const within = ext ? { top: Math.max(0, ext.top), bottom: Math.min(H, ext.bottom === Infinity ? Math.max(...allBoxes.map((b) => b.y + b.h)) : ext.bottom) } : null;
        const { left, top, width, height } = pageWindow(allBoxes, boxes, W, H, ratio, within);
        const png = canvas.toBuffer("image/png");
        const jpeg = await sharp(png).extract({ left, top, width, height }).jpeg({ quality: 88 }).toBuffer();
        page.cleanup();
        return { jpeg, width, height, page: p };
      }
    } finally {
      await doc.destroy().catch(() => {});
    }
  }
  return null;
}

