import { spawn, spawnSync } from 'child_process';
import sharp from 'sharp';

/**
 * Page orientation from the text itself, with Tesseract OCR.
 *
 * Asking a vision model "how many degrees to turn this page?" proved
 * unreliable: it sees that a page is sideways but confuses 90° with 270°, so
 * corrected pages came out upside down. Reading the text is decisive — text
 * the right way up is recognised with high confidence, text on its side or
 * upside down is gibberish:
 *
 *   1. Tesseract's orientation detector (OSD). Its answers with confidence
 *      ≥ OSD_TRUST were always right in testing; wrong answers came with
 *      confidence < 1 — so only confident answers are accepted.
 *   2. Otherwise the page is read in all four rotations (Persian + English,
 *      treating the page as one block so sideways lines can't be read) and the
 *      rotation with clearly the most confidently read words wins.
 *   3. A page with too little text to judge (a photo, an emblem) is reported
 *      as undecided; the caller falls back to the vision model's
 *      "which of these four is upright" check.
 *
 * Rotations are clockwise degrees to apply to make the page upright.
 */

const OSD_TRUST = Number(process.env.ORIENT_OSD_TRUST || 5);
const MIN_CONF = Number(process.env.ORIENT_MIN_CONF || 70); // a word counts when read this confidently
const MIN_LEN = 3; // … and has at least this many letters/digits (junk is short)
const MIN_WORDS = 5; // below this the page has too little text to judge
const MIN_MARGIN = 1.6; // best score must beat the runner-up by this factor
const TIMEOUT_MS = 20000; // per Tesseract run
const PAGE_BUDGET_MS = 45000; // per page, before the full-resolution pass
const WIDTH = 1600; // OCR resolution (long side, px); small scans are enlarged to it

let available = null;
let langs = 'eng';

/** Is Tesseract installed (with Persian)? Cached. */
export function tesseractAvailable() {
  if (available !== null) return available;
  try {
    const r = spawnSync('tesseract', ['--list-langs'], { encoding: 'utf8' });
    const list = `${r.stdout}\n${r.stderr}`;
    available = r.status === 0;
    langs = /\bfas\b/.test(list) ? 'fas+eng' : 'eng';
  } catch {
    available = false;
  }
  return available;
}

// At most two Tesseract processes at a time (small servers have little CPU).
let running = 0;
const waiting = [];
async function slot(fn) {
  if (running >= 2) await new Promise((r) => waiting.push(r));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

function tesseract(input, args) {
  return slot(
    () =>
      new Promise((resolve) => {
        const p = spawn('tesseract', ['stdin', 'stdout', ...args], { env: { ...process.env, OMP_THREAD_LIMIT: '1' } });
        // A pathological page (dense noise) must not stall a whole package.
        const timer = setTimeout(() => p.kill('SIGKILL'), TIMEOUT_MS);
        p.on('close', () => clearTimeout(timer));
        let out = '';
        p.stdout.on('data', (d) => (out += d));
        p.stderr.on('data', () => {});
        p.on('error', () => resolve(''));
        p.on('close', () => resolve(out));
        p.stdin.on('error', () => {});
        p.stdin.end(input);
      })
  );
}

/** Tesseract OSD: { rotate, confidence } or null. */
async function osd(png) {
  const out = await tesseract(png, ['--psm', '0', '-c', 'textord_heavy_nr=1']);
  const rotate = Number(out.match(/Rotate:\s*(\d+)/)?.[1]);
  const confidence = Number(out.match(/Orientation confidence:\s*([\d.]+)/)?.[1]);
  if (!Number.isFinite(rotate) || !Number.isFinite(confidence)) return null;
  return { rotate: rotate % 360, confidence };
}

/** How well the page reads as it is: total confidence of real words, and their count. */
async function readability(png) {
  // textord_heavy_nr: Tesseract's own heavy-noise removal — on a speckled scan
  // it cut one read from ~7 minutes to ~14 s and recognised more words.
  const tsv = await tesseract(png, ['-l', langs, '--psm', '6', '-c', 'textord_heavy_nr=1', 'tsv']);
  let score = 0;
  let words = 0;
  for (const line of tsv.split('\n').slice(1)) {
    const c = line.split('\t');
    const conf = Number(c[10]);
    const text = (c[11] || '').replace(/[^\p{L}\p{N}]/gu, '');
    if (conf > MIN_CONF && text.length >= MIN_LEN) {
      score += conf;
      words++;
    }
  }
  return { score, words };
}

/**
 * Decide a page's orientation from its text.
 * @param {Buffer} image  page picture (any format sharp reads)
 * @returns {Promise<{ rotate: number, decided: boolean, method: string, detail: string }>}
 */
export async function orientationByText(image) {
  if (!tesseractAvailable()) return { rotate: 0, decided: false, method: 'none', detail: 'tesseract not installed' };
  // Grayscale, specks removed (a median filter) and contrast stretched: scanner
  // speckle otherwise makes Tesseract slow and noisy.
  const at = (px) => sharp(image).resize({ width: px, height: px, fit: 'inside' }).grayscale().median(3).normalise().png().toBuffer();

  // Quick look first; full resolution only when the quick look isn't decisive
  // (small print on a heavily compressed scan).
  let last = null;
  const started = Date.now();
  for (const px of [1000, WIDTH]) {
    if (Date.now() - started > PAGE_BUDGET_MS) break; // leave it to the fallback
    const base = await at(px);
    const o = await osd(base);
    if (o && o.confidence >= OSD_TRUST) {
      return { rotate: o.rotate, decided: true, method: 'osd', detail: `OSD ${o.rotate}° (confidence ${o.confidence}) at ${px}px` };
    }
    const scores = [];
    for (const rot of [0, 90, 180, 270]) {
      const png = rot ? await sharp(base).rotate(rot).png().toBuffer() : base;
      scores.push({ rot, ...(await readability(png)) });
    }
    scores.sort((a, b) => b.score - a.score);
    const [best, next] = scores;
    const detail = `${scores.map((s) => `${s.rot}°:${Math.round(s.score)}/${s.words}w`).join(' ')} at ${px}px`;
    if (best.words >= MIN_WORDS && best.score >= MIN_MARGIN * Math.max(next.score, 1)) {
      return { rotate: best.rot, decided: true, method: 'ocr', detail };
    }
    last = detail;
  }
  return { rotate: 0, decided: false, method: 'ocr', detail: last };
}
