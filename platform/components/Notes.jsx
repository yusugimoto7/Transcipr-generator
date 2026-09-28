'use client';

import { useState } from 'react';
import { StickyNote, Trash2, FileText } from 'lucide-react';
import LocalTime from '@/components/LocalTime';
import { notesFor, noteDocLabel, NOTE_SECTIONS } from '@/lib/notes';

async function send(appId, body) {
  const res = await fetch(`/api/applications/${appId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save the note.');
  return d.notes;
}

function Note({ n, app, viewer, onDelete, where }) {
  const mine = viewer && (n.by?.id === viewer.id || viewer.role === 'admin');
  return (
    <li className="note">
      {where}
      <p dir="auto">{n.text}</p>
      <div className="note-meta">
        <span><strong>{n.by?.name || 'Team'}</strong> · <LocalTime iso={n.at} /></span>
        {mine && onDelete && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => onDelete(n)} title="Remove this note">
            <Trash2 size={13} aria-hidden="true" /><span className="sr-only">Remove</span>
          </button>
        )}
      </div>
    </li>
  );
}

/**
 * The team's notes on one document or one section, with a box to add one.
 * The AI reads them too (lib/notes.js notesText) — e.g. "Mr. Hamed approved
 * going ahead with this translation" is taken into account by the review.
 */
export function NotesBox({ app, patchLocal, viewer, section, docId = null, placeholder, title = 'Notes', compact = false, hideList = false }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const list = notesFor(app, { section, docId });

  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setErr('');
    try {
      patchLocal({ notes: await send(app.id, { action: 'add', text, section, docId }) });
      setText('');
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(n) {
    if (!window.confirm('Remove this note?')) return;
    try {
      patchLocal({ notes: await send(app.id, { action: 'delete', id: n.id }) });
    } catch (x) {
      setErr(x.message);
    }
  }

  return (
    <div className={`notes${compact ? ' compact' : ''}`}>
      <div className="notes-head"><StickyNote size={14} aria-hidden="true" /> {title}{!hideList && list.length ? <span className="count">{list.length}</span> : null}</div>
      {!hideList && list.length > 0 && <ul className="note-list">{list.map((n) => <Note key={n.id} n={n} app={app} viewer={viewer} onDelete={remove} />)}</ul>}
      <form onSubmit={add} className="note-form">
        <label className="sr-only" htmlFor={`note-${docId || section}`}>Add a note</label>
        <textarea
          id={`note-${docId || section}`}
          rows={2}
          dir="auto"
          value={text}
          placeholder={placeholder || 'Add a note for the team…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(e); }}
        />
        <button type="submit" className="btn-secondary btn-sm" disabled={busy || !text.trim()}>
          {busy ? <span className="spinner" /> : null} Add note
        </button>
      </form>
      {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
    </div>
  );
}

/**
 * Every note on the file (documents and sections), newest first, each saying
 * where it was written; the label opens that place. Used on the overview and,
 * for document notes, in the documents summary.
 */
export function NotesFeed({ app, viewer, patchLocal, onOpen, only = null, limit = 50, empty = 'No notes yet.' }) {
  const [err, setErr] = useState('');
  const list = (app.notes || [])
    .filter((n) => (only === 'documents' ? Boolean(n.docId) : true))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
  async function remove(n) {
    if (!window.confirm('Remove this note?')) return;
    try {
      patchLocal({ notes: await send(app.id, { action: 'delete', id: n.id }) });
    } catch (x) {
      setErr(x.message);
    }
  }
  if (!list.length) return <p className="small muted" style={{ margin: 0 }}>{empty}</p>;
  return (
    <>
      <ul className="note-list">
        {list.map((n) => (
          <Note
            key={n.id}
            n={n}
            app={app}
            viewer={viewer}
            onDelete={patchLocal ? remove : null}
            where={
              <button type="button" className="note-where" onClick={() => onOpen?.(n)}>
                {n.docId ? <><FileText size={12} aria-hidden="true" /> {noteDocLabel(app, n)}</> : NOTE_SECTIONS[n.section] || 'File'}
              </button>
            }
          />
        ))}
      </ul>
      {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
    </>
  );
}
