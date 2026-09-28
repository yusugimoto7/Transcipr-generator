'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import LocalTime from '@/components/LocalTime';
import { initials } from '@/components/TopBar';

const LEVEL = { superadmin: 'Super admin', admin: 'Admin', manager: 'Account manager' };

/**
 * Team activity on this file: who (account manager, admin, super admin) did
 * what and when — uploads, sign-offs, intake edits, reading, letters, reviews,
 * final files, notes, emails, access changes. Filter by person.
 */
export default function ActivityLog({ app }) {
  const [list, setList] = useState(null);
  const [who, setWho] = useState('');
  const [more, setMore] = useState(40);
  const key = `${app.version || 0}-${(app.notes || []).length}`;
  useEffect(() => {
    let on = true;
    fetch(`/api/applications/${app.id}/activity`).then((r) => (r.ok ? r.json() : { activity: [] })).then((d) => on && setList(d.activity || [])).catch(() => on && setList([]));
    return () => { on = false; };
  }, [app.id, key]);

  const people = [...new Map((list || []).map((e) => [e.by?.id, e.by])).values()].filter(Boolean);
  const shown = (list || []).filter((e) => !who || e.by?.id === who);

  return (
    <section className="card" aria-labelledby="act-log-h">
      <div className="card-head" style={{ marginBottom: 8 }}>
        <div>
          <h2 id="act-log-h" style={{ fontSize: 16, margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><History size={16} aria-hidden="true" /> Team activity</h2>
          <p className="small muted" style={{ margin: '4px 0 0' }}>Everything account managers, admins and super admins did on this file, newest first.</p>
        </div>
        {people.length > 1 && (
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Show activity of" style={{ width: 'auto', padding: '6px 8px' }}>
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      {list === null ? (
        <p className="small muted">Loading…</p>
      ) : !shown.length ? (
        <p className="small muted" style={{ margin: 0 }}>No team activity recorded yet. From now on, every change the team makes here is listed.</p>
      ) : (
        <>
          <ol className="act-log">
            {shown.slice(0, more).map((e) => (
              <li key={e.id}>
                <span className={`avatar sm lv-${e.by?.level}`} aria-hidden="true">{initials(e.by?.name || '')}</span>
                <div className="act-body">
                  <div>
                    <strong>{e.by?.name}</strong> <span className="faint small">{LEVEL[e.by?.level] || ''}</span> · {e.action}
                    {e.count > 1 ? <span className="faint small"> ({e.count} times)</span> : null}
                  </div>
                  {e.items?.length > 0 && (
                    <div className="act-items">
                      {e.items.slice(0, 8).map((x, i) => <span key={i} className="chip">{x}</span>)}
                      {e.items.length > 8 && <span className="faint small">+{e.items.length - 8} more</span>}
                    </div>
                  )}
                  {e.detail && <div className="small muted act-detail" dir="auto">{e.detail}</div>}
                  <div className="act-when"><LocalTime iso={e.at} /></div>
                </div>
              </li>
            ))}
          </ol>
          {shown.length > more && <button type="button" className="btn-ghost btn-sm" onClick={() => setMore(more + 60)}>Show older ({shown.length - more})</button>}
        </>
      )}
    </section>
  );
}
