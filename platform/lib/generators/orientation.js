import fs from 'fs/promises';
import { completeJson } from '../anthropic';

/**
 * Decide how each scanned page must be rotated to sit upright, by *looking* at
 * a thumbnail of it with a vision model.
 *
 * Tesseract's OSD is trained mainly on Latin script and misjudges Persian /
 * Arabic documents (the common case here), so orientation is decided visually.
 *
 * Thumbnails are rendered by pdftoppm, which already applies each page's
 * /Rotate flag — so the angle returned here is ADDITIONAL to that flag.
 *
 * Best-effort: any failure yields no rotation for the affected pages.
 */

const BATCH = 8; // pages per vision request
const MAX_PAGES = 120; // safety cap per document

const SYSTEM = `You inspect scanned document pages and report how each one must be
rotated to be upright and readable. Many pages are Persian/Arabic, Iranian
official documents (certificates, transcripts, ID booklets, bank statements).
Judge orientation from the text baselines, headers, stamps and page layout —
NOT from the language. A page is "upright" when its text reads normally without
tilting your head.`;

function instructionFor(pageNumbers) {
  return `You are given ${pageNumbers.length} page image(s), in order, for pages
${pageNumbers.join(', ')}.

For EACH image, decide the CLOCKWISE rotation in degrees needed to make it
upright: 0, 90, 180 or 270.
 - 0   = already upright
 - 180 = upside down
 - 90  = currently rotated so the top of the text points LEFT
 - 270 = currently rotated so the top of the text points RIGHT

Return ONLY JSON: {"rotations": {"<page number>": <0|90|180|270>, ...}}
Include every page listed above. If you are unsure about a page, answer 0.`;
}

async function detectBatch(entries) {
  const content = [{ type: 'text', text: instructionFor(entries.map((e) => e.page)) }];
  for (const e of entries) {
    content.push({ type: 'text', text: `Page ${e.page}:` });
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: e.b64 },
    });
  }
  const res = await completeJson({ system: SYSTEM, content, maxTokens: 500 });
  const out = {};
  for (const [k, v] of Object.entries(res.rotations || {})) {
    const deg = Number(v);
    if ([90, 180, 270].includes(deg)) out[String(Number(k))] = deg;
  }
  return out;
}

/**
 * @param {Record<string,string>} thumbs - { pageNumber: pngPath }
 * @returns {Promise<Record<string, number>>} { pageNumber: clockwiseDegrees }
 */
export async function detectOrientations(thumbs) {
  const pages = Object.keys(thumbs)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .slice(0, MAX_PAGES);
  if (!pages.length) return {};

  // Load thumbnails, skipping any that can't be read.
  const entries = [];
  for (const page of pages) {
    try {
      const buf = await fs.readFile(thumbs[String(page)]);
      entries.push({ page, b64: buf.toString('base64') });
    } catch {
      /* skip */
    }
  }
  if (!entries.length) return {};

  const batches = [];
  for (let i = 0; i < entries.length; i += BATCH) batches.push(entries.slice(i, i + BATCH));

  // Sequential (not parallel): many simultaneous image-heavy requests trip API
  // rate limits, and a failed batch used to silently mean "no rotation" for
  // its pages. One retry per batch, and failures are logged so they show up in
  // the server logs instead of vanishing.
  const results = {};
  for (const b of batches) {
    let out = null;
    try {
      out = await detectBatch(b);
    } catch (e1) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        out = await detectBatch(b);
      } catch (e2) {
        console.error(
          `[orientation] batch for pages ${b.map((e) => e.page).join(',')} failed twice: ${e2.message}`
        );
      }
    }
    if (out) Object.assign(results, out);
  }
  console.log(
    `[orientation] checked ${entries.length} page(s), ${Object.keys(results).length} need rotation`
  );
  return results;
}

/**
 * Orientation for a single standalone image (uploaded photo).
 * @param {string} pngB64 - base64 PNG thumbnail of the image
 * @returns {Promise<number>} clockwise degrees (0 if upright/unsure)
 */
export async function detectImageOrientation(pngB64) {
  try {
    const out = await detectBatch([{ page: 1, b64: pngB64 }]);
    return out['1'] || 0;
  } catch (e) {
    console.error(`[orientation] single-image check failed: ${e.message}`);
    return 0;
  }
}
