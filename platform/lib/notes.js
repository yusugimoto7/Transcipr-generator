/**
 * Team notes on a file (app.notes), written by account managers and admins:
 * on a document ("Mr. Hamed approved going ahead with this translation") or
 * on a section of the file (intake, letter, review, final files, emails, or
 * the file in general). Each note keeps its writer and time.
 *
 * The notes are for the team only (lib/emails.js forViewer hides them from
 * clients) and are given to the AI — the readiness review, the letter drafts
 * and the assistant — as decisions and context from the team (notesText).
 *
 * app.notes: [{ id, text, section, docId?, by: { id, name }, at }]
 */

export const NOTE_SECTIONS = {
  overview: 'File',
  documents: 'Documents',
  emails: 'Emails',
  intake: 'Intake',
  sop: 'Letter',
  review: 'Review',
  generate: 'Final files',
};

export const MAX_NOTE = 4000;

/** Notes of one document, or of one section (without the document notes), newest first. */
export function notesFor(app, { docId = null, section = null } = {}) {
  return (app.notes || [])
    .filter((n) => (docId ? n.docId === docId : (!section || n.section === section) && (section === 'documents' ? !n.docId : true)))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** The document a note is about, as the team would name it. */
export function noteDocLabel(app, n) {
  if (!n.docId) return '';
  const d = (app.documents || []).find((x) => x.id === n.docId);
  return d ? d.filename : 'a removed document';
}

/** Notes as text for the AI prompts (review, letters, assistant). */
export function notesText(app, max = 60) {
  const list = [...(app.notes || [])].sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(-max);
  if (!list.length) return '';
  const lines = list.map((n) => {
    const where = n.docId ? `document "${noteDocLabel(app, n)}"` : `${NOTE_SECTIONS[n.section] || 'File'}`;
    return `- [${where}] ${String(n.at).slice(0, 10)}, ${n.by?.name || 'team'}: ${n.text.replace(/\s+/g, ' ').trim()}`;
  });
  return `Notes from the firm's team on this file (decisions and context from the account managers — respect them: e.g. a document the team noted as approved to proceed with is accepted as it is, and its findings are not blockers unless the note says otherwise):\n${lines.join('\n')}`;
}
