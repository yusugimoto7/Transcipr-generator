import sharp from 'sharp';
import {
  rasterizePdf,
  isBlank,
  thumbnailB64,
  imageToPage,
  transformPage,
} from './raster';
import { detectOrientations, pickUpright } from './generators/orientation';
import { orientationByText, tesseractAvailable } from './orientationOcr';

/**
 * Prepare one uploaded document for package compilation.
 *
 * Whatever comes in — a PDF of any page size / orientation / box layout, or a
 * JPEG / PNG / WEBP photo — comes out as a list of upright page pictures that
 * the compiler simply places fit-to-page. Blank scan pages and mirrored scan
 * artifacts are dropped; sideways/upside-down pages are rotated on the pixels.
 *
 * @returns {Promise<{
 *   pages: Array<{ buffer: Buffer, width: number, height: number }>,
 *   dropped: number, mirrored: number, rotated: number, uncertain: number[]
 * }>}
 */
export async function prepareDocument({ bytes, mime }, { cleanPages = true, fixRotation = true } = {}) {
  // uncertain: pages whose orientation could not be established (left as scanned)
  const stats = { dropped: 0, mirrored: 0, rotated: 0, uncertain: [] };

  // --- Photos -------------------------------------------------------------
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    const img = await imageToPage(bytes);
    if (img.hadExif) stats.rotated++;
    let pic = img;
    if (fixRotation) {
      const fix = await orientationFor([{ page: 1, buffer: img.buffer }]);
      const f = fix['1'];
      if (f?.uncertain) stats.uncertain.push(1);
      if (f && (f.rotate || f.mirrored)) {
        // Mirrored photos are repaired (flipped back), not dropped.
        const buffer = await transformPage(img.buffer, { rotate: f.rotate, flop: f.mirrored });
        pic = await withSize(buffer);
        stats.rotated++;
        if (f.mirrored) stats.mirrored++;
      }
    }
    return { pages: [pic], ...stats };
  }

  // --- PDFs ---------------------------------------------------------------
  if (mime !== 'application/pdf') throw new Error(`Unsupported type ${mime}`);
  const rendered = await rasterizePdf(bytes);
  if (!rendered.length) throw new Error('PDF has no renderable pages');

  // Blank pages: drop, but never every page of a document.
  let kept = rendered;
  if (cleanPages) {
    const flags = await Promise.all(rendered.map((p) => isBlank(p.buffer)));
    const nonBlank = rendered.filter((_, i) => !flags[i]);
    if (nonBlank.length > 0 && nonBlank.length < rendered.length) {
      stats.dropped += rendered.length - nonBlank.length;
      kept = nonBlank;
    }
  }

  // Orientation: the render already honours each page's /Rotate flag, so this
  // only catches scans whose PIXELS are sideways/upside-down, plus mirrors.
  if (fixRotation && kept.length) {
    const fix = await orientationFor(kept);
    const out = [];
    for (const p of kept) {
      const f = fix[String(p.page)];
      if (f?.uncertain) stats.uncertain.push(p.page);
      if (f?.mirrored) {
        // A mirrored PDF page is a scan artifact (and usually a duplicate of
        // the readable page next to it) — drop it, unless it's the only page.
        if (kept.length > 1) {
          stats.mirrored++;
          continue;
        }
      }
      if (f?.rotate) {
        out.push(await withSize(await transformPage(p.buffer, { rotate: f.rotate })));
        stats.rotated++;
      } else {
        out.push(p);
      }
    }
    kept = out;
  }

  return {
    pages: kept.map(({ buffer, width, height }) => ({ buffer, width, height })),
    ...stats,
  };
}

/**
 * Orientation of each page picture: { [page]: { rotate, mirrored, uncertain } }.
 *
 *   1. The text decides (lib/orientationOcr.js): Tesseract's confident OSD, or
 *      the rotation in which the page reads clearly best.
 *   2. Pages with too little text: the vision model picks the upright one of
 *      the four orientations. Still undecided → left as scanned, and reported.
 *   3. Mirrored scans (left-right flipped) are flagged by the vision check.
 * Best-effort: failures leave pages as they are.
 */
async function orientationFor(pages) {
  const out = {};
  const thumbs = {};
  for (const p of pages) thumbs[String(p.page)] = await thumbnailB64(p.buffer);

  const undecided = [];
  for (const p of pages) {
    const key = String(p.page);
    try {
      const d = await orientationByText(p.buffer);
      if (d.decided) out[key] = { rotate: d.rotate, mirrored: false, how: d.method };
      else undecided.push(p);
    } catch (e) {
      console.error(`[packageDocs] OCR orientation failed: ${e.message}`);
      undecided.push(p);
    }
  }
  if (!tesseractAvailable()) console.warn('[packageDocs] tesseract not installed — orientation falls back to the vision model');

  if (undecided.length) {
    const picked = await pickUpright(
      undecided.map((p) => ({ page: p.page, b64: thumbs[String(p.page)] })),
      async (b64, rot) => (rot ? (await sharp(Buffer.from(b64, 'base64')).rotate(rot).png().toBuffer()).toString('base64') : b64)
    );
    for (const p of undecided) {
      const key = String(p.page);
      if (key in picked) out[key] = { rotate: picked[key], mirrored: false, how: 'vision' };
      else out[key] = { rotate: 0, mirrored: false, uncertain: true };
    }
  }

  // Mirror check (vision). Its rotation answers are not used.
  try {
    const { mirrored } = await detectOrientations(thumbs);
    for (const n of mirrored) out[String(n)] = { ...(out[String(n)] || { rotate: 0 }), mirrored: true };
  } catch (e) {
    console.error(`[packageDocs] mirror check failed: ${e.message}`);
  }
  return out;
}

async function withSize(buffer) {
  const m = await sharp(buffer).metadata();
  return { buffer, width: m.width, height: m.height };
}
