// What a newsletter's PDF shows as a picture and its text layer therefore lacks: a table pasted from
// an access-to-information release, a chart, a screenshot of an email (Hamed, Nov 25 2026: the item
// «Forecast – 14,702,000 Temporary Residents in 2027» reached the writer without its table, so the
// script and the story were about the table's footnotes and never said the number).
//
// Each page is drawn, and every band of it that holds ink outside all of its lines of text is a
// picture. The band is cut out and a vision model copies what is written in it; the words go into
// the issue's text where the picture is printed, marked as read from a picture. Nothing is inferred
// from a picture: only what is written in it.

import path from "node:path";
import sharp from "sharp";
import { transcribeImages } from "../image-text.js";

const SCALE = 1.5; // enough to read a pasted table, small enough to draw eighteen pages
const GAP = 14; // white rows inside one picture (between a table's rows)
const MIN_H = 42;
export const FIG_OPEN = "[TABLE OR FIGURE printed here as a picture; its content, read from the picture:";
export const FIG_CLOSE = "— end of the picture]";

let pdfjsPromise = null;
function pdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}
const assetDir = (name) => path.join(process.cwd(), "node_modules", "pdfjs-dist", name) + path.sep;

function itemBox(it, viewport) {
  const [, , c, d, e, f] = it.transform;
  const h = it.height || Math.hypot(c, d) || 10;
  const [x1, y1] = viewport.convertToViewportPoint(e, f - h * 0.25);
  const [x2, y2] = viewport.convertToViewportPoint(e + it.width, f + h);
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1), str: it.str };
}

// The bands of a drawn page (grey pixels, W×H) that hold ink outside every line of text.
export function figureBands(gray, W, H, boxes) {
  const mask = new Uint8Array(W * H);
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x - 4));
    const x1 = Math.min(W, Math.ceil(b.x + b.w + 4));
    const y0 = Math.max(0, Math.floor(b.y - 3));
    const y1 = Math.min(H, Math.ceil(b.y + b.h + 5)); // an underline sits just under its line
    for (let y = y0; y < y1; y++) mask.fill(1, y * W + x0, y * W + x1);
  }
  // a frame around the page: columns that are dark over most of its height are rules, not content
  const col = new Uint32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (gray[y * W + x] < 200) col[x]++;
  const rule = new Uint8Array(W);
  for (let x = 0; x < W; x++) if (col[x] > H * 0.5) rule[x] = 1;
  const rowInk = new Uint32Array(H);
  for (let y = 0; y < H; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) if (!rule[x] && !mask[y * W + x] && gray[y * W + x] < 200) n++;
    rowInk[y] = n;
  }
  const bands = [];
  let start = -1;
  let last = -1;
  const close = () => {
    if (start < 0) return;
    const top = start;
    const bottom = last + 1;
    let ink = 0;
    let left = W;
    let right = 0;
    for (let y = top; y < bottom; y++) {
      ink += rowInk[y];
      if (!rowInk[y]) continue;
      for (let x = 0; x < W; x++) {
        if (rule[x] || mask[y * W + x] || gray[y * W + x] >= 200) continue;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
    const h = bottom - top;
    // a picture is tall enough to hold words and wide enough to be more than a bullet or a rule's end
    if (h >= MIN_H && right - left >= W * 0.18 && ink >= 1200 && ink / (h * Math.max(1, right - left)) >= 0.004) bands.push({ top, bottom, left, right: right + 1 });
    start = -1;
  };
  for (let y = 0; y < H; y++) {
    if (rowInk[y] >= 14) {
      if (start < 0) start = y;
      last = y;
    } else if (start >= 0 && y - last > GAP) close();
  }
  close();
  return bands;
}

// One line of the page's text: the items that share a baseline, left to right.
function lineAt(boxes, y) {
  return boxes
    .filter((b) => Math.abs(b.y - y) < 4)
    .sort((a, b) => a.x - b.x)
    .map((b) => b.str)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// Every picture of the issue's PDFs, in reading order: { page, anchor, after, data }. `anchor` is the
// line of text printed just above it and `after` the one just under it, which place it in the text.
export async function findFigures(buffers, { maxFigures = 40 } = {}) {
  const { getDocument } = await pdfjs();
  const out = [];
  for (const buf of buffers) {
    const doc = await getDocument({
      data: new Uint8Array(buf),
      standardFontDataUrl: assetDir("standard_fonts"),
      cMapUrl: assetDir("cmaps"),
      cMapPacked: true,
      isEvalSupported: false,
    }).promise;
    try {
      for (let p = 1; p <= doc.numPages && out.length < maxFigures; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: SCALE });
        const content = await page.getTextContent();
        const boxes = content.items.filter((it) => it.str !== undefined && it.str.trim()).map((it) => itemBox(it, viewport));
        const W = Math.ceil(viewport.width);
        const H = Math.ceil(viewport.height);
        const { canvas, context } = doc.canvasFactory.create(W, H);
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, W, H);
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        const png = canvas.toBuffer("image/png");
        page.cleanup();
        const { data: gray, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
        // one grey channel is asked for; a build that keeps more is read by its stride
        const ch = info.channels || 1;
        const g = ch === 1 ? gray : gray.filter((_, i) => i % ch === 0);
        for (const b of figureBands(g, info.width, info.height, boxes)) {
          const above = boxes.filter((x) => x.y + x.h <= b.top + 6);
          const below = boxes.filter((x) => x.y >= b.bottom - 6);
          const ay = above.length ? Math.max(...above.map((x) => x.y)) : null;
          const by = below.length ? Math.min(...below.map((x) => x.y)) : null;
          const pad = 10;
          const left = Math.max(0, b.left - pad);
          const top = Math.max(0, b.top - pad);
          const width = Math.min(info.width - left, b.right - b.left + pad * 2);
          const height = Math.min(info.height - top, b.bottom - b.top + pad * 2);
          const jpeg = await sharp(png).extract({ left, top, width, height }).jpeg({ quality: 86 }).toBuffer();
          out.push({
            page: p,
            anchor: ay == null ? "" : lineAt(above, ay).slice(-90),
            after: by == null ? "" : lineAt(below, by).slice(0, 90),
            data: "data:image/jpeg;base64," + jpeg.toString("base64"),
          });
        }
      }
    } finally {
      await doc.destroy().catch(() => {});
    }
  }
  return out;
}

