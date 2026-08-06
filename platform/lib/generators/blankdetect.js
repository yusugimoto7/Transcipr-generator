import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const SCRIPT = path.join(process.cwd(), 'lib', 'forms', 'analyze_pages.py');

/**
 * Analyze a PDF's pages for compilation:
 *   blank  - pages with (near) zero ink, detected by rasterizing and measuring
 *   rotate - { pageNumber: clockwiseDegrees } for pages whose CONTENT is
 *            rotated (upside-down scans carry no /Rotate flag)
 *
 * Best-effort: on any failure returns empty results so callers keep every page
 * exactly as-is.
 */
export async function analyzePages(bytes, { detectOrientation = true } = {}) {
  const tmp = path.join(os.tmpdir(), `pages-${crypto.randomBytes(6).toString('hex')}.pdf`);
  try {
    await fs.writeFile(tmp, bytes);
    const result = await new Promise((resolve) => {
      let out = '';
      let py;
      try {
        py = spawn(process.env.PYTHON_BIN || 'python3', [SCRIPT, tmp], {
          env: { ...process.env, DETECT_ORIENTATION: detectOrientation ? '1' : '0' },
        });
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
    if (result?.ok) {
      return { pages: result.pages || 0, blank: result.blank || [], rotate: result.rotate || {} };
    }
    return { pages: 0, blank: [], rotate: {} };
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}

/** Backwards-compatible helper: blank pages only. */
export async function detectBlankPages(bytes) {
  const { pages, blank } = await analyzePages(bytes, { detectOrientation: false });
  return { pages, blank };
}
