// Drawing a page in a real browser: story pages, the photographs of source
// pages, visa-result stories and the draws story card. Persian shaping and web
// fonts come out right only in a browser.
//
// The server's own Chromium does it (installed in the Docker image, path in
// CHROMIUM_PATH): free and without a monthly limit. htmlcsstoimage.com (HCTI)
// was used before and stays as the fallback when there is no Chromium and its
// keys are set; its free plan stops at 50 images a month, which the team hit
// on Oct 23 2026. STORY_RENDERER=hcti forces HCTI.
//
// The request keeps HCTI's shape ({ html, css, google_fonts, selector,
// viewport_width, viewport_height, device_scale, ms_delay } or { url }), and
// the result is a public picture URL either way: a locally drawn PNG is kept
// like every other picture (WordPress media, else the app's memory).

import fs from "node:fs";
import { keepImage } from "../carousel.js";
import { heavy, onRelease } from "../heavy.js";

// The headless build of the same browser (installed by the Dockerfile under HEADLESS_SHELL_DIR) is
// used when it is there: measured on a story of an X post it holds about 120 MB where the full
// Chromium held about 215 MB, and this server has 512 MB for everything. Chromium stays installed for
// its system libraries and as the fallback.
let shellPath;
function headlessShell() {
  if (shellPath !== undefined) return shellPath;
  shellPath = "";
  try {
    const root = process.env.HEADLESS_SHELL_DIR || "/opt/pw";
    for (const d of fs.readdirSync(root)) {
      if (!/^chromium_headless_shell-\d+$/.test(d)) continue;
      for (const sub of fs.readdirSync(`${root}/${d}`)) {
        const f = `${root}/${d}/${sub}/chrome-headless-shell`;
        if (fs.existsSync(f)) shellPath = f;
      }
    }
  } catch (_) {}
  return shellPath;
}

function chromiumPath() {
  if (process.env.STORY_BROWSER !== "chromium" && headlessShell()) return headlessShell();
  const p = process.env.CHROMIUM_PATH || "/usr/bin/chromium";
  try {
    return fs.existsSync(p) ? p : "";
  } catch (_) {
    return "";
  }
}

export function browserInUse() {
  return chromiumPath();
}

function hctiKeys() {
  return !!process.env.HCTI_USER_ID && !!process.env.HCTI_API_KEY;
}

function useLocal() {
  return process.env.STORY_RENDERER !== "hcti" && !!chromiumPath();
}

export function hctiEnabled() {
  return useLocal() || hctiKeys();
}

export async function hctiImage(body, opts = {}) {
  if (useLocal()) return keepRendered(await renderLocal(body), body);
  if (!hctiKeys()) throw new Error("no browser to draw with: Chromium is not installed on the server and HCTI_USER_ID / HCTI_API_KEY are not set");
  return renderHcti(body, opts);
}

async function keepRendered(png, body) {
  const kept = await keepImage(png, `sugimoto-render-${body.selector ? "shot" : "page"}-${Date.now().toString(36)}`);
  return kept.url;
}

// ── HCTI ─────────────────────────────────────────────────────────────────────
async function renderHcti(body, { timeoutMs = 90000 } = {}) {
  const auth = Buffer.from(`${process.env.HCTI_USER_ID}:${process.env.HCTI_API_KEY}`).toString("base64");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://hcti.io/v1/image", {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.url) throw new Error(`HCTI ${res.status}: ${String(data.message || data.error || JSON.stringify(data)).slice(0, 200)}`);
    return data.url;
  } finally {
    clearTimeout(timer);
  }
}

// ── the server's own Chromium ────────────────────────────────────────────────
// One browser, kept while pages are being drawn and closed after a quiet
// minute (the server has little memory); one page at a time.
// The browser is the biggest thing this server runs: it is closed a few seconds after its last page
// (it was a minute), at once when another heavy job needs the memory (lib/heavy.js), and started with
// one renderer for every frame (an X embed's frames each got a process of their own) and a capped
// script heap.
const IDLE_MS = 8 * 1000;
let browserP = null;
let idleTimer = null;

async function browser() {
  if (!browserP) {
    const { chromium } = await import("playwright-core");
    browserP = chromium
      .launch({
        executablePath: chromiumPath(),
        args: [
          "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--font-render-hinting=none", "--hide-scrollbars",
          "--no-zygote", "--in-process-gpu", "--renderer-process-limit=1", "--disable-extensions", "--disable-background-networking", "--mute-audio",
          "--disable-features=site-per-process,IsolateOrigins,Translate,BackForwardCache,MediaRouter,OptimizationHints",
          "--js-flags=--max-old-space-size=160",
        ],
      })
      .catch((e) => {
        browserP = null;
        // the headless build could not start (a missing system library after an image change):
        // the full Chromium from then on, rather than no stories at all
        if (shellPath) {
          console.log("[browser] headless shell did not start, using Chromium:", String(e?.message || e).split("\n")[0].slice(0, 160));
          shellPath = "";
          return browser();
        }
        throw e;
      });
  }
  return browserP;
}

