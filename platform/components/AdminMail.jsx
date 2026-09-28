'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const CHECK = { green: '#1a7f4b', yellow: '#8a6d00', orange: '#b35c00', red: '#c02626' };
const STATUS = {
  processed: { label: 'Filed', cls: 'ok' },
  processing: { label: 'Reading…', cls: 'warn' },
  unassigned: { label: 'Needs a file', cls: 'danger' },
  'no-attachments': { label: 'No documents · no file', cls: '' },
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
  const [sel, setSel] = useState(() => new Set()); // waiting messages ticked for a bulk action
  const [bulk, setBulk] = useState({ appId: '', remember: true, progress: null });
  const timer = useRef(null);

  const load = async () => {
    clearTimeout(timer.current);
    try {
      const res = await fetch('/api/admin/mail');
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Could not load.');
      setData(d);
      setErr('');
      if (d.messages.some((m) => m.status === 'processing') || d.backfill?.running) timer.current = setTimeout(load, 4000);
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
  const isWaiting = (m) => m.status === 'unassigned' || (m.status === 'no-attachments' && !m.appId);
  const waiting = msgs.filter(isWaiting);
  const chosen = waiting.filter((m) => sel.has(m.id));
  const allOn = waiting.length > 0 && chosen.length === waiting.length;
  const toggle = (id) => setSel((x) => {
    const n = new Set(x);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  async function ignoreChosen() {
    if (!chosen.length || !window.confirm(`Ignore ${chosen.length} email${chosen.length === 1 ? '' : 's'}? You can put them back later.`)) return;
    await act({ action: 'ignore', ids: chosen.map((m) => m.id) }, 'bulk');
    setSel(new Set());
  }

  // One by one, so each email's documents are read and filed like a single "File it".
  async function fileChosen() {
    const list = chosen;
    if (!list.length || !bulk.appId) return;
    const target = appOf(bulk.appId);
    if (!window.confirm(`File ${list.length} email${list.length === 1 ? '' : 's'} on ${target?.clientNumber ? `${target.clientNumber} — ` : ''}${target?.title || 'this file'}?`)) return;
    setBusy('bulk');
    setErr('');
    let done = 0;
    for (const m of list) {
      setBulk((b) => ({ ...b, progress: `Filing ${done + 1} of ${list.length}…` }));
      try {
        const res = await fetch('/api/admin/mail', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assign', id: m.id, appId: bulk.appId, remember: bulk.remember }) });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed.');
        done++;
      } catch (e) {
        setErr(`${m.subject || '(no subject)'}: ${e.message}`);
      }
    }
    setBulk((b) => ({ ...b, progress: null }));
    setSel(new Set());
    setBusy('');
    await load();
  }

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
        A message is matched to a client&apos;s file by the <strong>client number</strong> (e.g. S26281) in the subject or text,
        or by the <strong>sender&apos;s address</strong>: the email on the client&apos;s Odoo card, an address remembered for the file,
        or the intake email. Its text is kept on the file and read for facts useful to the application; its documents are
        saved, read and checked, named the team&apos;s way and copied to the client&apos;s Drive folder under &ldquo;01 - Documents&rdquo;.
        Messages that match no file wait here.
      </p>
      {s?.configured && (
        <div className="cluster small" style={{ marginBottom: 12 }}>
          <button type="button" className="btn-secondary btn-sm" onClick={() => act({ action: 'backfill' }, 'backfill')} disabled={busy === 'backfill' || data?.backfill?.running}>
            {data?.backfill?.running ? <><span className="spinner" /> Saving earlier emails… {data.backfill.done}/{data.backfill.total}</> : 'Save the text of earlier emails'}
          </button>
          {!data?.backfill?.running && data?.backfill?.finishedAt && (
            <span className="muted">
              {data.backfill.saved} saved on their files, {data.backfill.filed} newly matched{data.backfill.error ? ` · stopped: ${data.backfill.error}` : ''}
            </span>
          )}
        </div>
      )}
      {err && <div className="alert err">{err}</div>}
      {!msgs.length && <p className="muted">Nothing received yet.</p>}

      {waiting.length > 0 && (
        <div className={`mail-bulk${chosen.length ? ' on' : ''}`}>
          <label className="check-label" style={{ margin: 0 }}>
            <input
              type="checkbox"
              checked={allOn}
              ref={(el) => { if (el) el.indeterminate = chosen.length > 0 && !allOn; }}
              onChange={() => setSel(allOn ? new Set() : new Set(waiting.map((m) => m.id)))}
            />
            {chosen.length ? `${chosen.length} of ${waiting.length} selected` : `Select all (${waiting.length} waiting)`}
          </label>
          {chosen.length > 0 && (
            <>
              <select value={bulk.appId} onChange={(e) => setBulk({ ...bulk, appId: e.target.value })} style={{ maxWidth: 320, padding: '6px 8px' }} aria-label="File the selected emails on">
                <option value="">— file them on… —</option>
                {apps.map((a) => (
                  <option key={a.id} value={a.id}>{a.clientNumber ? `${a.clientNumber} — ` : ''}{a.title}</option>
                ))}
              </select>
              <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400, margin: 0 }}>
                <input type="checkbox" style={{ width: 14 }} checked={bulk.remember} onChange={(e) => setBulk({ ...bulk, remember: e.target.checked })} />
                remember the senders
              </label>
              <button type="button" className="btn-sm" onClick={fileChosen} disabled={!bulk.appId || busy === 'bulk'}>
                {busy === 'bulk' && bulk.progress ? <><span className="spinner" /> {bulk.progress}</> : `File ${chosen.length}`}
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={ignoreChosen} disabled={busy === 'bulk'}>Ignore {chosen.length}</button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setSel(new Set())} disabled={busy === 'bulk'}>Clear</button>
            </>
          )}
        </div>
      )}

      {msgs.map((m) => {
        const st = STATUS[m.status] || { label: m.status, cls: '' };
        const app = appOf(m.appId);
        const p = pick[m.id] || { appId: m.candidates?.[0] || '', remember: true };
        return (
          <div className="row" key={m.id} style={{ alignItems: 'flex-start' }}>
            {waiting.length > 0 && (
              <div style={{ width: 22, flex: '0 0 22px', paddingTop: 3 }}>
                {isWaiting(m) && <input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} aria-label={`Select ${m.subject || 'this email'}`} style={{ width: 16, height: 16 }} />}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {m.subject || '(no subject)'} <span className={`chip ${st.cls}`} style={{ marginLeft: 6 }}>{st.label}</span>
              </div>
              <div className="muted small">
                {m.from?.name ? `${m.from.name} <${m.from.address}>` : m.from?.address} · {when(m.date)} ·{' '}
                {m.attachments?.length || 0} attachment(s){m.how ? ` · matched by ${m.how}` : ''}
              </div>
              {(m.body || m.snippet) && (
                m.body ? (
                  <details className="small" style={{ marginTop: 4 }}>
                    <summary>{m.snippet || 'Show the email'}</summary>
                    <div style={{ whiteSpace: 'pre-wrap', background: 'var(--surface-2, #f5f6f8)', borderRadius: 6, padding: '8px 10px', marginTop: 6, maxHeight: 280, overflow: 'auto' }}>{m.body}</div>
                  </details>
                ) : <div className="small muted" style={{ marginTop: 2 }}>{m.snippet}</div>
              )}
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
              {m.status === 'ignored' && (
                <button type="button" className="btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => act({ action: 'restore', id: m.id }, `r${m.id}`)} disabled={busy === `r${m.id}`}>Put back</button>
              )}
              {isWaiting(m) && !chosen.length && (
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
