import { spawn } from 'child_process';
import { docFile } from '@/lib/uploads';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

const MAX_PAGES = 30; // previewed pages per document

function run(cmd, args, timeout = 30000) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args);
    const chunks = [];
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', () => {});
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? Buffer.concat(chunks) : null);
    });
  });
}

/**
 * Page pictures of an uploaded PDF for the Documents tab's preview — images
 * show in every browser, including phones that can't display a PDF in a page.
 *   GET ?docId=…&info=1   → { pages }
 *   GET ?docId=…&page=N   → JPEG of page N
 */
export async function GET(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  const { searchParams } = new URL(req.url);
  const doc = (app.documents || []).find((d) => d.id === searchParams.get('docId'));
  if (!doc || doc.mime !== 'application/pdf' || !/^[\w.-]+$/.test(doc.stored || '')) return error('No preview for this document.', 404);
  let file;
  try {
    file = await docFile(app.id, doc); // the cached copy, or fetched from Google Drive
  } catch (e) {
    return error(e.message || 'File missing.', 410);
  }

  if (searchParams.get('info')) {
    const out = await run('pdfinfo', [file]);
    const pages = Number(out?.toString().match(/Pages:\s+(\d+)/)?.[1]) || 0;
    return json({ pages: Math.min(pages, MAX_PAGES), total: pages });
  }

  const page = Math.max(1, Math.min(MAX_PAGES, Number(searchParams.get('page')) || 1));
  const jpg = await run('pdftoppm', ['-jpeg', '-jpegopt', 'quality=78', '-scale-to', '1100', '-f', String(page), '-l', String(page), '-singlefile', file]);
  if (!jpg?.length) return error('Could not render this page.', 422);
  return new Response(jpg, {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg', 'Content-Length': String(jpg.length), 'Cache-Control': 'private, max-age=600' },
  });
}
