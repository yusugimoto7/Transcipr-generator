import { readGenerated } from '@/lib/uploads';
import { error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

// Download a generated document by its key.
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  const meta = (app.generated || []).find((g) => g.key === params.doc);
  if (!meta) return error('Document not generated yet.', 404);

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
