import { updateApplication } from '@/lib/store';
import { saveUpload, deleteUpload } from '@/lib/uploads';
import { classifyByFilename } from '@/lib/generators/classify';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

// Upload one or more documents for an application. Categories are guessed from
// filenames immediately; AI refines them during the extract step.
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let form;
  try {
    form = await req.formData();
  } catch {
    return error('Expected multipart form data.');
  }

  const files = form.getAll('files').filter((f) => typeof f.arrayBuffer === 'function');
  if (!files.length) return error('No files provided.');

  const saved = [];
  try {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const meta = await saveUpload(app.id, {
        buffer,
        filename: file.name,
        mime: file.type,
        category: classifyByFilename(file.name),
      });
      saved.push(meta);
    }
  } catch (e) {
    return error(e.message || 'Upload failed.', e.status || 500);
  }

  const updated = await updateApplication(app.id, (a) => {
    a.documents.push(...saved);
    return a;
  });
  return json({ documents: updated.documents, added: saved }, 201);
}

// Remove a document by id.
export async function DELETE(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  const { searchParams } = new URL(req.url);
  const docId = searchParams.get('docId');
  if (!docId) return error('docId is required.');

  const doc = (app.documents || []).find((d) => d.id === docId);
  if (doc) await deleteUpload(app.id, doc.stored);

  const updated = await updateApplication(app.id, (a) => {
    a.documents = (a.documents || []).filter((d) => d.id !== docId);
    return a;
  });
  return json({ documents: updated.documents });
}
