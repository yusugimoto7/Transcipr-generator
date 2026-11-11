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
function pageWindow(allBoxes, marks, W, H, ratio) {
  const pad = PAD_PT * SCALE;
  const left = Math.max(0, Math.floor(Math.min(...allBoxes.map((b) => b.x)) - pad));
  const right = Math.min(W, Math.ceil(Math.max(...allBoxes.map((b) => b.x + b.w)) + pad));
  const cTop = Math.max(0, Math.min(...allBoxes.map((b) => b.y)) - pad);
  const cBottom = Math.min(H, Math.max(...allBoxes.map((b) => b.y + b.h)) + pad);
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
  top = Math.max(0, clear(top));
  const bottom = clear(Math.min(H, top + maxH));
  return { left, top: Math.floor(top), width, height: Math.max(1, Math.floor(bottom - top)) };
}

// buffers: the issue's PDF files; quote: the page's sentence, also: the other important sentences
// (highlighted too when they are on the same page). Returns { jpeg, width, height, page } or
// null when no page carries the quote.
export async function pdfQuoteShot(buffers, quote, { also = [], ratio = 0.95 } = {}) {
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

        const { left, top, width, height } = pageWindow(allBoxes, boxes, W, H, ratio);
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

