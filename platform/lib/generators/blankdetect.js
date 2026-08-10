import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { detectOrientations } from './orientation';

const SCRIPT = path.join(process.cwd(), 'lib', 'forms', 'analyze_pages.py');

function runScript(pdfPath, thumbDir) {
  return new Promise((resolve) => {
    let out = '';
    let py;
    const args = thumbDir ? [SCRIPT, pdfPath, thumbDir] : [SCRIPT, pdfPath];
    try {
      py = spawn(process.env.PYTHON_BIN || 'python3', args);
    } catch {
      resolve(null);
      return;
    }
    py.stdout.on('data', (d) => (out += d));
    py.on('error', () => resolve(null));
    py.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Analyze a PDF's pages for compilation:
 *   blank    - pages with (near) zero ink, found by rasterizing and measuring
 *   rotate   - { pageNumber: clockwiseDegrees } for pages whose CONTENT is
 *              rotated. Detected by looking at page thumbnails with a vision
 *              model, which handles Persian/Arabic scans that OCR-based
 *              orientation detection gets wrong.
 *   mirrored - page numbers that are left-right flipped scan artifacts. No
 *              rotation can fix a mirrored page, so callers drop them.
 *
 * Best-effort: on any failure returns empty results so callers keep every page
 * exactly as-is.
 */
export async function analyzePages(bytes, { detectOrientation = true } = {}) {
  const stamp = crypto.randomBytes(6).toString('hex');
  const tmp = path.join(os.tmpdir(), `pages-${stamp}.pdf`);
  const thumbDir = detectOrientation ? path.join(os.tmpdir(), `thumbs-${stamp}`) : null;
  try {
    await fs.writeFile(tmp, bytes);
    const result = await runScript(tmp, thumbDir);
    if (!result?.ok) return { pages: 0, blank: [], rotate: {}, mirrored: [] };

    let rotate = {};
    let mirrored = [];
    if (detectOrientation && result.thumbs && Object.keys(result.thumbs).length) {
      try {
        ({ rotate, mirrored } = await detectOrientations(result.thumbs));
      } catch {
        rotate = {};
        mirrored = [];
      }
    }
    return { pages: result.pages || 0, blank: result.blank || [], rotate, mirrored };
  } finally {
    fs.unlink(tmp).catch(() => {});
    if (thumbDir) fs.rm(thumbDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Backwards-compatible helper: blank pages only. */
export async function detectBlankPages(bytes) {
  const { pages, blank } = await analyzePages(bytes, { detectOrientation: false });
  return { pages, blank };
}
