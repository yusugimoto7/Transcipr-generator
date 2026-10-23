// Draws the visa-result stories after a person has checked the boxes: each picture is covered
// where it must be (solid boxes burned into the pixels, so nothing can be uncovered later) and
// its dates are marked, then one or two pictures and the client's lines make one 9:16 story.
// Only covered pictures ever leave this server: they are kept (WordPress media, else memory) so
// the story renderer can load them, and the original uploads are never stored.

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { bufferOf, keepLinesOf } from "./scan.js";
import { keepImage, memoryImage } from "../carousel.js";
import { hctiImage, hctiEnabled } from "../story/hcti.js";

export const MARKS = { circle: "دایره قرمز", underline: "خط زیر قرمز", marker: "هایلایت زرد" };
export const BACKGROUNDS = {
  light: { name: "روشن", bg: "linear-gradient(160deg,#fbf7fd 0%,#f1eaf7 55%,#fdf8f1 100%)", text: "#3b2a6b", box: "rgba(255,255,255,0.86)", edge: "#cdb8ef" },
  dark: { name: "سرمه‌ای", bg: "linear-gradient(170deg,#1d2b45 0%,#22344f 60%,#1a2740 100%)", text: "#ffffff", box: "rgba(255,255,255,0.10)", edge: "rgba(255,255,255,0.25)" },
  brand: { name: "سبز سوگیموتو", bg: "linear-gradient(170deg,#32515d 0%,#2a4651 100%)", text: "#ffffff", box: "rgba(255,255,255,0.12)", edge: "rgba(255,255,255,0.28)" },
};

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clampBox(b, W, H) {
  const x = Math.max(0, Math.min(W, Math.round(Number(b.x) || 0)));
  const y = Math.max(0, Math.min(H, Math.round(Number(b.y) || 0)));
  const w = Math.max(0, Math.min(W - x, Math.round(Number(b.w) || 0)));
  const h = Math.max(0, Math.min(H - y, Math.round(Number(b.h) || 0)));
  return { x, y, w, h };
}

