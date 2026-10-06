import fs from 'fs';
import { Readable } from 'stream';
import { updateApplication } from '@/lib/store';
import { saveUpload, deleteUpload, docFile } from '@/lib/uploads';
import { classifyByFilename } from '@/lib/generators/classify';
import { json, error, requireOwnedApp } from '@/lib/api';
import { queueSync } from '@/lib/driveStore';
import { notifyTeam, fileLabel } from '@/lib/notify';
import { logActivity } from '@/lib/activity';
import { findingsKey } from '@/lib/docStatus';
import { numberedName, linkCopies } from '@/lib/docVersions';

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
  const { app, user, role, error: err } = await requireOwnedApp(params.id);
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
    // A name the file already has gets " - 2", " - 3" …; a newer copy of a document replaces it in use.
    for (const d of saved) {
      d.filename = numberedName(a.documents, d.filename, d.id);
      a.documents.push(d);
    }
    linkCopies(a.documents);
    return a;
  });
  queueSync(app.id); // copy the new files to the client's Drive folder
  if (role === 'applicant') {
    // The client uploaded through their own login: tell the team on the file.
    await notifyTeam(updated, {
      kind: 'documents',
      text: `${fileLabel(updated)} uploaded ${saved.length} document${saved.length === 1 ? '' : 's'}`,
      link: `/application/${app.id}#documents`,
      by: { id: user.id, name: user.name || user.email },
    });
  }
  await logActivity(app.id, user, `Uploaded ${saved.length} document${saved.length === 1 ? '' : 's'}`, { items: saved.map((d) => d.filename) });
  return json({ documents: updated.documents, added: saved }, 201);
}

// Change a document's category, sign off its check, or mark its findings as
// already checked (OK to move forward).
// Body: { docId, category } | { docId, reviewed: true|false } | { docId, cleared: true|false }
//     | { docId, replaces: <earlier document id> | null }  (newer copy of it / separate document)
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
  if (('reviewed' in body || 'cleared' in body || 'replaces' in body) && !['admin', 'manager'].includes(user.role)) return error('Only the team can sign off or link documents.', 403);
  const updated = await updateApplication(app.id, (a) => {
    const doc = (a.documents || []).find((d) => d.id === docId);
    if (!doc) return a;
    if ('replaces' in body) {
      // The team decides: this document is a newer copy of that one (used instead
      // of it), or a separate document (both used, never linked again).
      const prev = doc.replaces;
      const target = body.replaces ? (a.documents || []).find((d) => d.id === body.replaces && d.id !== doc.id) : null;
      if (target) {
        doc.replaces = target.id;
        doc.separateFrom = (doc.separateFrom || []).filter((id) => id !== target.id);
        target.separateFrom = (target.separateFrom || []).filter((id) => id !== doc.id);
      } else if (prev) {
        delete doc.replaces;
        doc.separateFrom = [...new Set([...(doc.separateFrom || []), prev])];
      }
    } else if ('cleared' in body) {
      // The team checked the Attention / Serious findings and it's OK to move
      // forward: the document shows green; the findings stay on it.
      if (!doc.verification) return a;
      const by = user.name || user.email;
      const at = new Date().toISOString();
      if (body.cleared) Object.assign(doc.verification, { cleared: { by, at, key: findingsKey(doc.verification), status: doc.verification.status }, reviewedBy: by, reviewedAt: at });
      else delete doc.verification.cleared, delete doc.verification.reviewedBy, delete doc.verification.reviewedAt;
    } else if ('reviewed' in body) {
      // A person looked at the findings and the document: the last word.
      doc.verification = doc.verification || { status: 'green', findings: [] };
      if (body.reviewed) Object.assign(doc.verification, { reviewedBy: user.name || user.email, reviewedAt: new Date().toISOString() });
      else delete doc.verification.reviewedBy, delete doc.verification.reviewedAt;
    } else {
      doc.category = category || null;
    }
    return a;
  });
  const fname = (app.documents || []).find((d) => d.id === docId)?.filename || 'a document';
  if ('replaces' in body) await logActivity(app.id, user, body.replaces ? 'Marked a document as a newer copy of another' : 'Marked a document as separate (not a newer copy)', { items: [fname] });
  else if ('cleared' in body) await logActivity(app.id, user, body.cleared ? 'Marked a document’s findings as already checked — OK to move forward' : 'Undid “already checked” on a document', { items: [fname] });
  else if ('reviewed' in body) await logActivity(app.id, user, body.reviewed ? 'Signed off a document' : 'Undid a sign-off', { items: [fname] });
  else await logActivity(app.id, user, 'Changed a document’s type', { items: [fname], detail: category || 'none' });
  return json({ documents: updated.documents });
}

// Remove a document by id.
export async function DELETE(req, { params }) {
  const { app, user, error: err } = await requireOwnedApp(params.id);
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
  await logActivity(app.id, user, 'Removed a document', { items: [doc?.filename || docId] });
  return json({ documents: updated.documents });
}
