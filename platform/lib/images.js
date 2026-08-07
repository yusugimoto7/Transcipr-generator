import sharp from 'sharp';
import { detectImageOrientation } from './generators/orientation';

/**
 * Normalize an uploaded photo for package compilation:
 *
 *  1. Apply the EXIF orientation flag. Phone cameras store rotation as EXIF
 *     metadata that image viewers honour but PDF embedding ignores — the top
 *     cause of upside-down/sideways pictures in compiled files.
 *  2. Optionally have a vision model look at the pixels and report any
 *     remaining rotation (covers photos whose pixels are simply rotated).
 *  3. Convert WEBP to PNG so it can be embedded in the PDF.
 *
 * Returns { bytes, mime, rotated } — best-effort; on failure returns the
 * original untouched.
 */
export async function normalizeImage(bytes, mime, { vision = true } = {}) {
  try {
    const meta = await sharp(bytes, { failOn: 'none' }).metadata();
    const hadExif = Boolean(meta.orientation && meta.orientation !== 1);

    // Step 1: bake in EXIF orientation (no-op when absent).
    let img = sharp(bytes, { failOn: 'none' }).rotate();
    let outMime = mime;
    if (mime === 'image/webp') {
      img = img.png();
      outMime = 'image/png';
    }
    let out = await img.toBuffer();

    // Step 2: vision check for pixel-level rotation.
    let extra = 0;
    if (vision) {
      try {
        const thumb = await sharp(out)
          .resize({ width: 480, withoutEnlargement: true })
          .png()
          .toBuffer();
        extra = await detectImageOrientation(thumb.toString('base64'));
      } catch {
        extra = 0;
      }
    }
    if (extra) {
      out = await sharp(out).rotate(extra).toBuffer(); // sharp rotates clockwise
    }

    return { bytes: out, mime: outMime, rotated: hadExif || extra > 0 };
  } catch (e) {
    console.error(`[images] normalize failed: ${e.message}`);
    return { bytes, mime, rotated: false };
  }
}
