'use client';

import { useEffect, useState } from 'react';

/**
 * Staff-only: import every document from a client's Google Drive folder
 * (normally the "01 - Documents" folder the client's files were saved to).
 */
export default function DriveImport({ app, patchLocal, onImported }) {
  const [status, setStatus] = useState(null); // { drive: {mode,email}, source }
  const [url, setUrl] = useState(app.driveSource?.url || '');
  const [busy, setBusy] = useState(false);
  const [readAfter, setReadAfter] = useState(true);
  const [includeBackups, setIncludeBackups] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const source = app.driveSource;

  useEffect(() => {
    fetch(`/api/applications/${app.id}/drive-import`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [app.id]);

  async function run(link) {
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/drive-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: link, includeBackups }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');
      patchLocal({ documents: data.documents, driveSource: data.source });
      setResult(data);
      if (readAfter && (data.added.length || data.updated.length)) onImported?.();
    } catch (e) {
      setErr(e.message);
    } finally {
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

      {source && !result && (
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