// The covered picture as JPEG. `boxes` are the ones the person kept on ({kind, x, y, w, h}).
export async function coverImage(dataUrl, boxes, mark = "marker") {
  const buf = bufferOf(dataUrl);
  const { width: W, height: H } = await sharp(buf).metadata();
  const stroke = Math.max(3, Math.round(Math.min(W, H) * 0.006));
  const shapes = [];
  for (const raw of boxes || []) {
    const b = clampBox(raw, W, H);
    if (!b.w || !b.h) continue;
    if (raw.kind === "keep") continue; // only a note for the layout: never drawn
    if (raw.kind === "hide") {
      shapes.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${Math.min(6, b.h / 4)}" fill="#111111"/>`);
    } else if (mark === "marker") {
      shapes.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.h / 5}" fill="#ffd60a" fill-opacity="0.55"/>`);
    } else if (mark === "underline") {
      const y = Math.min(H - stroke, b.y + b.h + stroke);
      shapes.push(`<line x1="${b.x}" y1="${y}" x2="${b.x + b.w}" y2="${y}" stroke="#e11d2e" stroke-width="${stroke}" stroke-linecap="round"/>`);
    } else {
      const rx = b.w / 2 + stroke * 3;
      const ry = b.h / 2 + stroke * 3;
      shapes.push(`<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${rx}" ry="${ry}" fill="none" stroke="#e11d2e" stroke-width="${stroke}"/>`);
    }
  }
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${shapes.join("")}</svg>`);
  return sharp(buf).composite([{ input: svg, left: 0, top: 0 }]).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
}

// A scanned or printed letter comes with wide white page margins; only the printed part is shown
// (Hamed, Oct 2026), with a thin white edge so the text does not touch the card's border. The
// shift is returned so the marked dates can be found again on the trimmed picture.
async function trimMargins(jpeg) {
  try {
    const { data, info } = await sharp(jpeg).trim({ background: "#ffffff", threshold: 30 }).toBuffer({ resolveWithObject: true });
    const edge = Math.max(12, Math.round(Math.min(info.width, info.height) * 0.025));
    const out = await sharp(data).extend({ top: edge, bottom: edge, left: edge, right: edge, background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
    return { jpeg: out, dx: (info.trimOffsetLeft || 0) + edge, dy: (info.trimOffsetTop || 0) + edge };
  } catch {
    return { jpeg, dx: 0, dy: 0 }; // a picture with nothing to trim (or all white) stays as it was
  }
}

// The logo over a picture, where it hides the least: never on a marked date (Hamed, Oct 2026: the
// logo sat on the dates), and among the free places the one with the least ink under it, near the
// middle. Returns { jpeg, score }, or null when no place clears the dates.
const LOGO_TILT = -10;
async function placeLogo(jpeg, marks) {
  const { width: W, height: H } = await sharp(jpeg).metadata();
  const small = 160;
  const k = small / W;
  const { data: px, info } = await sharp(jpeg).resize({ width: small }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const ink = (x, y, w, h) => {
    const x0 = Math.max(0, Math.floor(x * k)), y0 = Math.max(0, Math.floor(y * k));
    const x1 = Math.min(info.width, Math.ceil((x + w) * k)), y1 = Math.min(info.height, Math.ceil((y + h) * k));
    let dark = 0, all = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      all++;
      if (px[yy * info.width + xx] < 170) dark++;
    }
    return all ? dark / all : 1;
  };
  const logoBuf = await fs.readFile(path.join(process.cwd(), "public", "brand", "sugimoto-logo.png"));
  const lm = await sharp(logoBuf).metadata();
  const rad = (Math.abs(LOGO_TILT) * Math.PI) / 180;
  const pad = Math.round(Math.min(W, H) * 0.02);
  let best = null;
  for (const share of [0.62, 0.5, 0.4]) {
    const lw = Math.round(W * share);
    const lh = Math.round((lw * lm.height) / lm.width);
    // The tilted logo's footprint.
    const bw = Math.round(lw * Math.cos(rad) + lh * Math.sin(rad));
    const bh = Math.round(lw * Math.sin(rad) + lh * Math.cos(rad));
    if (bw > W || bh > H) continue;
    for (const fy of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82]) {
      for (const fx of [0.5, 0.38, 0.62]) {
        const x = Math.round(Math.min(W - bw, Math.max(0, fx * W - bw / 2)));
        const y = Math.round(Math.min(H - bh, Math.max(0, fy * H - bh / 2)));
        const hit = (marks || []).some((m) => x < m.x + m.w + pad && x + bw > m.x - pad && y < m.y + m.h + pad && y + bh > m.y - pad);
        if (hit) continue;
        const score = ink(x, y, bw, bh) + 0.08 * (Math.abs(fx - 0.5) + Math.abs(fy - 0.5)) + 0.05 * (0.62 - share);
        if (!best || score < best.score) best = { score, x, y, lw, lh, bw, bh };
      }
    }
    if (best && best.score < 0.12) break; // a clean spot at this size; no need to shrink
  }
  if (!best) return null;
  const logo64 = logoBuf.toString("base64");
  const cx = best.x + best.bw / 2, cy = best.y + best.bh / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}"><image href="data:image/png;base64,${logo64}" xlink:href="data:image/png;base64,${logo64}" x="${cx - best.lw / 2}" y="${cy - best.lh / 2}" width="${best.lw}" height="${best.lh}" opacity="0.9" transform="rotate(${LOGO_TILT} ${cx} ${cy})"/></svg>`;
  const out = await sharp(jpeg).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 90 }).toBuffer();
  return { jpeg: out, score: best.score };
}