// What is written in each picture, copied by the vision model; a picture with no words is dropped.
export async function readFigures(found) {
  const out = [];
  for (let i = 0; i < found.length; i += 4) {
    const batch = found.slice(i, i + 4);
    const read = await transcribeImages(batch.map((f, k) => ({ data: f.data, name: `figure-${i + k + 1}` })));
    batch.forEach((f, k) => {
      const text = String((read[k] && read[k].text) || "").replace(/\[unreadable\]/gi, "").trim();
      if (text.replace(/[^\p{L}\p{N}]/gu, "").length >= 12) out.push({ page: f.page, anchor: f.anchor, after: f.after, text: text.slice(0, 4000) });
    });
  }
  return out;
}

// Where a line sits in the text, whatever the two make of spaces: the index just after it (or just
// before it, for `before`), looked for from `from` on.
const squash = (s) => String(s || "").replace(/\s+/g, "");
function findLine(text, line, from, { before = false } = {}) {
  const needle = squash(line);
  if (needle.length < 12) return -1;
  // the text without its spaces, with the place each kept character came from
  const map = [];
  let flat = "";
  for (let i = from; i < text.length; i++) {
    if (/\s/.test(text[i])) continue;
    flat += text[i];
    map.push(i);
  }
  for (const probe of before ? [needle.slice(0, 60), needle.slice(0, 30)] : [needle.slice(-60), needle.slice(-30)]) {
    if (probe.length < 12) continue;
    const at = flat.indexOf(probe);
    if (at >= 0) return before ? map[at] : map[at + probe.length - 1] + 1;
  }
  return -1;
}

// The issue's text with each picture's words where the picture is printed. A picture whose place
// cannot be found is left out (and counted), never put somewhere else.
export function insertFigures(text, figures) {
  let out = String(text || "");
  let from = 0;
  let placed = 0;
  for (const f of figures || []) {
    // a picture whose words the text layer already holds (drawn text, not an image) adds nothing
    if (squash(out).includes(squash(f.text).slice(0, 60))) continue;
    let at = findLine(out, f.anchor, from);
    if (at < 0) at = findLine(out, f.after, from, { before: true });
    if (at < 0) continue;
    const block = `\n${FIG_OPEN} ${String(f.text).replace(/\s*\n+\s*/g, " // ")} ${FIG_CLOSE}\n`;
    out = out.slice(0, at) + block + out.slice(at);
    from = at + block.length;
    placed++;
  }
  return { text: out, placed };
}
