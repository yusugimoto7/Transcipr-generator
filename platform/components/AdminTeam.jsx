'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Shield, UserCog, KeyRound, X, Archive } from 'lucide-react';
import { initials } from '@/components/TopBar';
import { fmtDay } from '@/lib/format';

const LEVEL = { superadmin: 'Super admin', admin: 'Admin', manager: 'Account manager', applicant: 'Client' };
const ALL_FILES = new Set(['superadmin', 'admin']);

/**
 * Admin → Team & access. Three layers: super admins (everything, including
 * who is an admin), admins (every file; manage account managers) and account
 * managers (only the files given to them). Pick an account manager to choose,
 * client by client, which files they can open and edit.
 */
export default function AdminTeam({ onChanged }) {
  const [users, setUsers] = useState([]);
  const [me, setMe] = useState(null);
  const [apps, setApps] = useState([]);
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'manager' });
  const [resetFor, setResetFor] = useState(null);
  const [managing, setManaging] = useState(null); // user id

  async function load() {
    const [u, a] = await Promise.all([fetch('/api/admin/users').then((r) => r.json()), fetch('/api/admin/applications').then((r) => r.json())]);
    setUsers(u.users || []);
    setMe(u.me || null);
    setApps(a.applications || []);
  }
  useEffect(() => { load(); }, []);

  const say = (type, text) => setMsg({ type, text });
  async function patchUser(id, patch, ok) {
    setMsg(null);
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) });
    const d = await res.json();
    if (!res.ok) return say('err', d.error);
    if (ok) say('ok', ok);
    await load();
    onChanged?.();
  }
  async function createUser(e) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    const d = await res.json();
    if (!res.ok) return say('err', d.error);
    say('ok', `Created ${d.user.email} (${LEVEL[d.user.level]}). Share the password with them privately.`);
    setForm({ email: '', name: '', password: '', role: 'manager' });
    await load();
    onChanged?.();
  }

  const superMe = me?.level === 'superadmin';
  const grantable = superMe ? ['manager', 'admin', 'superadmin'] : ['manager'];
  const staff = users.filter((u) => u.level !== 'applicant');
  const counts = { superadmin: 0, admin: 0, manager: 0 };
  for (const u of staff) if (u.active !== false) counts[u.level] = (counts[u.level] || 0) + 1;
  const clientsOf = (uid) => new Set(apps.filter((a) => (a.assignedTo || []).some((m) => m.id === uid)).map((a) => a.caseKey)).size;
  const target = users.find((u) => u.id === managing);

  return (
    <div className="stack">
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ margin: 0 }}>{msg.text}</div>}

      <div className="levels">
        {[
          ['superadmin', ShieldCheck, 'Everything, including who is an admin. Set by ADMIN_EMAIL on the server, or by another super admin.'],
          ['admin', Shield, 'Every client file. Adds account managers and decides which files each one can open.'],
          ['manager', UserCog, 'Only the files given to them — they open and edit those, nothing else.'],
        ].map(([k, Icon, text]) => (
          <div key={k} className={`level-card l-${k}`}>
            <div className="level-top"><Icon size={16} aria-hidden="true" /> <strong>{LEVEL[k]}</strong><span className="count">{counts[k] || 0}</span></div>
            <p className="small muted">{text}</p>
          </div>
        ))}
      </div>

      <section className="card card-flush" aria-labelledby="acc-h">
        <div className="card-head" style={{ padding: '16px 18px 8px' }}>
          <h2 id="acc-h">Accounts</h2>
          {!superMe && <p className="small muted">As an admin you manage account managers. Only a super admin can change admins.</p>}
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Person</th><th>Role</th><th>File access</th><th className="hide-sm">Joined</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
            </thead>
            <tbody>
              {staff.map((u) => {
                const self = u.id === me?.id;
                const editable = u.canManage && !self;
                return (
                  <tr key={u.id} style={u.active === false ? { opacity: 0.6 } : undefined}>
                    <td>
                      <div className="cluster" style={{ flexWrap: 'nowrap' }}>
                        <span className={`avatar lv-${u.level}`} aria-hidden="true">{initials(u.name, u.email)}</span>
                        <span className="file-cell">
                          <span className="t">{u.name || u.email}{self ? <span className="faint small"> (you)</span> : null} {u.active === false && <span className="chip danger">deactivated</span>}</span>
                          <span className="s">{u.email}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      {editable && !u.fixed ? (
                        <>
                          <label htmlFor={`role-${u.id}`} className="sr-only">Role</label>
                          <select id={`role-${u.id}`} value={u.level} onChange={(e) => patchUser(u.id, { role: e.target.value }, `${u.name || u.email} is now ${LEVEL[e.target.value]}.`)} style={{ width: 'auto', padding: '6px 8px' }}>
                            {[...new Set([u.level, ...grantable])].map((l) => <option key={l} value={l}>{LEVEL[l]}</option>)}
                          </select>
                        </>
                      ) : (
                        <span className={`chip lv-${u.level}`}>{LEVEL[u.level]}</span>
                      )}
                    </td>
                    <td>
                      {ALL_FILES.has(u.level) ? (
                        <span className="small muted">All files</span>
                      ) : (
                        <button type="button" className={managing === u.id ? 'btn-navy btn-sm' : 'btn-secondary btn-sm'} onClick={() => setManaging(managing === u.id ? null : u.id)} disabled={u.active === false}>
                          <KeyRound size={14} aria-hidden="true" /> {clientsOf(u.id)} client{clientsOf(u.id) === 1 ? '' : 's'} · Manage
                        </button>
                      )}
                    </td>
                    <td className="hide-sm small muted" suppressHydrationWarning>{fmtDay(u.createdAt)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {resetFor?.id === u.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); if (resetFor.password.length >= 8) { patchUser(u.id, { password: resetFor.password }, `Password updated for ${u.email}. Share it with them privately.`); setResetFor(null); } }} className="cluster" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                          <label htmlFor={`pw-${u.id}`} className="sr-only">New password</label>
                          <input id={`pw-${u.id}`} autoFocus type="text" minLength={8} placeholder="New password (8+)" value={resetFor.password} onChange={(e) => setResetFor({ ...resetFor, password: e.target.value })} style={{ width: 170, padding: '6px 8px' }} />
                          <button type="submit" className="btn-sm" disabled={resetFor.password.length < 8}>Save</button>
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setResetFor(null)}>Cancel</button>
                        </form>
                      ) : (
                        <div className="btn-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <button type="button" className="btn-secondary btn-sm" disabled={!u.canManage} title={u.canManage ? '' : 'Only a super admin can change this account'} onClick={() => setResetFor({ id: u.id, password: '' })}>Reset password</button>
                          <button type="button" className="btn-secondary btn-sm" disabled={!editable || u.fixed} title={u.fixed ? 'The ADMIN_EMAIL account is always active' : !editable ? 'Only a super admin can change this account' : ''} onClick={() => patchUser(u.id, { active: u.active === false }, `${u.email} ${u.active === false ? 'reactivated' : 'deactivated'}.`)}>
                            {u.active === false ? 'Reactivate' : 'Deactivate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {target && <AccessPanel key={target.id} user={target} apps={apps} onClose={() => setManaging(null)} onSaved={async (text) => { say('ok', text); await load(); onChanged?.(); }} onError={(t) => say('err', t)} />}

      <section className="card" aria-labelledby="new-user-h">
        <h2 id="new-user-h">Add a team member</h2>
        <form onSubmit={createUser}>
          <div className="grid2">
            <div className="field"><label htmlFor="nu-email">Email</label><input id="nu-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@team.sugimotogroup.org" /></div>
            <div className="field"><label htmlFor="nu-name">Name</label><input id="nu-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="nu-pw">Temporary password</label><input id="nu-pw" type="text" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><div className="note">At least 8 characters. Share it privately.</div></div>
            <div className="field"><label htmlFor="nu-role">Role</label>
              <select id="nu-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {grantable.map((l) => <option key={l} value={l}>{LEVEL[l]}{l === 'manager' ? ' — only the files you give them' : l === 'admin' ? ' — every file, manages account managers' : ' — everything'}</option>)}
              </select>
            </div>
          </div>
          <button type="submit">Create account</button>
        </form>
      </section>
    </div>
  );
}

/** Which clients an account manager can open: whole families at once, searchable. */
function AccessPanel({ user, apps, onClose, onSaved, onError }) {
  const [q, setQ] = useState('');
  const [show, setShow] = useState('all'); // all | on | off
  const [busy, setBusy] = useState(false);
  const clients = useMemo(() => {
    const map = new Map();
    for (const a of apps) {
      const k = a.caseKey || a.id;
      if (!map.has(k)) map.set(k, { key: k, members: [] });
      map.get(k).members.push(a);
    }
    return [...map.values()].map((c) => {
      const main = c.members.find((m) => m.applicantRole === 'main') || c.members[0];
      const on = c.members.filter((m) => (m.assignedTo || []).some((x) => x.id === user.id)).length;
      return { ...c, main, on, state: on === 0 ? 'off' : on === c.members.length ? 'on' : 'some', archived: c.members.every((m) => m.archived) };
    }).sort((a, b) => (b.on > 0) - (a.on > 0) || String(a.main.clientNumber || a.main.title).localeCompare(String(b.main.clientNumber || b.main.title)));
  }, [apps, user.id]);

  const shown = clients.filter((c) => {
    if (show === 'on' && c.state === 'off') return false;
    if (show === 'off' && c.state !== 'off') return false;
    const s = q.trim().toLowerCase();
    return !s || c.members.some((m) => [m.clientNumber, m.title, m.typeTitle].join(' ').toLowerCase().includes(s));
  });
  const total = clients.filter((c) => c.state !== 'off').length;

  async function save(add, remove, text) {
    setBusy(true);
    const res = await fetch('/api/admin/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: user.id, add, remove }) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return onError(d.error);
    onSaved(text(d));
  }
  const toggle = (c) => {
    const ids = c.members.map((m) => m.id);
    return c.state === 'on'
      ? save([], ids, () => `${user.name || user.email} can no longer open ${c.main.clientNumber || c.main.title}.`)
      : save(ids, [], () => `${user.name || user.email} can now open ${c.main.clientNumber || c.main.title}${c.members.length > 1 ? ` (${c.members.length} files)` : ''}.`);
  };
  const bulk = (give) => {
    const ids = shown.flatMap((c) => c.members.map((m) => m.id));
    if (!ids.length) return;
    if (!window.confirm(`${give ? 'Give' : 'Remove'} access to ${shown.length} client${shown.length === 1 ? '' : 's'} ${give ? 'for' : 'from'} ${user.name || user.email}?`)) return;
    return give ? save(ids, [], (d) => `Gave ${d.added} file(s) to ${user.name || user.email}.`) : save([], ids, (d) => `Removed ${d.removed} file(s) from ${user.name || user.email}.`);
  };

  return (
    <section className="card access-panel" aria-labelledby="access-h">
      <div className="card-head">
        <div>
          <h2 id="access-h">Files {user.name || user.email} can open</h2>
          <p className="small muted">{total} of {clients.length} clients. Access covers the whole family (main applicant and members). They are notified of new files.</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="filters" style={{ padding: 0, marginBottom: 10 }}>
        <div className="input-icon">
          <Search size={15} aria-hidden="true" />
          <input type="search" placeholder="Search by number, name or type" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clients" />
        </div>
        <div className="seg" role="group" aria-label="Show">
          {[['all', 'All'], ['on', 'Has access'], ['off', 'No access']].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="cluster" style={{ marginBottom: 10 }}>
        <button type="button" className="btn-secondary btn-sm" disabled={busy || !shown.length} onClick={() => bulk(true)}>Give access to all shown ({shown.length})</button>
        <button type="button" className="btn-secondary btn-sm" disabled={busy || !shown.length} onClick={() => bulk(false)}>Remove all shown</button>
        {busy && <span className="spinner" />}
      </div>
      <ul className="access-list">
        {shown.map((c) => (
          <li key={c.key}>
            <label className={`access-row${c.state !== 'off' ? ' on' : ''}`}>
              <input
                type="checkbox"
                checked={c.state === 'on'}
                ref={(el) => { if (el) el.indeterminate = c.state === 'some'; }}
                onChange={() => toggle(c)}
                disabled={busy}
              />
              <span className="file-cell" style={{ minWidth: 0 }}>
                <span className="t">{c.main.clientNumber ? <span className="mono faint" style={{ marginRight: 6 }}>{c.main.clientNumber}</span> : null}{c.main.title}{c.archived && <span className="chip" style={{ marginLeft: 6 }}><Archive size={11} aria-hidden="true" /> archived</span>}</span>
                <span className="s">{c.main.typeTitle}{c.members.length > 1 ? ` · ${c.members.length} people: ${c.members.filter((m) => m !== c.main).map((m) => `${m.title.split(' ')[0]} (${m.applicantRole})`).join(', ')}` : ''}{c.state === 'some' ? ` · ${c.on} of ${c.members.length} files` : ''}</span>
              </span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="small muted" style={{ padding: 12 }}>No clients match.</li>}
      </ul>
    </section>
  );
}
