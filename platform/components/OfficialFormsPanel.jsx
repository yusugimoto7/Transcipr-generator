'use client';

import { useEffect, useState } from 'react';

export default function OfficialFormsPanel() {
  const [forms, setForms] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setErr('');
    try {
      const res = await fetch('/api/forms');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load forms.');
      setForms(data.forms);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function refresh() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/forms', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Refresh failed.');
      }
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const formList = (forms || []).filter((f) => f.role === 'form');
  const checklist = (forms || []).find((f) => f.role === 'checklist');

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ marginBottom: 0 }}>Latest official IRCC forms</h2>
        <button className="btn-secondary" onClick={refresh} disabled={busy}>
          {busy ? <span className="spinner" /> : '↻ Check for updates'}
        </button>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        Fetched live from canada.ca so you always use the current version. Download the blank
        official form, then fill and validate it in Adobe Reader.
      </p>

      {err && <div className="alert err" style={{ marginTop: 12 }}>{err}</div>}
      {!forms && !err && <p className="muted small" style={{ marginTop: 12 }}>Loading…</p>}

      {forms && (
        <div style={{ marginTop: 8 }}>
          {formList.map((f) => (
            <div className="row" key={f.key}>
              <div>
                <div style={{ fontWeight: 600 }}>{f.code} — {f.title}</div>
                <div className="muted small">
                  {f.version ? `Version ${f.version}` : 'version unknown'}
                  {f.source === 'fallback' && ' · using cached link'}
                </div>
              </div>
              <a className="btn btn-secondary" href={`/api/forms/${f.key}/download`}>↓ Download blank</a>
            </div>
          ))}

          {checklist && (
            <div className="row" style={{ borderTop: '2px solid var(--line)', marginTop: 6, paddingTop: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{checklist.code} — {checklist.title}</div>
                <div className="muted small">
                  Official document checklist{checklist.version ? ` · version ${checklist.version}` : ''}
                </div>
              </div>
              <a className="btn btn-secondary" href={`/api/forms/${checklist.key}/download`}>↓ Download checklist</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
