import fs from 'fs';
import { Readable } from 'stream';
import { generatedPath, readGeneratedText } from '@/lib/uploads';
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
    const text =
      meta.text ||
      (await readGeneratedText(app.id, params.doc)) ||
      (params.doc === 'sop' ? app.sop?.text : '');
    if (!text) {
      return error(
        'Word export needs the document to be generated again (its source text was not stored). Press "Re-generate" for this document, then download Word.',
        400
      );
    }
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

  // Stream from disk: a compiled package can be hundreds of MB, and reading
  // it whole into memory would risk the server running out.
  const file = generatedPath(app.id, meta.stored);
  let size;
  try {
    size = (await fs.promises.stat(file)).size;
  } catch {
    return error('File missing on server. Re-generate the document.', 410);
  }

  const safeName = (meta.filename || `${meta.key}.pdf`).replace(/[^\w.\- ]+/g, '_');
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: {
      'Content-Type': meta.mime || 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(size),
      'Cache-Control': 'no-store',
    },
  });
}
