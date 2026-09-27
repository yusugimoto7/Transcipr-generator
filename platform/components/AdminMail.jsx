'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const CHECK = { green: '#1a7f4b', yellow: '#8a6d00', orange: '#b35c00', red: '#c02626' };
const STATUS = {
  processed: { label: 'Filed', cls: 'ok' },
  processing: { label: 'Reading…', cls: 'warn' },
  unassigned: { label: 'Needs a file', cls: 'danger' },
  'no-attachments': { label: 'No documents', cls: '' },
  failed: { label: 'Failed', cls: 'danger' },
  ignored: { label: 'Ignored', cls: '' },
};

/**
 * Admin → Email intake: what came into the team mailbox, where it was filed,
 * and the messages waiting for a file.
 */
export default function AdminMail() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState({}); // messageId -> { appId, remember }
  const timer = useRef(null);

  const load = async () => {
    clearTimeout(timer.current);
    try {
      const res = await fetch('/api/admin/mail');
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Could not load.');
      setData(d);
      setErr('');
      if (d.messages.some((m) => m.status === 'processing')) timer.current = setTimeout(load, 4000);
    } catch (e) {
      setErr(e.message);
    }
  };
  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, []);

  async function act(body, key) {
    setBusy(key);
    setErr('');
    try {
      const res = await fetch('/api/admin/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Failed.');
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const s = data?.status;
  const msgs = data?.messages || [];
  const apps = data?.apps || [];
  const appOf = (id) => apps.find((a) => a.id === id);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Email intake</h2>
        <button onClick={() => act({ action: 'check' }, 'check')} disabled={busy === 'check' || !s?.configured}>
          {busy === 'check' ? <><span className="spinner" /> Checking…</> : 'Check the mailbox now'}
        </button>
      </div>
      {s && (
        <p className="muted small">
          {s.configured ? (
            <>
              <strong>{s.user}</strong> on {s.host} ({s.folder}), checked every {s.pollMinutes} min · last check {when(s.lastCheckAt)}
              {s.lastError ? <span style={{ color: 'var(--danger)' }}> · last error: {s.lastError}</span> : null}
              {!s.clientsFolder ? <span style={{ color: 'var(--warn)' }}> · DRIVE_CLIENTS_FOLDER is not set: documents are filed on the platform but not on Drive.</span> : null}
            </>
          ) : (
            <>Not connected. Set <code>MAIL_USER</code> and <code>MAIL_PASSWORD</code> (and <code>DRIVE_CLIENTS_FOLDER</code>) on the server — see the README.</>
          )}
        </p>
      )}
      <p className="muted small" style={{ marginTop: 0 }}>
        Every message with documents is matched to a file by the client number in the subject, the sender&apos;s address on
        the file, or the intake email. Its documents are saved on the file, read and checked, named the team&apos;s way and
        copied to the client&apos;s Drive folder under &ldquo;01 - Documents&rdquo;. Messages that match no file wait here.
      </p>
      {err && <div className="alert err">{err}</div>}
      {!msgs.length && <p className="muted">Nothing received yet.</p>}

      {msgs.map((m) => {
        const st = STATUS[m.status] || { label: m.status, cls: '' };
        const app = appOf(m.appId);
        const p = pick[m.id] || { appId: m.candidates?.[0] || '', remember: true };
        return (
          <div className="row" key={m.id} style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {m.subject || '(no subject)'} <span className={`chip ${st.cls}`} style={{ marginLeft: 6 }}>{st.label}</span>
              </div>
              <div className="muted small">
                {m.from?.name ? `${m.from.name} <${m.from.address}>` : m.from?.address} · {when(m.date)} ·{' '}
                {m.attachments?.length || 0} attachment(s){m.how ? ` · matched by ${m.how}` : ''}
              </div>
              {app && (
                <div className="small">
                  Filed on <Link href={`/application/${app.id}`}>{app.clientNumber ? `${app.clientNumber} — ` : ''}{app.title}</Link>
                  {m.drive?.folderCreated ? ' · Drive folder created' : ''}
                  {m.drive?.error ? <span style={{ color: 'var(--danger)' }}> · Drive: {m.drive.error}</span> : ''}
                </div>
              )}
              {m.files?.length > 0 && (
                <ul className="small" style={{ paddingLeft: 18, margin: '4px 0 0' }}>
                  {m.files.map((f) => (
                    <li key={f.docId}>
                      {f.filename}
                      {f.check ? <span style={{ color: CHECK[f.check], fontWeight: 700 }}> ● {f.check}</span> : null}
                      {f.driveId ? <span className="muted"> · on Drive</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              {m.skipped?.length > 0 && <div className="small muted">Left out: {m.skipped.map((x) => `${x.name} (${x.reason})`).join('; ')}</div>}
              {m.error && <div className="small" style={{ color: 'var(--danger)' }}>{m.error}</div>}
              {m.status === 'unassigned' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                  <select value={p.appId} onChange={(e) => setPick({ ...pick, [m.id]: { ...p, appId: e.target.value } })} style={{ maxWidth: 360, padding: '6px 8px' }}>
                    <option value="">— choose the client&apos;s file —</option>
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.clientNumber ? `${a.clientNumber} — ` : ''}{a.title}
                      </option>
                    ))}
                  </select>
                  <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400, margin: 0 }}>
                    <input type="checkbox" style={{ width: 14 }} checked={p.remember} onChange={(e) => setPick({ ...pick, [m.id]: { ...p, remember: e.target.checked } })} />
                    remember this sender for the file
                  </label>
                  <button onClick={() => act({ action: 'assign', id: m.id, appId: p.appId, remember: p.remember }, m.id)} disabled={!p.appId || busy === m.id}>
                    {busy === m.id ? <span className="spinner" /> : 'File it'}
                  </button>
                  <button className="btn-ghost" onClick={() => act({ action: 'ignore', id: m.id }, `i${m.id}`)} disabled={busy === `i${m.id}`}>Ignore</button>
                  {m.candidates?.length > 1 && <span className="small muted">Several files use this sender — pick one.</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
