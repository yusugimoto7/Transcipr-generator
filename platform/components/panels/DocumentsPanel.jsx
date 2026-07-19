'use client';

import { useState, useRef } from 'react';

const CATEGORIES = [
  { key: '', label: 'Uncategorized' },
  { key: 'passport', label: 'Passport' },
  { key: 'loa', label: 'Letter of Acceptance' },
  { key: 'pal', label: 'Provincial Attestation Letter' },
  { key: 'proof-of-funds', label: 'Proof of funds / bank statement' },
  { key: 'gic', label: 'GIC certificate' },
  { key: 'transcripts', label: 'Transcripts / diploma' },
  { key: 'language', label: 'Language test result' },
  { key: 'photo', label: 'Photo' },
  { key: 'tuition-receipt', label: 'Tuition receipt' },
  { key: 'other', label: 'Other' },
];

export default function DocumentsPanel({ app, patchLocal, onExtracted, goIntake }) {
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const fileRef = useRef(null);
  const docs = app.documents || [];

  async function upload(e) {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files || !files.length) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    if (category) fd.append('category', category);
    try {
      const res = await fetch(`/api/applications/${app.id}/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      patchLocal({ documents: data.documents });
      fileRef.current.value = '';
      setMsg({ type: 'ok', text: `Uploaded ${data.added.length} file(s).` });
    } catch (e2) {
      setMsg({ type: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(docId) {
    const res = await fetch(`/api/applications/${app.id}/upload?docId=${docId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) patchLocal({ documents: data.documents });
  }

  async function extract() {
    setExtracting(true);
    setMsg(null);
    setSuggestions(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apply: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed.');
      const entries = Object.entries(data.fields || {});
      if (!entries.length) {
        setMsg({ type: 'info', text: 'No new details could be read from the documents.' });
      } else {
        setSuggestions({ fields: data.fields, confidence: data.confidence || {}, notes: data.notes || [] });
      }
    } catch (e2) {
      setMsg({ type: 'err', text: e2.message });
    } finally {
      setExtracting(false);
    }
  }

  function applyAll() {
    if (!suggestions) return;
    for (const [k, v] of Object.entries(suggestions.fields)) onExtracted(k, v);
    setSuggestions(null);
    setMsg({ type: 'ok', text: 'Applied to your intake. Review the Intake tab to confirm.' });
  }

  return (
    <>
      <div className="card">
        <h2>Upload your documents</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Upload PDFs or photos (passport, letter of acceptance, bank statements, transcripts,
          language results). Then let AI read them and pre-fill your intake.
        </p>

        <form onSubmit={upload} style={{ marginTop: 12 }}>
          <div className="grid2">
            <div className="field">
              <label>Document type</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>File(s)</label>
              <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp" />
            </div>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : 'Upload'}
          </button>
        </form>

        {msg && <div className={`alert ${msg.type === 'err' ? 'err' : msg.type === 'ok' ? 'ok' : 'info'}`} style={{ marginTop: 14 }}>{msg.text}</div>}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginBottom: 0 }}>Your files ({docs.length})</h2>
          <button className="btn-secondary" onClick={extract} disabled={extracting || !docs.length}>
            {extracting ? <span className="spinner" /> : '✨ Read with AI & pre-fill'}
          </button>
        </div>

        {docs.length === 0 ? (
          <p className="muted small" style={{ marginTop: 12 }}>No files yet.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {docs.map((d) => (
              <div className="row" key={d.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{d.filename}</div>
                  <div className="muted small">
                    {(d.category && CATEGORIES.find((c) => c.key === d.category)?.label) || 'Uncategorized'} ·{' '}
                    {(d.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <button className="btn-ghost" onClick={() => removeDoc(d.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {suggestions && (
          <div className="hint-box" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>AI found {Object.keys(suggestions.fields).length} value(s)</strong>
              <div className="btn-row">
                <button className="btn-secondary" onClick={() => setSuggestions(null)}>Dismiss</button>
                <button onClick={applyAll}>Apply all to intake</button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {Object.entries(suggestions.fields).map(([k, v]) => (
                <div key={k} className="small" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span className="muted">{k}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>
                    {String(v)}{' '}
                    {suggestions.confidence[k] && (
                      <span className={`chip ${suggestions.confidence[k] === 'high' ? 'ok' : suggestions.confidence[k] === 'low' ? 'danger' : 'warn'}`}>
                        {suggestions.confidence[k]}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {suggestions.notes?.length > 0 && (
              <ul className="muted small" style={{ marginTop: 10, paddingLeft: 18 }}>
                {suggestions.notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            <p className="muted small" style={{ marginTop: 10 }}>
              Applying fills your intake fields. Always verify against your original documents.
            </p>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="btn-ghost" onClick={goIntake}>Continue to Intake →</button>
        </div>
      </div>
    </>
  );
}
