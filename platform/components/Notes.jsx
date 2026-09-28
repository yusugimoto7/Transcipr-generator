'use client';

import { useEffect, useRef, useState } from 'react';
import { StickyNote, Trash2, FileText, AtSign } from 'lucide-react';
import LocalTime from '@/components/LocalTime';
import { notesFor, noteDocLabel, NOTE_SECTIONS } from '@/lib/notes';
import { initials } from '@/components/TopBar';

async function send(appId, body) {
  const res = await fetch(`/api/applications/${appId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save the note.');
  return d.notes;
}

// The team, for @mentions (loaded once per page).
let teamPromise = null;
function useTeam() {
  const [team, setTeam] = useState([]);
  useEffect(() => {
    teamPromise ||= fetch('/api/team').then((r) => (r.ok ? r.json() : { team: [] })).then((d) => d.team || []).catch(() => []);
    let on = true;
    teamPromise.then((t) => on && setTeam(t));
    return () => { on = false; };
  }, []);
  return team;
}

/** The note's text with its @mentions highlighted. */
function NoteText({ n }) {
  const names = (n.mentions || []).map((m) => `@${m.name}`).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <p dir="auto">{n.text}</p>;
  const esc = names.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = n.text.split(new RegExp(`(${esc.join('|')})`, 'g'));
  return <p dir="auto">{parts.map((p, i) => (names.includes(p) ? <span key={i} className="mention">{p}</span> : p))}</p>;
}

function Note({ n, viewer, onDelete, where, highlight = false }) {
  const mine = viewer && (n.by?.id === viewer.id || viewer.role === 'admin');
  return (
    <li className={`note${highlight ? ' hl' : ''}`} id={`note-${n.id}`}>
      {where}
      <NoteText n={n} />
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
 * The note box: type "@" to mention a team member — they get a notification
 * (and an account manager who is not on the file yet is added to it).
 */
function NoteForm({ app, patchLocal, section, docId, placeholder, onError }) {
  const team = useTeam();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null); // { query, start, active }
  const picked = useRef(new Map()); // name -> id
  const ta = useRef(null);
  const id = `note-${docId || section}`;

  const matches = menu
    ? team.filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(menu.query.toLowerCase())).slice(0, 6)
    : [];

  function onChange(e) {
    const v = e.target.value;
    setText(v);
    const caret = e.target.selectionStart ?? v.length;
    const m = v.slice(0, caret).match(/(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/u);
    setMenu(m ? { query: m[2], start: caret - m[2].length - 1, active: 0 } : null);
  }
  function pick(u) {
    const caret = ta.current?.selectionStart ?? text.length;
    const before = text.slice(0, menu.start);
    const after = text.slice(caret);
    const tag = `@${u.name} `;
    picked.current.set(u.name, u.id);
    setText(before + tag + after);
    setMenu(null);
    requestAnimationFrame(() => {
      ta.current?.focus();
      const pos = (before + tag).length;
      ta.current?.setSelectionRange(pos, pos);
    });
  }
  function onKeyDown(e) {
    if (menu && matches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setMenu({ ...menu, active: (menu.active + d + matches.length) % matches.length });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pick(matches[menu.active] || matches[0]);
        return;
      }
      if (e.key === 'Escape') {
        setMenu(null);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(e);
  }
  async function add(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    onError('');
    const mentions = [...picked.current.entries()].filter(([name]) => text.includes(`@${name}`)).map(([, uid]) => uid);
    try {
      patchLocal({ notes: await send(app.id, { action: 'add', text, section, docId, mentions }) });
      setText('');
      picked.current.clear();
    } catch (x) {
      onError(x.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="note-form">
      <div className="note-input">
        <label className="sr-only" htmlFor={id}>Add a note</label>
        <textarea
          ref={ta}
          id={id}
          rows={2}
          dir="auto"
          value={text}
          placeholder={placeholder || 'Add a note for the team… type @ to mention someone'}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setMenu(null), 150)}
          aria-autocomplete="list"
          aria-expanded={Boolean(menu && matches.length)}
        />
        {menu && matches.length > 0 && (
          <ul className="mention-menu" role="listbox">
            {matches.map((u, i) => (
              <li key={u.id} role="option" aria-selected={i === menu.active}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(u); }} className={i === menu.active ? 'on' : ''}>
                  <span className="avatar sm" aria-hidden="true">{initials(u.name, u.email)}</span>
                  <span>{u.name}<span className="faint small"> · {u.role === 'admin' ? 'Admin' : 'Account manager'}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" className="btn-secondary btn-sm" disabled={busy || !text.trim()}>
        {busy ? <span className="spinner" /> : null} Add note
      </button>
      <span className="note-hint small faint"><AtSign size={11} aria-hidden="true" /> mention a colleague to notify them</span>
    </form>
  );
}

/**
 * The team's notes on one document or one section, with a box to add one.
 * The AI reads them too (lib/notes.js notesText) — e.g. "Mr. Hamed approved
 * going ahead with this translation" is taken into account by the review.
 */
export function NotesBox({ app, patchLocal, viewer, section, docId = null, placeholder, title = 'Notes', compact = false, hideList = false }) {
  const [err, setErr] = useState('');
  const list = notesFor(app, { section, docId });
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
      {!hideList && list.length > 0 && <ul className="note-list">{list.map((n) => <Note key={n.id} n={n} viewer={viewer} onDelete={remove} />)}</ul>}
      <NoteForm app={app} patchLocal={patchLocal} section={section} docId={docId} placeholder={placeholder} onError={setErr} />
      {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}
    </div>
  );
}

/**
 * Every note on the file (documents and sections), newest first, each saying
 * where it was written; the label opens that place. `highlight` marks (and
 * scrolls to) one note — the one a notification points at.
 */
export function NotesFeed({ app, viewer, patchLocal, onOpen, only = null, limit = 200, empty = 'No notes yet.', highlight = null }) {
  const [err, setErr] = useState('');
  const list = (app.notes || [])
    .filter((n) => (only === 'documents' ? Boolean(n.docId) : true))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit);
  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(`note-${highlight}`);
    if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
  }, [highlight]);
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
            viewer={viewer}
            highlight={highlight === n.id}
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
