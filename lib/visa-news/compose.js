// Draws the visa-result stories after a person has checked the boxes: each picture is covered
// where it must be (solid boxes burned into the pixels, so nothing can be uncovered later) and
// its dates are marked, then one or two pictures and the client's lines make one 9:16 story.
// Only covered pictures ever leave this server: they are kept (WordPress media, else memory) so
// the story renderer can load them, and the original uploads are never stored.

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { bufferOf } from "./scan.js";
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

const CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1920px;font-family:'Vazirmatn',sans-serif}
.s{position:relative;width:1080px;height:1920px;overflow:hidden;background:var(--bg);display:flex;flex-direction:column;align-items:center;padding:120px 70px 230px}
.pics{position:relative;flex:1;width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;min-height:0}
.pic{display:block;max-width:100%;min-height:0;object-fit:contain;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,0.28);background:#fff}
.two .pic{max-height:calc((100% - 34px) / 2)}
.two .pic:first-child{width:88%;transform:rotate(-2.5deg)}
.one .pic{max-height:100%}
.text{direction:rtl;text-align:right;width:100%;margin-top:34px;padding:26px 34px;border-radius:26px;background:var(--box);border:2px solid var(--edge);color:var(--text);font-weight:800;font-size:40px;line-height:1.75;white-space:pre-line}
.text b{font-weight:900}
.logo{position:absolute;bottom:150px;left:50%;transform:translateX(-50%);height:58px;background:#fff;border-radius:40px;padding:10px 26px}
`;

function storyHtml(urls, text, opts, logo) {
  const c = BACKGROUNDS[opts.background] || BACKGROUNDS.light;
  // A line whose value was never filled in («…») is left out rather than printed.
  const lines = String(text || "").split("\n").map((l) => l.trim()).filter((l) => l && !/[:：]\s*(…|\.\.\.)?\s*$/.test(l) && !/^(…|\.\.\.)$/.test(l));
  const body = lines.map((l, i) => (i === 0 ? `<b>${esc(l)}</b>` : esc(l))).join("\n");
  return `<div class="s" style="--bg:${c.bg};--text:${c.text};--box:${c.box};--edge:${c.edge}">
  <div class="pics ${urls.length > 1 ? "two" : "one"}">
    ${urls.map((u) => `<img class="pic" src="${esc(u)}">`).join("")}
  </div>
  ${body ? `<div class="text">${body}</div>` : ""}
  <img class="logo" src="${logo}">
</div>`;
}

// stories: [{ images: [index…], text }]; images: [{ data, boxes } | { url, marks }].
// Returns the stories, and each picture's covered copy and marked dates (to redraw it later).
export async function drawVisaStories({ images, stories, mark = "marker", background = "light", watermark = true }, onOne = () => {}) {
  if (!hctiEnabled()) throw new Error("HCTI_USER_ID / HCTI_API_KEY are not set, so stories cannot be drawn");
  const logo = await logoDataUri();
  const done = new Map(); // index -> { url, jpeg, marks }
  const covered = async (i) => {
    if (!done.has(i)) {
      const im = images[i];
      if (!im) throw new Error(`picture ${i + 1} is missing`);
      // A saved case is redrawn from its already covered pictures; nothing is uncovered or re-covered.
      if (im.url) done.set(i, { url: im.url, jpeg: await keptBytes(im.url), marks: Array.isArray(im.marks) ? im.marks : [] });
      else {
        const on = (im.boxes || []).filter((b) => b.on !== false);
        const t = await trimMargins(await coverImage(im.data, on, mark));
        const marks = on.filter((b) => b.kind === "date").map((b) => ({ x: Math.round(b.x + t.dx), y: Math.round(b.y + t.dy), w: Math.round(b.w), h: Math.round(b.h) }));
        done.set(i, { url: (await keepImage(t.jpeg, `visa-result-${Date.now().toString(36)}-${i + 1}`)).url, jpeg: t.jpeg, marks });
      }
    }
    return done.get(i);
  };
  const out = [];
  for (const st of stories) {
    try {
      const pics = [];
      for (const i of (st.images || []).slice(0, 2)) pics.push(await covered(Number(i)));
      if (!pics.length) throw new Error("this story has no picture");
      const urls = pics.map((p) => p.url);
      // One logo per story, on the picture where it covers least.
      if (watermark) {
        const tries = await Promise.all(pics.map((p) => placeLogo(p.jpeg, p.marks).catch(() => null)));
        let k = -1;
        tries.forEach((t, j) => t && (k < 0 || t.score < tries[k].score) && (k = j));
        if (k >= 0) urls[k] = (await keepImage(tries[k].jpeg, `visa-story-${Date.now().toString(36)}-${k + 1}`)).url;
      }
      const url = await hctiImage({
        html: storyHtml(urls, st.text, { background }, logo),
        css: CSS,
        google_fonts: "Vazirmatn|Inter",
        viewport_width: 1080,
        viewport_height: 1920,
        device_scale: 1,
        ms_delay: 800,
      });
      out.push({ url, text: st.text || "", images: st.images });
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

export const _test = { storyHtml, CSS, logoDataUri, trimMargins, placeLogo };
