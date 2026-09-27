'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HardDrive, CloudUpload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { fmtTime } from '@/lib/format';

const mb = (b) => `${Math.round((b || 0) / 1048576)} MB`;

/**
 * Admin → Storage. Google Drive holds every file; the server keeps only a
 * cache of recently used ones (lib/driveStore.js).
 */
export default function AdminStorage() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load(method = 'GET') {
    setErr('');
    try {
      const res = await fetch('/api/admin/storage', { method });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Could not load.');
      setS(d);
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function syncNow() {
    setBusy(true);
    await load('POST');
    setBusy(false);
  }

  const pct = s ? Math.min(100, Math.round((s.usedBytes / s.capBytes) * 100)) : 0;
  const pending = s ? s.pendingDocs + s.pendingGen : 0;

  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Where files are kept</h2>
            <p className="muted small">
              Every document and every file the platform builds is saved in the client&apos;s Google Drive folder
              (01 - Documents, 02 - Final Files, 03 - Working Files). The server keeps only a cache of recently used
              files and fetches anything else from Drive when it is opened.
            </p>
          </div>
          <button type="button" onClick={syncNow} disabled={busy || !s?.drive}>
            {busy ? <span className="spinner" /> : <CloudUpload size={16} aria-hidden="true" />} Save everything to Drive now
          </button>
        </div>
        {err && <div className="alert err">{err}</div>}
        {!s && !err && <p className="muted small"><span className="spinner dark" /> Loading…</p>}
        {s && (
          <dl className="kv">
            <dt>Google Drive</dt>
            <dd>{s.drive ? <span className="chip ok"><CheckCircle2 size={13} aria-hidden="true" /> Connected</span> : <span className="chip danger">Not connected — set GOOGLE_SERVICE_ACCOUNT_JSON</span>}</dd>
            <dt>Client folders</dt>
            <dd>{s.clientsFolder ? <span className="chip ok">DRIVE_CLIENTS_FOLDER set</span> : <span className="chip warn">DRIVE_CLIENTS_FOLDER not set — new clients’ folders can’t be created</span>}</dd>
            <dt>Waiting for Drive</dt>
            <dd>{pending ? `${s.pendingDocs} document(s), ${s.pendingGen} built file(s)` : <span className="chip ok">Nothing — all saved</span>}</dd>
            <dt>Server cache</dt>
            <dd>
              <div className="cluster" style={{ gap: 10 }}>
                <HardDrive size={15} aria-hidden="true" />
                <span>{mb(s.usedBytes)} of {mb(s.capBytes)}</span>
              </div>
              <div className="meter" style={{ marginTop: 6, maxWidth: 320 }}><i style={{ width: `${pct}%`, background: pct > 90 ? 'var(--danger)' : undefined }} /></div>
              <div className="tiny faint" style={{ marginTop: 4 }}>Old files that are safely on Drive are removed from the cache automatically (CACHE_MAX_MB).</div>
            </dd>
          </dl>
        )}
      </section>

      {s?.errors?.length > 0 && (
        <section className="card" aria-labelledby="st-err">
          <h2 id="st-err" className="cluster" style={{ gap: 8 }}><AlertTriangle size={18} color="var(--warn)" aria-hidden="true" /> Files that could not be saved to Drive</h2>
          <div className="list">
            {s.errors.map((e) => (
              <div className="list-row" key={e.id}>
                <div className="grow">
                  <Link href={`/application/${e.id}`} className="strong">{e.clientNumber ? `${e.clientNumber} · ` : ''}{e.title}</Link>
                  <div className="small muted">{e.error}</div>
                </div>
                <span className="small faint nowrap" suppressHydrationWarning>{fmtTime(e.at)}</span>
              </div>
            ))}
          </div>
          <p className="small muted" style={{ margin: '10px 0 0' }}>These files stay on the server until the problem is fixed; they are never removed from the cache before they reach Drive.</p>
        </section>
      )}
    </div>
  );
}
