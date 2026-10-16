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

        const pad = PAD_PT * SCALE;
        const minX = Math.min(...boxes.map((b) => b.x));
        const maxX = Math.max(...boxes.map((b) => b.x + b.w));
        // One line of context above and below, so it reads as a page.
        const lineH = Math.max(...boxes.map((b) => b.h));
        const minY = Math.min(...boxes.map((b) => b.y)) - lineH * 1.6;
        const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + lineH * 1.6;
        // Whole lines only: grow the band over any line it cuts through.
        let y0 = minY;
        let y1 = maxY;
        for (const b of allBoxes) {
          if (b.x + b.w < minX || b.x > maxX) continue;
          if (b.y < y0 && b.y + b.h > y0) y0 = b.y;
          if (b.y < y1 && b.y + b.h > y1) y1 = b.y + b.h;
        }
        const left = Math.max(0, Math.floor(minX - pad));
        const top = Math.max(0, Math.floor(y0 - 4 * SCALE));
        const width = Math.min(W - left, Math.ceil(maxX - minX + pad * 2));
        const height = Math.min(H - top, Math.ceil(y1 - y0 + 8 * SCALE));

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

// The top of the issue's first page (its masthead and date), shown above the
// quote so the screenshot says where it comes from.
export async function pdfMasthead(buffers, fraction = 0.2) {
  const { getDocument } = await pdfjs();
  const doc = await getDocument({
    data: new Uint8Array(buffers[0]),
    standardFontDataUrl: assetDir("standard_fonts"),
    cMapUrl: assetDir("cmaps"),
    cMapPacked: true,
    isEvalSupported: false,
  }).promise;
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: SCALE });
    const W = Math.ceil(viewport.width);
    const H = Math.ceil(viewport.height);
    const { canvas, context } = doc.canvasFactory.create(W, H);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, W, H);
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    const height = Math.round(H * fraction);
    const jpeg = await sharp(canvas.toBuffer("image/png")).extract({ left: 0, top: 0, width: W, height }).jpeg({ quality: 85 }).toBuffer();
    return { jpeg, width: W, height };
  } finally {
    await doc.destroy().catch(() => {});
  }
}
