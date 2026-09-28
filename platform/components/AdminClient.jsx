'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Trash2 } from 'lucide-react';
import { fmtTime } from '@/lib/format';
import AdminIrcc from '@/components/AdminIrcc';
import AdminMail from '@/components/AdminMail';
import AdminStorage from '@/components/AdminStorage';
import AdminOdoo from '@/components/AdminOdoo';
import AdminTeam from '@/components/AdminTeam';

/**
 * Admin console: staff accounts and file assignments.
 *  - Users: create account managers, deactivate/reactivate, reset passwords.
 *  - Files: every application in the system, with which managers may work on it.
 *  - IRCC checklists: what IRCC currently requires, and what it changed.
 */
export default function AdminClient() {
  const [tab, setTab] = useState('files');
  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [managers, setManagers] = useState([]);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('');
  const [showUnused, setShowUnused] = useState(false);
  const [keep, setKeep] = useState(() => new Set()); // unused files the admin unticked
  const [cleaning, setCleaning] = useState(false);

  async function load() {
    const [u, a] = await Promise.all([fetch('/api/admin/users'), fetch('/api/admin/applications')]);
    const ud = await u.json();
    const ad = await a.json();
    if (u.ok) setUsers(ud.users);
    if (a.ok) {
      setApps(ad.applications);
      setManagers(ad.managers);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function toggleAssign(app, managerId) {
    const cur = app.assignedTo.map((m) => m.id);
    const next = cur.includes(managerId) ? cur.filter((x) => x !== managerId) : [...cur, managerId];
    const res = await fetch(`/api/admin/applications/${app.id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedTo: next }) });
    if (!res.ok) {
      const d = await res.json();
      setMsg({ type: 'err', text: d.error });
    }
    load();
  }

  async function deleteUnused() {
    const ids = unusedApps.filter((a) => !keep.has(a.id)).map((a) => a.id);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} unused file${ids.length === 1 ? '' : 's'} from the platform?\n\nClient folders on Google Drive and cards in Odoo are not touched.`)) return;
    setCleaning(true);
    setMsg(null);
    const res = await fetch('/api/admin/applications/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
    const d = await res.json();
    setCleaning(false);
    if (!res.ok) return setMsg({ type: 'err', text: d.error });
    setMsg({ type: 'ok', text: `Deleted ${d.deleted} unused file${d.deleted === 1 ? '' : 's'}.${d.kept.length ? ` Kept ${d.kept.length} that now have content.` : ''}` });
    setKeep(new Set());
    setShowUnused(false);
    load();
  }
  const toggleKeep = (id) => setKeep((k) => {
    const n = new Set(k);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const unusedApps = apps.filter((a) => a.unused);
  const toDelete = unusedApps.filter((a) => !keep.has(a.id)).length;
  const shownApps = (showUnused ? unusedApps : apps).filter((a) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [a.title, a.clientNumber, a.typeTitle, a.owner?.name, ...a.assignedTo.map((m) => m.name)].join(' ').toLowerCase().includes(q);
  });

  const TABS = [
    ['files', 'Files', apps.length],
    ['users', 'Team & access', users.filter((u) => u.level !== 'applicant').length],
    ['ircc', 'IRCC checklists'],
    ['mail', 'Email intake'],
    ['odoo', 'Odoo'],
    ['storage', 'Storage'],
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted">Who works on which file, team accounts, IRCC checklist tracking and the email inbox.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {l}{n != null ? <span className="count" style={{ marginLeft: 6 }}>{n}</span> : null}
          </button>
        ))}
      </div>
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`}>{msg.text}</div>}

      {tab === 'ircc' && <AdminIrcc />}
      {tab === 'mail' && <AdminMail />}
      {tab === 'odoo' && <AdminOdoo />}
      {tab === 'storage' && <AdminStorage />}

      {tab === 'users' && <AdminTeam onChanged={load} />}

      {tab === 'files' && (
        <section className="card card-flush" aria-label="All files">
          <div className="filters">
            <div className="input-icon">
              <Search size={15} aria-hidden="true" />
              <input type="search" placeholder="Search by client, number, type or manager" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search files" />
            </div>
            {(unusedApps.length > 0 || showUnused) && (
              <button type="button" className={showUnused ? 'btn-navy btn-sm' : 'btn-secondary btn-sm'} aria-pressed={showUnused} onClick={() => setShowUnused(!showUnused)}>
                <Trash2 size={14} aria-hidden="true" /> Unused ({unusedApps.length})
              </button>
            )}
            {!showUnused && <span className="small muted">Tick which account managers can open each file. Admins and super admins open every file.</span>}
          </div>
          {showUnused && (
            <div className="cleanup">
              <p className="small">
                Files with <strong>nothing in them</strong> (no documents, intake answers, letter or final files) that are archived, templates, or have no client number and no Odoo card.
                Deleting removes them from the platform only: client folders on Google Drive and cards in Odoo are not touched. Untick any you want to keep.
              </p>
              <button type="button" onClick={deleteUnused} disabled={!toDelete || cleaning}>
                {cleaning ? <span className="spinner" /> : <Trash2 size={16} aria-hidden="true" />} Delete {toDelete} file{toDelete === 1 ? '' : 's'}
              </button>
            </div>
          )}
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                {showUnused ? (
                  <tr><th style={{ width: 36 }}><span className="sr-only">Delete</span></th><th>File</th><th>Why</th><th className="hide-sm">Last change</th></tr>
                ) : (
                  <tr><th>File</th><th className="hide-sm">Last change</th><th>Account managers</th></tr>
                )}
              </thead>
              <tbody>
                {showUnused && shownApps.map((a) => (
                  <tr key={a.id} style={keep.has(a.id) ? { opacity: 0.55 } : undefined}>
                    <td>
                      <input type="checkbox" checked={!keep.has(a.id)} onChange={() => toggleKeep(a.id)} aria-label={`Delete ${a.title}`} style={{ width: 16, height: 16 }} />
                    </td>
                    <td>
                      <span className="file-cell">
                        <span className="t">{a.clientNumber && <span className="mono faint" style={{ marginRight: 8 }}>{a.clientNumber}</span>}{a.title}</span>
                        <span className="s">{a.typeTitle}{a.applicantRole !== 'main' ? ` (${a.applicantRole})` : ''}</span>
                      </span>
                    </td>
                    <td className="small muted">{a.unused}</td>
                    <td className="hide-sm small muted"><span suppressHydrationWarning>{fmtTime(a.updatedAt)}</span></td>
                  </tr>
                ))}
                {!showUnused && shownApps.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link href={`/application/${a.id}`} className="file-cell" style={{ color: 'inherit' }}>
                        <span className="t">{a.clientNumber && <span className="mono faint" style={{ marginRight: 8 }}>{a.clientNumber}</span>}{a.title}{a.archived && <span className="chip" style={{ marginLeft: 8 }}>Archived</span>}</span>
                        <span className="s">{a.typeTitle}{a.applicantRole !== 'main' ? ` (${a.applicantRole})` : ''} · owner {a.owner?.name}</span>
                      </Link>
                    </td>
                    <td className="hide-sm small muted">
                      <span suppressHydrationWarning>{fmtTime(a.updatedAt)}</span>
                      {a.lastEditedBy ? <div className="faint">by {a.lastEditedBy}</div> : null}
                    </td>
                    <td>
                      <div className="cluster" style={{ gap: 6 }}>
                        {managers.map((m) => {
                          const on = a.assignedTo.some((x) => x.id === m.id);
                          return (
                            <label key={m.id} className={`chip ${on ? 'ok' : 'outline'}`} style={{ cursor: 'pointer', fontWeight: 500 }}>
                              <input type="checkbox" checked={on} onChange={() => toggleAssign(a, m.id)} style={{ width: 13, height: 13 }} />
                              {m.name || m.email}
                            </label>
                          );
                        })}
                        {!managers.length && <span className="muted small">No account managers yet — add one under Team &amp; access.</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!shownApps.length && <div className="empty small">{showUnused ? 'No unused files.' : 'No files match.'}</div>}
        </section>
      )}
    </>
  );
}
