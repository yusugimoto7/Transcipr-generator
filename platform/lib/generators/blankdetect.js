import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const SCRIPT = path.join(process.cwd(), 'lib', 'forms', 'blank_pages.py');

/**
 * Deterministically detect blank pages in a PDF (rasterize + measure ink).
 * Returns { pages, blank: number[] } — best-effort: on any failure returns
 * { pages: 0, blank: [] } so callers keep all pages.
 */
export async function detectBlankPages(bytes) {
  const tmp = path.join(os.tmpdir(), `blank-${crypto.randomBytes(6).toString('hex')}.pdf`);
  try {
    await fs.writeFile(tmp, bytes);
    const result = await new Promise((resolve) => {
      let out = '';
      let py;
      try {
        py = spawn(process.env.PYTHON_BIN || 'python3', [SCRIPT, tmp]);
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
    if (result?.ok) return { pages: result.pages || 0, blank: result.blank || [] };
    return { pages: 0, blank: [] };
  } finally {
    fs.unlink(tmp).catch(() => {});
  }
}
