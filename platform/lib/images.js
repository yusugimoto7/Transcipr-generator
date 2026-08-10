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

    // Step 2: vision check for pixel-level rotation and mirroring.
    let extra = 0;
    let flipped = false;
    if (vision) {
      try {
        const thumbOf = async (buf) =>
          (await sharp(buf).resize({ width: 480, withoutEnlargement: true }).png().toBuffer())
            .toString('base64');
        let res = await detectImageOrientation(await thumbOf(out));
        if (res.mirrored) {
          // A mirrored photo CAN be repaired: flip it back, then re-judge the
          // rotation (an answer read off a mirrored image isn't trustworthy).
          out = await sharp(out).flop().toBuffer();
          flipped = true;
          res = await detectImageOrientation(await thumbOf(out));
        }
        extra = res.rotate;
      } catch {
        extra = 0;
      }
    }
    if (extra) {
      out = await sharp(out).rotate(extra).toBuffer(); // sharp rotates clockwise
    }

    return { bytes: out, mime: outMime, rotated: hadExif || flipped || extra > 0 };
  } catch (e) {
    console.error(`[images] normalize failed: ${e.message}`);
    return { bytes, mime, rotated: false };
  }
}
