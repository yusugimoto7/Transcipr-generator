'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { STAGE_LABELS } from '@/lib/appTypes';

/**
 * Admin console: staff accounts and file assignments.
 *  - Users: create account managers, deactivate/reactivate, reset passwords.
 *  - Files: every application in the system, with which managers may work on it.
 */
export default function AdminClient() {
  const [tab, setTab] = useState('files');
  const [users, setUsers] = useState([]);
  const [apps, setApps] = useState([]);
  const [managers, setManagers] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'manager' });
  const [filter, setFilter] = useState('');

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

  async function createUser(e) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await res.json();
    if (!res.ok) return setMsg({ type: 'err', text: d.error });
    setMsg({ type: 'ok', text: `Created ${d.user.email} (${d.user.role}). Share the password with them privately.` });
    setForm({ email: '', name: '', password: '', role: 'manager' });
    load();
  }

  async function patchUser(id, patch) {
    setMsg(null);
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
    const d = await res.json();
    if (!res.ok) return setMsg({ type: 'err', text: d.error });
    load();
  }

  async function resetPassword(u) {
    const password = window.prompt(`New password for ${u.email} (min 8 characters):`);
    if (!password) return;
    await patchUser(u.id, { password });
    setMsg({ type: 'ok', text: `Password updated for ${u.email}.` });
  }

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

  const shownApps = apps.filter((a) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [a.title, a.clientNumber, a.typeTitle, a.owner?.name, ...a.assignedTo.map((m) => m.name)].join(' ').toLowerCase().includes(q);
  });

  return (
    <>
      <h1>Admin</h1>
      <p className="muted">Manage account managers and decide who can work on each file.</p>
      <div className="steps" style={{ marginBottom: 16 }}>
        <div className={`step-pill ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')} role="button">Files ({apps.length})</div>
        <div className={`step-pill ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')} role="button">Users ({users.length})</div>
      </div>
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ marginBottom: 14 }}>{msg.text}</div>}

      {tab === 'users' && (
        <>
          <div className="card">
            <h2>Create an account manager</h2>
            <form onSubmit={createUser} className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label>Email</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="field"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="field"><label>Temporary password</label><input type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="field"><label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="manager">Account manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div><button type="submit">Create account</button></div>
            </form>
          </div>
          <div className="card">
            <h2>All users</h2>
            {users.map((u) => (
              <div className="row" key={u.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{u.name || u.email} <span className={`chip ${u.role === 'admin' ? 'ok' : u.role === 'manager' ? 'warn' : ''}`}>{u.role}</span> {u.active === false && <span className="chip danger">deactivated</span>}</div>
                  <div className="muted small">{u.email} · joined {new Date(u.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="btn-row" style={{ gap: 6 }}>
                  <select value={u.role} onChange={(e) => patchUser(u.id, { role: e.target.value })}>
                    <option value="applicant">applicant</option>
                    <option value="manager">manager</option>
                    <option value="admin">admin</option>
                  </select>
                  <button className="btn-secondary" onClick={() => resetPassword(u)}>Reset password</button>
                  <button className="btn-secondary" onClick={() => patchUser(u.id, { active: u.active === false })}>
                    {u.active === false ? 'Reactivate' : 'Deactivate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'files' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <h2 style={{ marginBottom: 0 }}>All files</h2>
            <input placeholder="Filter by client, number, type, manager…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 320 }} />
          </div>
          <p className="muted small">Tick the managers allowed to work on each file. Admins can open everything.</p>
          {shownApps.map((a) => (
            <div className="row" key={a.id} style={{ alignItems: 'flex-start' }}>
              <div style={{ maxWidth: '55%' }}>
                <Link href={`/application/${a.id}`} style={{ fontWeight: 600 }}>
                  {a.clientNumber ? `${a.clientNumber} · ` : ''}{a.title}
                </Link>
                <div className="muted small">
                  {a.typeTitle}{a.applicantRole !== 'main' ? ` (${a.applicantRole})` : ''} · {STAGE_LABELS[a.stage] || a.stage} · owner {a.owner?.name}
                  {a.lastEditedBy ? ` · last edited by ${a.lastEditedBy}` : ''} · {new Date(a.updatedAt).toLocaleString()}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {managers.map((m) => {
                  const on = a.assignedTo.some((x) => x.id === m.id);
                  return (
                    <label key={m.id} className={`chip ${on ? 'ok' : ''}`} style={{ cursor: 'pointer', fontWeight: 400 }}>
                      <input type="checkbox" checked={on} onChange={() => toggleAssign(a, m.id)} style={{ width: 14, marginRight: 4 }} />
                      {m.name || m.email}
                    </label>
                  );
                })}
                {!managers.length && <span className="muted small">No managers yet — create one on the Users tab.</span>}
              </div>
            </div>
          ))}
          {!shownApps.length && <p className="muted small">No files match.</p>}
        </div>
      )}
    </>
  );
}