async function closeBrowser() {
  clearTimeout(idleTimer);
  const p = browserP;
  browserP = null;
  if (p) await (await p.catch(() => null))?.close().catch(() => {});
}
onRelease("browser", closeBrowser);

function closeLater() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(closeBrowser, IDLE_MS);
}

// Google Fonts, one link per family: a weight a family does not have makes
// Google refuse the whole request, so each family asks only for its own.
const FONT_AXES = { Vazirmatn: "wght@100..900", Inter: "wght@100..900", "Markazi Text": "wght@400..700", Lalezar: "" };
function fontLinks(list) {
  return String(list || "")
    .split("|")
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => {
      const axes = f in FONT_AXES ? FONT_AXES[f] : "wght@400;700";
      return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, "+")}${axes ? ":" + axes : ""}&display=block">`;
    })
    .join("");
}

function renderLocal(body) {
  return heavy("browser", () => drawOnce(body));
}

async function drawOnce(body) {
  clearTimeout(idleTimer);
  const b = await browser();
  const width = Number(body.viewport_width) || 1080;
  const height = Number(body.viewport_height) || 1920;
  const ctx = await b.newContext({ viewport: { width, height }, deviceScaleFactor: Number(body.device_scale) || 1 });
  try {
    const page = await ctx.newPage();
    if (body.url) {
      await page.goto(body.url, { waitUntil: "load", timeout: 45000 });
    } else {
      const html = String(body.html || "");
      const head = `${fontLinks(body.google_fonts)}<style>${body.css || ""}</style>`;
      // A whole document (a source page with its own <head>) keeps its own;
      // the fonts and css go in after it.
      const doc = /<html[\s>]/i.test(html)
        ? html.replace(/<\/head>/i, head + "</head>")
        : `<!doctype html><html><head><meta charset="utf-8">${head}</head><body style="margin:0">${html}</body></html>`;
      await page.setContent(doc, { waitUntil: "load", timeout: 45000 }).catch(() => {});
    }
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    await page.waitForTimeout(Math.min(Number(body.ms_delay) || 300, 3000));
    if (body.selector) return await page.locator(body.selector).first().screenshot({ type: "png", timeout: 20000 });
    return await page.screenshot({ type: "png", clip: { x: 0, y: 0, width, height } });
  } finally {
    await ctx.close().catch(() => {});
    closeLater();
  }
}

// A photograph of a source page in pieces (lib/story/webshot.js): the page is loaded once, `measure`
// runs in it and says where things are, `plan(info)` turns that into page areas, and each area is
// photographed. The server's own Chromium only (HCTI cannot run a measure); null without it, and the
// caller falls back to a single-element shot.
// With `url` instead of `html` the page is opened as it is, scripts and all (a network's official
// embed draws a post only that way), and `ready` names the element to wait for.
export async function photographAreas({ html, url = "", ready = "", css = "", width = 480, scale = 2.5, measure, arg = null, plan }) {
  if (!useLocal()) return null;
  return heavy("browser", async () => {
    clearTimeout(idleTimer);
    const b = await browser();
    const ctx = await b.newContext({ viewport: { width, height: 1400 }, deviceScaleFactor: scale });
    try {
      const page = await ctx.newPage();
      if (url) {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        if (ready) await page.waitForSelector(ready, { timeout: 25000 });
        if (css) await page.addStyleTag({ content: css }).catch(() => {});
        await page.waitForTimeout(1800);
      } else {
        const doc = /<html[\s>]/i.test(html) ? html.replace(/<\/head>/i, `<style>${css}</style></head>`) : `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`;
        await page.setContent(doc, { waitUntil: "load", timeout: 45000 }).catch(() => {});
      }
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await page.waitForTimeout(700);
      const info = await page.evaluate(measure, arg);
      const areas = info ? plan(info) : null;
      if (!areas || !areas.length) return null;
      const shots = [];
      for (const a of areas) shots.push(await page.screenshot({ type: "png", fullPage: true, clip: a, timeout: 20000 }));
      return { shots, info };
    } finally {
      await ctx.close().catch(() => {});
      closeLater();
    }
  });
}
