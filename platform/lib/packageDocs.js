import sharp from 'sharp';
import {
  rasterizePdf,
  isBlank,
  thumbnailB64,
  imageToPage,
  transformPage,
} from './raster';
import { detectOrientations } from './generators/orientation';

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
 *   dropped: number, mirrored: number, rotated: number
 * }>}
 */
export async function prepareDocument({ bytes, mime }, { cleanPages = true, fixRotation = true } = {}) {
  const stats = { dropped: 0, mirrored: 0, rotated: 0 };

  // --- Photos -------------------------------------------------------------
  if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
    const img = await imageToPage(bytes);
    if (img.hadExif) stats.rotated++;
    let pic = img;
    if (fixRotation) {
      const fix = await orientationFor([{ page: 1, buffer: img.buffer }]);
      const f = fix['1'];
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

/** Run the vision check on page pictures. Best-effort: {} on failure. */
async function orientationFor(pages) {
  try {
    const thumbs = {};
    for (const p of pages) thumbs[String(p.page)] = await thumbnailB64(p.buffer);
    const { rotate, mirrored } = await detectOrientations(thumbs);
    const out = {};
    for (const [k, v] of Object.entries(rotate)) out[k] = { rotate: v, mirrored: false };
    for (const n of mirrored) out[String(n)] = { ...(out[String(n)] || { rotate: 0 }), mirrored: true };
    return out;
  } catch (e) {
    console.error(`[packageDocs] orientation check failed: ${e.message}`);
    return {};
  }
}

async function withSize(buffer) {
  const m = await sharp(buffer).metadata();
  return { buffer, width: m.width, height: m.height };
}
