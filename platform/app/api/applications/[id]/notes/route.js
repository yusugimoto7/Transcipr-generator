import crypto from 'crypto';
import { updateApplication, listUsers, effectiveRole } from '@/lib/store';
import { notify, fileLabel } from '@/lib/notify';
import { NOTE_SECTIONS, MAX_NOTE } from '@/lib/notes';
import { json, error, requireAppAccess } from '@/lib/api';
import { logActivity } from '@/lib/activity';

/**
 * Team notes on a file (account managers and admins).
 * { action: 'add', text, section, docId?, mentions? }   a note on a section, or on one document;
 *     mentions: team members' ids (@Name in the text). They are notified, and one
 *     who is not on this file yet is added to it so the link opens for them.
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

  // @mentions: active team members only (named in the text).
  const team = (await listUsers()).filter((u) => u.active !== false && ['admin', 'manager'].includes(effectiveRole(u)));
  const raw = String(body.text || '');
  const mentioned = body.action === 'add'
    ? team.filter((u) => (Array.isArray(body.mentions) && body.mentions.includes(u.id)) || raw.includes(`@${u.name || u.email}`))
    : [];
  let added = null;

  let failure = null;
  const updated = await updateApplication(app.id, (a) => {
    a.notes ||= [];
    if (body.action === 'add') {
      const text = String(body.text || '').trim().slice(0, MAX_NOTE);
      const docId = body.docId ? String(body.docId) : null;
      if (!text) return (failure = 'Write the note first.'), false;
      if (docId && !(a.documents || []).some((d) => d.id === docId)) return (failure = 'That document is no longer on the file.'), false;
      added = {
        id: crypto.randomBytes(6).toString('hex'),
        text,
        section: docId ? 'documents' : NOTE_SECTIONS[body.section] ? body.section : 'overview',
        docId,
        by: { id: user.id, name: user.name || user.email },
        at: new Date().toISOString(),
        mentions: mentioned.map((u) => ({ id: u.id, name: u.name || u.email })),
      };
      a.notes.push(added);
      // A mentioned account manager who is not on this file yet joins it (admins see every file).
      for (const u of mentioned) {
        if (effectiveRole(u) === 'manager' && !(a.assignedTo || []).includes(u.id)) a.assignedTo = [...(a.assignedTo || []), u.id];
      }
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
  if (added) await logActivity(app.id, user, 'Added a note', { detail: added.text.slice(0, 160), items: mentioned.length ? mentioned.map((u) => `@${u.name || u.email}`) : null });
  if (body.action === 'delete') await logActivity(app.id, user, 'Removed a note');
  if (added && mentioned.length) {
    const excerpt = added.text.length > 140 ? `${added.text.slice(0, 137)}…` : added.text;
    await notify(mentioned.map((u) => u.id), {
      kind: 'mention',
      text: `${added.by.name} mentioned you on ${fileLabel(updated)}: “${excerpt}”`,
      appId: app.id,
      link: `/application/${app.id}#notes:${added.id}`,
      by: added.by,
    }).catch((e) => console.error(`[notify] ${e.message}`));
  }
  return json({ notes: updated.notes || [] });
}
