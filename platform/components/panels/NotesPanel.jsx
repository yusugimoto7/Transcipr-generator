'use client';

import { NotesBox, NotesFeed } from '@/components/Notes';

/**
 * Team notes: every note on this file — on the file itself, on each section
 * and on each document — newest first, and a box to add one. Type @ to
 * mention a colleague; they are notified. Opened from a notification, the
 * note it points at is highlighted.
 */
export default function NotesPanel({ app, patchLocal, viewer, go, openDoc, highlight }) {
  const count = (app.notes || []).length;
  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Team notes</h1>
          <p className="muted small">
            Notes from account managers and admins on this file, its documents and each section. Type @ to mention a colleague — they get a
            notification. The review, the letters and the assistant take the notes into account.
          </p>
        </div>
      </div>
      <section className="card">
        <NotesBox app={app} patchLocal={patchLocal} viewer={viewer} section="overview" title="Add a note on the file" placeholder="e.g. @Maryam the client prefers WhatsApp — call before sending anything to IRCC." hideList />
      </section>
      <section className="card" aria-label="All notes">
        <div className="card-head" style={{ marginBottom: 8 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>All notes{count ? ` (${count})` : ''}</h2>
        </div>
        <NotesFeed
          app={app}
          viewer={viewer}
          patchLocal={patchLocal}
          highlight={highlight}
          onOpen={(n) => (n.docId ? openDoc(n.docId) : n.section === 'overview' ? null : go(n.section))}
          empty="No notes yet. Notes written on documents and in each section appear here too."
        />
      </section>
    </div>
  );
}
