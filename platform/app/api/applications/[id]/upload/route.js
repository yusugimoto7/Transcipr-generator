import fs from 'fs';
import { Readable } from 'stream';
import { updateApplication } from '@/lib/store';
import { saveUpload, deleteUpload, docFile } from '@/lib/uploads';
import { classifyByFilename } from '@/lib/generators/classify';
import { json, error, requireOwnedApp } from '@/lib/api';
import { queueSync } from '@/lib/driveStore';

export const runtime = 'nodejs';

// View an uploaded document in the browser (the Documents tab's preview):
// GET ?docId=… streams the file inline; add &download=1 to save it instead.
export async function GET(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  const { searchParams } = new URL(req.url);
  const doc = (app.documents || []).find((d) => d.id === searchParams.get('docId'));
  if (!doc) return error('Document not found.', 404);
  // `stored` is a server-generated name; refuse anything that is not a plain file name.
  if (!/^[\w.-]+$/.test(doc.stored || '')) return error('Document not found.', 404);
  let file;
  let size;
  try {
    file = await docFile(app.id, doc); // the cached copy, or fetched from Google Drive
    size = (await fs.promises.stat(file)).size;
  } catch (e) {
    return error(e.message || 'File missing.', 410);
  }
  const name = (doc.filename || doc.stored).replace(/[^\w.\- ]+/g, '_');
  const disposition = searchParams.get('download') ? 'attachment' : 'inline';
  return new Response(Readable.toWeb(fs.createReadStream(file)), {
    status: 200,
    headers: {
      'Content-Type': doc.mime || 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename="${name}"`,
      'Content-Length': String(size),
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

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
        category: classifyByFilename(file.name, app.type),
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
  queueSync(app.id); // copy the new files to the client's Drive folder
  return json({ documents: updated.documents, added: saved }, 201);
}

// Change a document's category, or sign off its check.
// Body: { docId, category } | { docId, reviewed: true|false }
export async function PATCH(req, { params }) {
  const { user, app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const { docId, category } = body;
  if (!docId) return error('docId is required.');
  if ('reviewed' in body && !['admin', 'manager'].includes(user.role)) return error('Only the team can sign off a document.', 403);
  const updated = await updateApplication(app.id, (a) => {
    const doc = (a.documents || []).find((d) => d.id === docId);
    if (!doc) return a;
    if ('reviewed' in body) {
      // A person looked at the findings and the document: the last word.
      doc.verification = doc.verification || { status: 'green', findings: [] };
      if (body.reviewed) Object.assign(doc.verification, { reviewedBy: user.name || user.email, reviewedAt: new Date().toISOString() });
      else delete doc.verification.reviewedBy, delete doc.verification.reviewedAt;
    } else {
      doc.category = category || null;
    }
    return a;
  });
  return json({ documents: updated.documents });
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
