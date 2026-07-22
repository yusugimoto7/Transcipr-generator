import { readGenerated } from '@/lib/uploads';
import { renderDocx } from '@/lib/docx';
import { error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

// Download a generated document by its key. `?format=docx` returns a Word file
// (for text documents whose source text was captured at generation time).
export async function GET(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  const meta = (app.generated || []).find((g) => g.key === params.doc);
  if (!meta) return error('Document not generated yet.', 404);

  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format');

  if (format === 'docx') {
    const text = meta.text || (params.doc === 'sop' ? app.sop?.text : '');
    if (!text) return error('Word export is not available for this document.', 400);
    const title = (meta.filename || params.doc).replace(/\.pdf$/i, '');
    const buffer = await renderDocx({ text, title });
    const name = `${title}.docx`.replace(/[^\w.\- ]+/g, '_');
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${name}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    });
  }

  let bytes;
  try {
    bytes = await readGenerated(app.id, meta.stored);
  } catch {
    return error('File missing on server. Re-generate the document.', 410);
  }

  const safeName = (meta.filename || `${meta.key}.pdf`).replace(/[^\w.\- ]+/g, '_');
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': meta.mime || 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store',
    },
  });
}
