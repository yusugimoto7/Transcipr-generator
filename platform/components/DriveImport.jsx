'use client';

import { useEffect, useRef, useState } from 'react';
import ProgressBar from '@/components/ProgressBar';

/**
 * Staff-only: import every document from a client's Google Drive folder
 * (normally the "01 - Documents" folder the client's files were saved to).
 * The import runs as a server job; this polls it and shows progress, and picks
 * a running import back up after a page reload.
 */

const mb = (n) => `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const e = new Error(`The server did not answer properly (HTTP ${res.status}) — it may be restarting. Wait a minute and press Sync again; files already imported are skipped.`);
    e.transient = true;
    throw e;
  }
}

function progressView(job) {
  if (!job || job.phase === 'listing' || !job.total) {
    return { value: null, label: `Looking through the Drive folder…${job?.found ? ` ${job.found} file(s) found so far` : ''}` };
  }
  const byBytes = job.totalBytes > 0;
  const value = byBytes ? job.bytesDone / job.totalBytes : job.done / job.total;
  const label = `Importing file ${Math.min(job.done + 1, job.total)} of ${job.total}${
    byBytes ? ` · ${mb(job.bytesDone)} of ${mb(job.totalBytes)}` : ''
  }${job.saved ? ` · ${job.saved} new or changed saved` : ''}${job.current ? ` — ${job.current}` : ''}`;
  return { value, label };
}

export default function DriveImport({ app, patchLocal, onImported }) {
  const [status, setStatus] = useState(null); // { drive: {mode,email}, source }
  const [url, setUrl] = useState(app.driveSource?.url || '');
  const [busy, setBusy] = useState(false);
  const [readAfter, setReadAfter] = useState(true);
  const [includeBackups, setIncludeBackups] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const source = app.driveSource;

  const [job, setJob] = useState(null);
  const pollTimer = useRef(null);
  const readAfterRef = useRef(readAfter);
  readAfterRef.current = readAfter;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${app.id}/drive-import`)
      .then(readJson)
      .then((d) => {
        if (cancelled) return;
        setStatus(d);
        if (d.job?.status === 'running') {
          setBusy(true);
          setJob(d.job);
          poll(0);
        }
      })
      .catch(() => setStatus(null));
    return () => {
      cancelled = true;
      clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  function finish(data) {
    patchLocal({ documents: data.documents, driveSource: data.source });
    setResult(data);
    setBusy(false);
    setJob(null);
    if (readAfterRef.current && (data.added.length || data.updated.length)) onImported?.();
  }

  function poll(errors) {
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/applications/${app.id}/drive-import`);
        const d = await readJson(res);
        if (!res.ok) throw new Error(d.error || 'Could not check the import.');
        if (!d.job) throw new Error('The import was interrupted (the server restarted). Press Sync again — files already imported are skipped.');
        setJob(d.job);
        if (d.job.status === 'running') return poll(0);
        if (d.job.status === 'failed') throw new Error(d.job.error || 'Import failed.');
        finish(d.job.result);
      } catch (e) {
        // A network blip or a restarting server: keep trying for a while.
        if ((e.transient || e instanceof TypeError) && errors < 8) return poll(errors + 1);
        setErr(e.message);
        setBusy(false);
        setJob(null);
      }
    }, 1500);
  }

  async function run(link) {
    setBusy(true);
    setErr('');
    setResult(null);
    setJob(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/drive-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link, includeBackups }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Import failed.');
      setJob(data.job);
      poll(0);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  const mode = status?.drive?.mode;

  return (
    <div className="card">
      <h2>Import from Google Drive</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Paste the link of the client&apos;s documents folder. Every PDF, photo and Word file is
        downloaded — including per-applicant subfolders and zip files — and identified by its
        document code. Backup folders (bk, old, used…) are skipped.
      </p>

      {mode === 'none' && (
        <div className="alert info">
          Google Drive isn&apos;t connected on the server yet. An admin needs to add a Google service
          account key as <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> — see the setup steps in the README.
        </div>
      )}
      {mode === 'invalid' && <div className="alert err">{status.drive.error}</div>}
      {mode === 'service-account' && (
        <p className="small" style={{ marginTop: 0 }}>
          Folders must be shared (Viewer) with <strong>{status.drive.email}</strong>. Share your
          main client folder once and every client inside it works.
        </p>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          style={{ flex: 1 }}
          disabled={busy || mode === 'none'}
        />
        <button onClick={() => run(url)} disabled={busy || !url.trim() || mode === 'none'}>
          {busy ? <span className="spinner" /> : 'Import'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 18, marginTop: 8, flexWrap: 'wrap' }}>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" style={{ width: 14 }} checked={readAfter} onChange={(e) => setReadAfter(e.target.checked)} />
          Read with AI and pre-fill the intake afterwards
        </label>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" style={{ width: 14 }} checked={includeBackups} onChange={(e) => setIncludeBackups(e.target.checked)} />
          Also import backup folders
        </label>
      </div>

      {busy && (() => {
        const p = progressView(job);
        return <ProgressBar value={p.value} label={p.label} />;
      })()}

      {source && !result && !busy && (
        <p className="muted small" style={{ marginTop: 10 }}>
          Last imported from <strong>{source.rootName}</strong> on {new Date(source.lastImportAt).toLocaleString()}.{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); run(source.url); }}>Sync again</a> — only new or changed files are downloaded.
        </p>
      )}

      {err && <div className="alert err" style={{ marginTop: 10 }}>{err}</div>}

      {result && (
        <div className="alert ok" style={{ marginTop: 10 }}>
          <strong>{result.root.name}</strong>: {result.added.length} new, {result.updated.length} updated,{' '}
          {result.unchanged} unchanged{result.skipped.length ? `, ${result.skipped.length} skipped` : ''}.
          {readAfter && (result.added.length || result.updated.length) ? ' Reading them with AI now…' : ''}
          {result.skipped.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary className="small">What was skipped and why</summary>
              <ul className="small" style={{ paddingLeft: 18, marginTop: 4 }}>
                {result.skipped.map((s, i) => <li key={i}><strong>{s.name}</strong> — {s.reason}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
