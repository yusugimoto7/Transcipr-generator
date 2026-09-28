import crypto from 'crypto';
import { updateApplication } from '@/lib/store';
import { NOTE_SECTIONS, MAX_NOTE } from '@/lib/notes';
import { json, error, requireAppAccess } from '@/lib/api';

/**
 * Team notes on a file (account managers and admins).
 * { action: 'add', text, section, docId? }   a note on a section, or on one document
 * { action: 'delete', id }                   the writer or an admin removes a note
 */
export async function POST(req, { params }) {
  const { user, app, role, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  if (role !== 'admin' && role !== 'manager') return error('Only the team can write notes.', 403);
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }

  let failure = null;
  const updated = await updateApplication(app.id, (a) => {
    a.notes ||= [];
    if (body.action === 'add') {
      const text = String(body.text || '').trim().slice(0, MAX_NOTE);
      const docId = body.docId ? String(body.docId) : null;
      if (!text) return (failure = 'Write the note first.'), false;
      if (docId && !(a.documents || []).some((d) => d.id === docId)) return (failure = 'That document is no longer on the file.'), false;
      a.notes.push({
        id: crypto.randomBytes(6).toString('hex'),
        text,
        section: docId ? 'documents' : NOTE_SECTIONS[body.section] ? body.section : 'overview',
        docId,
        by: { id: user.id, name: user.name || user.email },
        at: new Date().toISOString(),
      });
      return a;
    }
    if (body.action === 'delete') {
      const n = a.notes.find((x) => x.id === body.id);
      if (!n) return (failure = 'Note not found.'), false;
      if (n.by?.id !== user.id && role !== 'admin') return (failure = 'Only the writer or an admin can remove a note.'), false;
      a.notes = a.notes.filter((x) => x.id !== body.id);
      return a;
    }
    failure = 'Unknown action.';
    return false;
  }, { by: user.id });
  if (failure) return error(failure, failure.startsWith('Only') ? 403 : 400);
  return json({ notes: updated.notes || [] });
}