async function keptBytes(url) {
  const own = String(url).match(/\/api\/carousel\/img\/([0-9a-f-]{36})$/i);
  if (own) {
    const b = memoryImage(own[1]);
    if (!b) throw new Error("a saved picture is gone (the server restarted before it reached WordPress)");
    return b;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`a saved picture could not be read (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

let logoUri = null;
async function logoDataUri() {
  if (logoUri) return logoUri;
  const file = path.join(process.cwd(), "public", "brand", "sugimoto-logo.png");
  logoUri = "data:image/png;base64," + (await fs.readFile(file)).toString("base64");
  return logoUri;
}

// ── layout ────────────────────────────────────────────────────────────────────
// The story is laid out here in pixels, not left to the browser, so the text can be put over a
// picture exactly where it hides nothing that matters (Hamed, Oct 2026: "the approval letter much
// bigger, the writing on top of it without hiding the important information").
//   layout.big   "letter" | "timeline" | "none"   which picture takes most of the height
//   layout.first "letter" | "timeline" | ""       which picture is on top
//   layout.text  "over" | "below"                 the lines over the big picture, or under the pictures
//   layout.size  "small" | "normal" | "large"     the text size
export const LAYOUT = { big: "letter", first: "letter", text: "over", size: "normal" };
const STORY_W = 1080, STORY_H = 1920, TOP = 100, BOTTOM = 110, SIDE = 40, GAP = 30;
const FONT = { small: 30, normal: 36, large: 44 };

// How much ink (text, lines) a part of a picture holds: 0 = blank paper, 1 = solid. Also where
// the picture's tables are (rows of long horizontal rules, like the Type / Validity / Document
// Number table of a letter): the story's text must never sit on those (Hamed, Oct 2026), and a
// saved case has no reading to tell, so they are found from the pixels.
async function inkOf(jpeg) {
  const { width: W, height: H } = await sharp(jpeg).metadata();
  const small = 400;
  const k = small / W;
  const { data: px, info } = await sharp(jpeg).resize({ width: small }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const ink = (x, y, w, h) => {
    const x0 = Math.max(0, Math.floor(x * k)), y0 = Math.max(0, Math.floor(y * k));
    const x1 = Math.min(info.width, Math.ceil((x + w) * k)), y1 = Math.min(info.height, Math.ceil((y + h) * k));
    let dark = 0, all = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      all++;
      if (px[yy * info.width + xx] < 170) dark++;
    }
    return all ? dark / all : 1;
  };
  // Rule lines: a row whose longest dark run spans more than a third of the width (a thin line
  // greyed by the downscale still reads under 215).
  const rules = [];
  for (let yy = 0; yy < info.height; yy++) {
    let run = 0, best = 0, bx = 0, start = 0;
    for (let xx = 0; xx < info.width; xx++) {
      if (px[yy * info.width + xx] < 215) {
        if (!run) start = xx;
        run++;
        if (run > best) {
          best = run;
          bx = start;
        }
      } else run = 0;
    }
    if (best >= info.width * 0.34) rules.push({ y: yy, x0: bx, x1: bx + best });
  }
  // Nearby rules make one table block; a lone rule is a thin band of its own.
  const tables = [];
  for (const r of rules) {
    const t = tables[tables.length - 1];
    if (t && r.y - t.y1 <= info.height * 0.09) {
      t.y1 = r.y;
      t.x0 = Math.min(t.x0, r.x0);
      t.x1 = Math.max(t.x1, r.x1);
      t.n++;
    } else tables.push({ y0: r.y, y1: r.y, x0: r.x0, x1: r.x1, n: 1 });
  }
  const pad = 4 / k;
  return {
    W,
    H,
    ink,
    tables: tables.map((t) => ({ kind: "table", x: Math.round(t.x0 / k - pad), y: Math.round(t.y0 / k - pad), w: Math.round((t.x1 - t.x0) / k + pad * 2), h: Math.round((t.y1 - t.y0) / k + pad * 2) })),
  };
}

function textLines(text) {
  // A line whose value was never filled in («…») is left out rather than printed.
  return String(text || "").split("\n").map((l) => l.trim()).filter((l) => l && !/[:：]\s*(…|\.\.\.)?\s*$/.test(l) && !/^(…|\.\.\.)$/.test(l));
}

// The text box's height for a width and font size, with room to spare (Persian at weight 800).
function textHeight(lines, width, font) {
  const pad = Math.round(font * 0.7);
  const perLine = Math.max(8, Math.floor((width - pad * 2) / (font * 0.5)));
  const rows = lines.reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  return Math.ceil(rows * font * 1.7 * 1.08 + pad * 2);
}

const overlaps = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w > b.x - pad && a.y < b.y + b.h + pad && a.y + a.h > b.y - pad;

function fit(W, H, maxW, maxH) {
  const k = Math.min(maxW / W, maxH / H);
  return { w: Math.round(W * k), h: Math.round(H * k), k };
}

// pics: [{ W, H, kind, marks, ink }]. Returns where each picture goes, where the text goes, and
// (when it is over a picture) the text's place in that picture's own pixels.
// A layout the team drew by hand on the page (app/VisaDesigner.jsx), in story pixels: where each
// picture of the story goes (by its place in the story's pictures) and where the text box is.
export function cleanManual(m) {
  if (!m || typeof m !== "object" || !Array.isArray(m.place)) return null;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const place = m.place.slice(0, 2).map((p) => ({ i: num(p.i, 0, 1), x: num(p.x, -STORY_W, STORY_W * 2), y: num(p.y, -STORY_H, STORY_H * 2), w: num(p.w, 80, STORY_W * 2), h: num(p.h, 80, STORY_H * 2) }));
  if (!place.length) return null;
  const t = m.text && typeof m.text === "object" ? { x: num(m.text.x, -STORY_W, STORY_W * 2), y: num(m.text.y, -STORY_H, STORY_H * 2), w: num(m.text.w, 160, STORY_W), font: num(m.text.font, 18, 80) } : null;
  return { place, text: t };
}

function planStory(pics, lines, layout) {
  const L = { ...LAYOUT, ...(layout || {}) };
  // Drawn by hand: taken as it is. A picture keeps its own proportions at the width it was given
  // (the page may have shown it before its margins were trimmed).
  const manual = cleanManual(L.manual);
  if (manual) {
    const place = manual.place.filter((p) => pics[p.i]).map((p) => ({ ...p, h: Math.round((p.w * pics[p.i].H) / pics[p.i].W), k: p.w / pics[p.i].W }));
    for (const [i, pic] of pics.entries()) if (!place.some((p) => p.i === i)) place.push({ i, x: SIDE, y: STORY_H - BOTTOM - 300, w: 300, h: Math.round((300 * pic.H) / pic.W), k: 300 / pic.W });
    let text = null;
    if (lines.length && manual.text) {
      const t = manual.text;
      const h = textHeight(lines, t.w, t.font);
      const on = place.find((p) => overlaps({ x: t.x, y: t.y, w: t.w, h }, p));
      text = { x: t.x, y: t.y, w: t.w, h, font: t.font, over: !!on, inPic: on ? { i: on.i, x: (t.x - on.x) / on.k, y: (t.y - on.y) / on.k, w: t.w / on.k, h: h / on.k } : null };
    }
    return { place, text };
  }
  const font = FONT[L.size] || FONT.normal;
  const maxW = STORY_W - SIDE * 2;
  // Which picture is "the letter": the one the reading called a letter, else the tallest page.
  const letterAt = (() => {
    const i = pics.findIndex((p) => p.kind === "letter");
    if (i >= 0) return i;
    let best = 0;
    pics.forEach((p, j) => p.H / p.W > pics[best].H / pics[best].W && (best = j));
    return best;
  })();
  const pick = (what) => (what === "letter" ? letterAt : what === "timeline" ? (pics.length > 1 ? 1 - letterAt : -1) : -1);
  const order = pics.map((_, i) => i);
  const first = pick(L.first);
  if (pics.length > 1 && first === 1) order.reverse();
  const big = pics.length > 1 ? pick(L.big) : 0;

  const lay = (areaH, withText) => {
    const top = TOP;
    const heights = pics.length === 1 ? [areaH] : order.map((i) => (big < 0 ? (areaH - GAP) / 2 : i === big ? (areaH - GAP) * 0.72 : (areaH - GAP) * 0.28));
    const sizes = order.map((i, j) => ({ i, ...fit(pics[i].W, pics[i].H, i === big || big < 0 ? maxW : maxW * 0.9, heights[j]) }));
    const used = sizes.reduce((a, s) => a + s.h, 0) + GAP * (sizes.length - 1);
    let y = top + Math.max(0, (areaH - used) / 2);
    const place = sizes.map((s) => {
      const p = { i: s.i, x: Math.round((STORY_W - s.w) / 2), y: Math.round(y), w: s.w, h: s.h, k: s.k };
      y += s.h + GAP;
      return p;
    });
    return { place, withText };
  };

  const area = STORY_H - TOP - BOTTOM;
  if (lines.length && L.text === "over") {
    const { place } = lay(area);
    const target = place.find((p) => p.i === (big >= 0 ? big : letterAt)) || place[0];
    const pic = pics[target.i];
    const avoid = [...(pic.marks || []).filter((m) => m.kind !== "hide"), ...(pic.tables || [])];
    // Try a full-width box, then narrower and smaller ones, from the emptiest spot of the picture.
    for (const [share, f] of [[0.92, font], [0.8, font], [0.92, font * 0.88], [0.7, font * 0.84], [0.8, font * 0.8], [0.62, font * 0.76]]) {
      const bw = Math.round(target.w * share);
      const bh = textHeight(lines, bw, f);
      if (bh > target.h * 0.62) continue;
      let best = null;
      for (let step = 0; step <= 24; step++) {
        const by = target.y + Math.round(((target.h - bh) * step) / 24);
        for (const fx of [0.5, 0.0, 1.0]) {
          const bx = target.x + Math.round((target.w - bw) * fx);
          const r = { x: (bx - target.x) / target.k, y: (by - target.y) / target.k, w: bw / target.k, h: bh / target.k };
          if (avoid.some((m) => overlaps(r, m, 6 / target.k))) continue;
          const score = pic.ink(r.x, r.y, r.w, r.h);
          if (!best || score < best.score) best = { score, x: bx, y: by, w: bw, h: bh, font: f, inPic: { i: target.i, ...r } };
        }
      }
      if (best) return { place, text: { ...best, over: true } };
    }
  }
  // Under the pictures: the pictures take what the text leaves.
  if (!lines.length) return { place: lay(area).place, text: null };
  const tw = maxW;
  const th = textHeight(lines, tw, font);
  const { place } = lay(Math.max(600, area - th - GAP));
  const bottomOfPics = Math.max(...place.map((p) => p.y + p.h));
  return { place, text: { x: SIDE, y: Math.min(bottomOfPics + GAP, STORY_H - BOTTOM - th), w: tw, h: th, font, over: false } };
}

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1920px;font-family:'Vazirmatn',sans-serif}
.s{position:relative;width:1080px;height:1920px;overflow:hidden;background:var(--bg)}
.pic{position:absolute;display:block;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,0.28);background:#fff}
.text{position:absolute;direction:rtl;text-align:right;border-radius:22px;color:var(--text);font-weight:800;line-height:1.7;white-space:pre-line;background:var(--box);border:2px solid var(--edge)}
.text.over{background:var(--over);color:var(--overText);border:none;box-shadow:0 12px 34px rgba(0,0,0,0.30)}
.text b{font-weight:900}
`;

const OVER = { light: ["rgba(255,255,255,0.95)", "#2d1f5e"], dark: ["rgba(23,35,58,0.94)", "#ffffff"], brand: ["rgba(36,59,68,0.94)", "#ffffff"] };

function storyHtml(urls, lines, plan, opts, logo) {
  const c = BACKGROUNDS[opts.background] || BACKGROUNDS.light;
  const [over, overText] = OVER[opts.background] || OVER.light;
  const t = plan.text;
  const body = lines.map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : esc(l))).join("\n");
  const pad = t ? Math.round(t.font * 0.7) : 0;
  return `<div class="s" style="--bg:${c.bg};--text:${c.text};--box:${c.box};--edge:${c.edge};--over:${over};--overText:${overText}">
  ${plan.place.map((p) => `<img class="pic" src="${esc(urls[p.i])}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px">`).join("")}
  ${t ? `<div class="text${t.over ? " over" : ""}" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;font-size:${Math.round(t.font)}px;padding:${pad}px ${Math.round(pad * 1.2)}px">${body}</div>` : ""}
</div>`;
}

// stories: [{ images: [index…], text }]; images: [{ data, boxes, kind } | { url, marks, kind }].
// Returns the stories, and each picture's covered copy and its marks (dates and lines to keep
// readable), to redraw it later.
export async function drawVisaStories({ images, stories, mark = "marker", background = "light", watermark = true, layout = {} }, onOne = () => {}) {
  if (!hctiEnabled()) throw new Error("HCTI_USER_ID / HCTI_API_KEY are not set, so stories cannot be drawn");
  const logo = await logoDataUri();
  const done = new Map(); // index -> { url, jpeg, marks, W, H, ink, kind }
  const covered = async (i) => {
    if (!done.has(i)) {
      const im = images[i];
      if (!im) throw new Error(`picture ${i + 1} is missing`);
      let rec;
      // A saved case is redrawn from its already covered pictures; nothing is uncovered or re-covered.
      if (im.url) rec = { url: im.url, jpeg: await keptBytes(im.url), marks: Array.isArray(im.marks) ? im.marks : [] };
      else {
        const on = (im.boxes || []).filter((b) => b.on !== false);
        const t = await trimMargins(await coverImage(im.data, on, mark));
        const marks = on.filter((b) => b.kind === "date" || b.kind === "keep").map((b) => ({ kind: b.kind, x: Math.round(b.x + t.dx), y: Math.round(b.y + t.dy), w: Math.round(b.w), h: Math.round(b.h) }));
        rec = { url: (await keepImage(t.jpeg, `visa-result-${Date.now().toString(36)}-${i + 1}`)).url, jpeg: t.jpeg, marks };
      }
      const ink = await inkOf(rec.jpeg);
      // The lines to keep readable, from the picture itself when the reading gave none (a saved case).
      if (!rec.marks.some((m) => m.kind === "keep")) rec.marks = [...rec.marks, ...(await keepLinesOf(rec.jpeg).catch(() => []))];
      done.set(i, { ...rec, W: ink.W, H: ink.H, ink: ink.ink, tables: ink.tables, kind: im.kind || "" });
    }
    return done.get(i);
  };
  const out = [];
  for (const st of stories) {
    try {
      const idx = (st.images || []).slice(0, 2).map(Number);
      const pics = [];
      for (const i of idx) pics.push(await covered(i));
      if (!pics.length) throw new Error("this story has no picture");
      const lines = textLines(st.text);
      const plan = planStory(pics, lines, { ...layout, manual: st.manual || null });
      const urls = pics.map((p) => p.url);
      // One logo per story, on the picture where it covers least: never on a date, a line to keep,
      // or the text laid over it.
      if (watermark) {
        const tries = await Promise.all(
          pics.map((p, j) => {
            const avoid = [...(p.marks || []), ...(p.tables || [])];
            if (plan.text && plan.text.over && plan.text.inPic.i === j) avoid.push(plan.text.inPic);
            return placeLogo(p.jpeg, avoid).catch(() => null);
          })
        );
        let k = -1;
        tries.forEach((t, j) => t && (k < 0 || t.score < tries[k].score) && (k = j));
        if (k >= 0) urls[k] = (await keepImage(tries[k].jpeg, `visa-story-${Date.now().toString(36)}-${k + 1}`)).url;
      }
      const url = await hctiImage({
        html: storyHtml(urls, lines, plan, { background }, logo),
        css: CSS,
        google_fonts: "Vazirmatn|Inter",
        viewport_width: STORY_W,
        viewport_height: STORY_H,
        device_scale: 1,
        ms_delay: 800,
      });
      // The layout used, so the page's hand-drawn design can start from it.
      out.push({ url, text: st.text || "", images: st.images, plan: { place: plan.place.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })), text: plan.text ? { x: plan.text.x, y: plan.text.y, w: plan.text.w, font: Math.round(plan.text.font) } : null } });
    } catch (e) {
      out.push({ error: String(e?.message || e).slice(0, 200), text: st.text || "", images: st.images });
    }
    onOne(out.length);
  }
  return { stories: out, covered: images.map((_, i) => (done.get(i) || {}).url || ""), marks: images.map((_, i) => (done.get(i) || {}).marks || []) };
}

// A covered picture the page may hand back for a redraw: only this app's own kept images.
export function keptImageUrl(u) {
  try {
    const url = new URL(String(u || ""));
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const wp = new URL(process.env.WP_BASE_URL || "https://sugimotovisa.com");
    const bare = (h) => h.replace(/^www\./, "");
    if (bare(url.hostname) === bare(wp.hostname) && url.pathname.startsWith("/wp-content/uploads/")) return true;
    return /^\/api\/carousel\/img\/[0-9a-f-]{36}$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export const _test = { storyHtml, CSS, logoDataUri, trimMargins, placeLogo, planStory, inkOf, textLines };
