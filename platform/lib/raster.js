import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import sharp from 'sharp';

/**
 * Turn uploaded documents into page pictures.
 *
 * Package compilation used to EMBED source PDF pages and then reason about
 * their geometry (MediaBox origin, CropBox, /Rotate, nested transforms). Every
 * scanner and phone app encodes those differently, and any hand-rolled
 * geometry eventually meets a file it gets wrong — content shifted off the
 * page or cut on one side. Rendering the page with poppler (the engine PDF
 * viewers use) sidesteps all of it: what pdftoppm draws is what the viewer
 * shows. Orientation fixes then become plain image rotation.
 */

export const RASTER_DPI = Number(process.env.PACKAGE_DPI) || 150;
const JPEG_QUALITY = Number(process.env.PACKAGE_JPEG_QUALITY) || 80;
const MAX_PAGES = Number(process.env.PACKAGE_MAX_PAGES) || 200;

// Blank detection: a scanned blank sheet is near-uniform white.
const DARK_THRESHOLD = 128;
const MIN_INK_FRACTION = 0.002;

function run(cmd, args, { timeout = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    let err = '';
    const p = spawn(cmd, args);
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`${cmd} timed out`));
    }, timeout);
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 400)}`));
    });
  });
}

/**
 * Render every page of a PDF to a JPEG, as a viewer would display it
 * (CropBox + /Rotate applied).
 * @returns {Promise<Array<{page:number, buffer:Buffer, width:number, height:number}>>}
 */
export async function rasterizePdf(bytes, { dpi = RASTER_DPI, lastPage = MAX_PAGES } = {}) {
  const stamp = crypto.randomBytes(6).toString('hex');
  const dir = path.join(os.tmpdir(), `raster-${stamp}`);
  await fs.mkdir(dir, { recursive: true });
  const pdfPath = path.join(dir, 'in.pdf');
  const prefix = path.join(dir, 'p');
  try {
    await fs.writeFile(pdfPath, bytes);
    await run('pdftoppm', [
      '-cropbox',
      '-r', String(dpi),
      '-l', String(Math.min(lastPage, MAX_PAGES)),
      '-jpeg',
      '-jpegopt', `quality=${JPEG_QUALITY},optimize=y`,
      pdfPath,
      prefix,
    ]);
    const files = (await fs.readdir(dir))
      .map((f) => ({ f, m: f.match(/^p-(\d+)\.jpg$/) }))
      .filter((x) => x.m)
      .map((x) => ({ f: x.f, page: Number(x.m[1]) }))
      .sort((a, b) => a.page - b.page);
    const pages = [];
    for (const { f, page } of files) {
      const buffer = await fs.readFile(path.join(dir, f));
      const meta = await sharp(buffer).metadata();
      pages.push({ page, buffer, width: meta.width, height: meta.height });
    }
    return pages;
  } finally {
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Fraction of dark pixels, measured on a small grayscale copy. */
export async function inkFraction(buffer) {
  const { data, info } = await sharp(buffer)
    .resize({ width: 300, withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let dark = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] < DARK_THRESHOLD) dark++;
  return dark / (data.length / info.channels);
}

export async function isBlank(buffer) {
  try {
    return (await inkFraction(buffer)) < MIN_INK_FRACTION;
  } catch {
    return false;
  }
}

/** Small PNG (base64) of a page picture for the vision orientation check. */
export async function thumbnailB64(buffer, width = 520) {
  const png = await sharp(buffer).resize({ width, withoutEnlargement: true }).png().toBuffer();
  return png.toString('base64');
}

/**
 * Normalize an uploaded image (JPEG/PNG/WEBP) into a page picture: bake in
 * EXIF orientation, flatten transparency onto white, cap the size, re-encode
 * as JPEG. Returns { buffer, width, height, hadExif }.
 */
export async function imageToPage(bytes, { maxSide = 2400 } = {}) {
  const meta = await sharp(bytes, { failOn: 'none' }).metadata();
  const hadExif = Boolean(meta.orientation && meta.orientation !== 1);
  const buffer = await sharp(bytes, { failOn: 'none' })
    .rotate() // apply EXIF orientation (no-op when absent)
    .flatten({ background: '#ffffff' })
    .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
  const out = await sharp(buffer).metadata();
  return { buffer, width: out.width, height: out.height, hadExif };
}

/** Rotate a page picture clockwise by 0/90/180/270 and/or un-mirror it. */
export async function transformPage(buffer, { rotate = 0, flop = false } = {}) {
  if (!rotate && !flop) return buffer;
  let img = sharp(buffer);
  if (flop) img = img.flop();
  if (rotate) img = img.rotate(rotate); // sharp rotates clockwise
  return img.jpeg({ quality: JPEG_QUALITY }).toBuffer();
}
