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

// The crop: the whole paragraph that holds the quote, full column width, so
// the screenshot reads as the original page and no line is cut at the sides.
// Lines are rebuilt from the text items (split where a wide gap marks another
// column); the paragraph ends where the gap between lines grows or a line
// starts indented. Very long paragraphs keep a window around the quote.
const MAX_LINES = 16;
function paragraphCrop(allBoxes, quoteBoxes, W, H) {
  const sorted = allBoxes.slice().sort((p, q) => p.y - q.y || p.x - q.x);
  const lines = [];
  for (const b of sorted) {
    const line = lines.find((l) => Math.abs(l.y - b.y) < b.h * 0.5 && b.x - l.x1 < b.h * 1.8 && l.x0 - (b.x + b.w) < b.h * 1.8);
    if (line) {
      line.x0 = Math.min(line.x0, b.x);
      line.x1 = Math.max(line.x1, b.x + b.w);
      line.y = Math.min(line.y, b.y);
      line.y1 = Math.max(line.y1, b.y + b.h);
    } else lines.push({ x0: b.x, x1: b.x + b.w, y: b.y, y1: b.y + b.h });
  }
  // A quote box belongs to the line its vertical middle falls in.
  const overlaps = (l, b) => !(b.x + b.w < l.x0 || b.x > l.x1) && b.y + b.h / 2 >= l.y && b.y + b.h / 2 <= l.y1;
  const hitLines = lines.filter((l) => quoteBoxes.some((b) => overlaps(l, b)));
  const colL = Math.min(...hitLines.map((l) => l.x0));
  const colR = Math.max(...hitLines.map((l) => l.x1));
  const colW = colR - colL;
  // The quote's column, top to bottom.
  const col = lines
    .filter((l) => l.x0 >= colL - colW * 0.15 && l.x1 <= colR + colW * 0.15 && l.x1 - l.x0 > 0)
    .sort((p, q) => p.y - q.y);
  const first = col.indexOf(hitLines.reduce((m, l) => (l.y < m.y ? l : m)));
  const last = col.indexOf(hitLines.reduce((m, l) => (l.y > m.y ? l : m)));
  const steps = col.slice(1).map((l, i) => l.y - col[i].y).filter((d) => d > 0).sort((p, q) => p - q);
  const step = steps.length ? steps[Math.floor(steps.length / 2)] : 20;
  const indent = step * 0.6;
  let i0 = first;
  while (i0 > 0) {
    const gap = col[i0].y - col[i0 - 1].y;
    if (gap > step * 1.45 || col[i0].x0 - colL > indent) break; // this line opens the paragraph
    i0--;
  }
  let i1 = last;
  while (i1 < col.length - 1) {
    const gap = col[i1 + 1].y - col[i1].y;
    if (gap > step * 1.45 || col[i1 + 1].x0 - colL > indent) break; // the next one opens another
    i1++;
  }
  // A long paragraph: keep the lines nearest the quote.
  while (i1 - i0 + 1 > MAX_LINES) {
    if (first - i0 > i1 - last) i0++;
    else i1--;
  }
  const keep = col.slice(i0, i1 + 1);
  const pad = PAD_PT * SCALE;
  const x0 = Math.min(colL, ...keep.map((l) => l.x0));
  const x1 = Math.max(colR, ...keep.map((l) => l.x1));
  const y0 = Math.min(...keep.map((l) => l.y));
  const y1 = Math.max(...keep.map((l) => l.y1));
  // Never reach into the line above or below the paragraph.
  const above = i0 > 0 ? col[i0 - 1].y1 + 1 : 0;
  const below = i1 < col.length - 1 ? col[i1 + 1].y - 1 : H;
  const left = Math.max(0, Math.floor(x0 - pad));
  const top = Math.max(0, Math.floor(Math.max(above, y0 - pad * 0.7)));
  return {
    left,
    top,
    width: Math.min(W - left, Math.ceil(x1 - x0 + pad * 2)),
    height: Math.max(1, Math.min(H - top, Math.floor(Math.min(below, y1 + pad * 0.7)) - top)),
  };
}

// buffers: the issue's PDF files. Returns { jpeg, width, height, page } or
// null when no page carries the quote.
export async function pdfQuoteShot(buffers, quote) {
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

        const viewport = page.getViewport({ scale: SCALE });
        // A PDF item is usually a whole line; the first and last are cut to
        // the quoted characters, in proportion to their length.
        const span = new Map();
        for (let k = hit.start; k < hit.end; k++) {
          const i = owner[k];
          const s = span.get(i) || { first: k, last: k };
          s.last = k;
          span.set(i, s);
        }
        const firstOf = new Map();
        owner.forEach((i, k) => firstOf.has(i) || firstOf.set(i, k));
        const boxes = [...span.entries()].map(([i, s]) => {
          const b = itemBox(items[i], viewport);
          const len = norm(items[i].str).length || 1;
          const a = (s.first - firstOf.get(i)) / len;
          const z = (s.last + 1 - firstOf.get(i)) / len;
          return { ...b, x: b.x + b.w * a, w: b.w * (z - a) };
        });
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

        const { left, top, width, height } = paragraphCrop(allBoxes, boxes, W, H);
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

