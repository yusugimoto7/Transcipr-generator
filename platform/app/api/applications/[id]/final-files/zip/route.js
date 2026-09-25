import fs from 'fs';
import { Readable } from 'stream';
import JSZip from 'jszip';
import { generatedPath } from '@/lib/uploads';
import { error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * Every final file in one .zip, named as they go to the portal. Files are
 * streamed from disk into the zip (stored, not re-compressed: PDFs and JPEGs
 * are compressed already), so a large set is never held in memory.
 */
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  const files = app.finalFiles?.files || [];
  if (!files.length) return error('Build the final files first.', 404);

  const zip = new JSZip();
  for (const f of files) {
    const meta = (app.generated || []).find((g) => g.key === f.key);
    if (!meta?.stored) continue;
    const file = generatedPath(app.id, meta.stored);
    if (!fs.existsSync(file)) continue;
    zip.file(f.filename, fs.createReadStream(file), { binary: true });
  }
  const who = String(app.data?.givenName || app.title || 'client').trim().split(/\s+/)[0];
  const name = `Final Files - ${who}.zip`.replace(/[^\w.\- ]+/g, '_');
  const stream = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'STORE' });
  return new Response(Readable.toWeb(stream), {
    status: 200,
    headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' },
  });
}
