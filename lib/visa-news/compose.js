// Draws the visa-result stories after a person has checked the boxes: each picture is covered
// where it must be (solid boxes burned into the pixels, so nothing can be uncovered later) and
// its dates are marked, then one or two pictures and the client's lines make one 9:16 story.
// Only covered pictures ever leave this server: they are kept (WordPress media, else memory) so
// the story renderer can load them, and the original uploads are never stored.

import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { bufferOf } from "./scan.js";
import { keepImage } from "../carousel.js";
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
// (Hamed, Oct 2026), with a thin white edge so the text does not touch the card's border.
async function trimMargins(jpeg) {
  try {
    const { data, info } = await sharp(jpeg).trim({ background: "#ffffff", threshold: 30 }).toBuffer({ resolveWithObject: true });
    const edge = Math.max(12, Math.round(Math.min(info.width, info.height) * 0.025));
    return await sharp(data).extend({ top: edge, bottom: edge, left: edge, right: edge, background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
  } catch {
    return jpeg; // a picture with nothing to trim (or all white) stays as it was
  }
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
.mark{position:absolute;left:50%;top:50%;width:760px;transform:translate(-50%,-50%) rotate(-12deg);opacity:0.88;pointer-events:none}
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
    ${opts.watermark !== false ? `<img class="mark" src="${logo}">` : ""}
  </div>
  ${body ? `<div class="text">${body}</div>` : ""}
  <img class="logo" src="${logo}">
</div>`;
}

// stories: [{ images: [index…], text }]; images: [{ data, boxes }]. Returns [{ url, covered: [url…] }].
export async function drawVisaStories({ images, stories, mark = "marker", background = "light", watermark = true }, onOne = () => {}) {
  if (!hctiEnabled()) throw new Error("HCTI_USER_ID / HCTI_API_KEY are not set, so stories cannot be drawn");
  const logo = await logoDataUri();
  const coveredUrl = new Map();
  const covered = async (i) => {
    if (!coveredUrl.has(i)) {
      const im = images[i];
      if (!im) throw new Error(`picture ${i + 1} is missing`);
      // A saved case is redrawn from its already covered pictures; nothing is uncovered or re-covered.
      if (im.url) coveredUrl.set(i, im.url);
      else {
        const jpeg = await trimMargins(await coverImage(im.data, (im.boxes || []).filter((b) => b.on !== false), mark));
        coveredUrl.set(i, (await keepImage(jpeg, `visa-result-${Date.now().toString(36)}-${i + 1}`)).url);
      }
    }
    return coveredUrl.get(i);
  };
  const out = [];
  for (const st of stories) {
    try {
      const urls = [];
      for (const i of (st.images || []).slice(0, 2)) urls.push(await covered(Number(i)));
      if (!urls.length) throw new Error("this story has no picture");
      const url = await hctiImage({
        html: storyHtml(urls, st.text, { background, watermark }, logo),
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
  // Every covered picture by its place in the upload, so a saved case can be redrawn later.
  return { stories: out, covered: images.map((_, i) => coveredUrl.get(i) || "") };
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

export const _test = { storyHtml, CSS, logoDataUri, trimMargins };
