// Instagram story card (1080x1920 SVG) shared by every program, plus the
// SVG -> PNG render step (Instagram requires a publicly reachable image URL).
//
// The logo is read from assets/story-logo.b64 (a base64 PNG, no data: prefix)
// or the STORY_LOGO_B64 env var. Without it the card falls back to a text
// wordmark so it still renders.
import fs from "node:fs";
import path from "node:path";
import { esc } from "./util";

let logoCache = null;

export function logoBase64() {
  if (logoCache !== null) return logoCache;
  const fromEnv = (process.env.STORY_LOGO_B64 || "").trim();
  if (fromEnv && !fromEnv.startsWith("PASTE")) {
    logoCache = fromEnv;
    return logoCache;
  }
  try {
    const raw = fs
      .readFileSync(path.join(process.cwd(), "assets", "story-logo.b64"), "utf8")
      .replace(/\s+/g, "");
    logoCache = raw.startsWith("PASTE") ? "" : raw;
  } catch (_) {
    logoCache = "";
  }
  return logoCache;
}

// Auto-shrink long numbers so they always fit the stat slot.
function fitSize(value) {
  const len = String(value ?? "").length;
  if (len <= 3) return 220;
  if (len === 4) return 180;
  if (len === 5) return 150;
  return 130;
}

export function buildStorySvg(card) {
  const logo = logoBase64();
  const rightFont = fitSize(card.statRight?.value);
  const leftFont = fitSize(card.statLeft?.value);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700;800;900&amp;family=Inter:wght@700;800;900&amp;display=swap');
      .farsi { font-family: 'Vazirmatn', 'Tahoma', sans-serif; direction: rtl; }
      .english { font-family: 'Inter', 'Arial', sans-serif; }
    </style>
    <filter id="cardShadow" x="-10%" y="-5%" width="120%" height="115%">
      <feDropShadow dx="0" dy="20" stdDeviation="40" flood-color="#000000" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="1080" height="1920" fill="#FFFFFF"/>
  <rect x="40" y="40" width="1000" height="1840" rx="50" ry="50" fill="#FFFFFF" filter="url(#cardShadow)" stroke="#F3F4F6" stroke-width="1"/>
  <g opacity="0.45">
    <rect x="120" y="1150" width="110" height="100" fill="#FCA5A5"/>
    <rect x="260" y="1080" width="110" height="170" fill="#FED7AA"/>
    <rect x="400" y="980"  width="110" height="270" fill="#FEF3C7"/>
    <rect x="540" y="880"  width="110" height="370" fill="#BAE6FD"/>
    <rect x="680" y="780"  width="110" height="470" fill="#C7D2FE"/>
    <rect x="820" y="680"  width="110" height="570" fill="#E9D5FF"/>
  </g>
  <g opacity="0.55">
    <circle cx="175" cy="1090" r="32" fill="#F87171"/>
    <path d="M 130 1150 Q 130 1100 175 1100 Q 220 1100 220 1150 Z" fill="#F87171"/>
    <circle cx="315" cy="1020" r="32" fill="#FB923C"/>
    <path d="M 270 1080 Q 270 1030 315 1030 Q 360 1030 360 1080 Z" fill="#FB923C"/>
    <circle cx="455" cy="920" r="32" fill="#FBBF24"/>
    <path d="M 410 980 Q 410 930 455 930 Q 500 930 500 980 Z" fill="#FBBF24"/>
    <circle cx="595" cy="820" r="32" fill="#38BDF8"/>
    <path d="M 550 880 Q 550 830 595 830 Q 640 830 640 880 Z" fill="#38BDF8"/>
    <circle cx="735" cy="720" r="32" fill="#818CF8"/>
    <path d="M 690 780 Q 690 730 735 730 Q 780 730 780 780 Z" fill="#818CF8"/>
    <circle cx="875" cy="620" r="32" fill="#C084FC"/>
    <path d="M 830 680 Q 830 630 875 630 Q 920 630 920 680 L 905 680 Q 900 695 875 695 Q 850 695 845 680 Z" fill="#C084FC"/>
  </g>
  <text x="540" y="300" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">${esc(card.headingLine1)}</text>
  <text x="540" y="395" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">${esc(card.headingLine2)}</text>
  <text x="540" y="490" text-anchor="middle" class="farsi" font-size="80" font-weight="900" fill="#2C3E50">${esc(card.headingLine3)}</text>
  <line x1="220" y1="555" x2="860" y2="555" stroke="#E5E7EB" stroke-width="3"/>
  <text x="780" y="800" text-anchor="middle" class="english" font-size="${rightFont}" font-weight="900" fill="#2C3E50" letter-spacing="-8">${esc(card.statRight?.value)}</text>
  <text x="780" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">${esc(card.statRight?.label)}</text>
  <line x1="540" y1="660" x2="540" y2="890" stroke="#E5E7EB" stroke-width="3"/>
  <text x="300" y="800" text-anchor="middle" class="english" font-size="${leftFont}" font-weight="900" fill="#2C3E50" letter-spacing="-8">${esc(card.statLeft?.value)}</text>
  <text x="300" y="880" text-anchor="middle" class="farsi" font-size="38" font-weight="700" fill="#545454">${esc(card.statLeft?.label)}</text>
  <text x="540" y="1380" text-anchor="middle" class="farsi" font-size="46" font-weight="700" fill="#2C3E50">${esc(card.categoryFa)}</text>
  <text x="540" y="1450" text-anchor="middle" class="english" font-size="46" font-weight="700" fill="#2C3E50">${esc(card.categoryEn)}</text>
  <text x="540" y="1560" text-anchor="middle" class="english" font-size="42" font-weight="700" fill="#2C3E50">${esc(card.dateText)}</text>
  ${
    logo
      ? `<image x="290" y="1730" width="500" height="85" xlink:href="data:image/png;base64,${logo}" preserveAspectRatio="xMidYMid meet"/>`
      : `<text x="540" y="1790" text-anchor="middle" class="english" font-size="46" font-weight="900" fill="#2C3E50">SUGIMOTO VISA</text>`
  }
</svg>`;
}

export function renderEnabled() {
  return !!process.env.HCTI_USER_ID && !!process.env.HCTI_API_KEY;
}

// Render the SVG to a hosted PNG via htmlcsstoimage.com and return its URL.
export async function renderStoryPng(svg) {
  const user = process.env.HCTI_USER_ID;
  const key = process.env.HCTI_API_KEY;
  if (!user || !key) throw new Error("HCTI_USER_ID / HCTI_API_KEY not set");

  const auth = Buffer.from(`${user}:${key}`).toString("base64");
  const res = await fetch("https://hcti.io/v1/image", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      html: `<div id="wrap">${svg}</div>`,
      css: "body,html{margin:0;padding:0}#wrap{width:1080px;height:1920px}svg{width:100%;height:100%;display:block}",
      viewport_width: 1080,
      viewport_height: 1920,
      device_scale: 1,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(`HCTI render failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data.url;
}
