'use client';

import { useState, useRef } from 'react';
import { buildChecklist } from '@/lib/checklist';

const CATEGORY_LABELS = {
  passport: 'Passport',
  loa: 'Letter of Acceptance',
  pal: 'Provincial Attestation Letter',
  'proof-of-funds': 'Proof of funds',
  'source-of-funds': 'Source of funds',
  'affidavit-support': 'Affidavit of support',
  gic: 'GIC certificate',
  deposit: 'Tuition deposit / receipt',
  photo: 'Photo',
  transcripts: 'Transcripts / diploma',
  language: 'Language test result',
  sop: 'Statement of Purpose',
  'job-offer': 'Job offer / employment',
  'police-clearance': 'Police clearance',
  military: 'Military service card',
  flight: 'Flight reservation',
  accommodation: 'Accommodation',
  medical: 'Medical exam',
  'family-info': 'Family information',
  other: 'Other',
};

const ACCEPT = ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp'];

function accepted(file) {
  const name = (file.name || '').toLowerCase();
  return ACCEPT.some((ext) => name.endsWith(ext));
}

export default function DocumentsPanel({ app, patchLocal, onExtracted, goIntake }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [pending, setPending] = useState([]); // File[] chosen but not yet uploaded
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const docs = app.documents || [];

  const checklist = buildChecklist(app.data || {});
  const uploadedKeys = new Set(docs.map((d) => d.category).filter(Boolean));
  const missing = checklist.filter((c) => !uploadedKeys.has(c.key));

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const ok = incoming.filter(accepted);
    const rejected = incoming.length - ok.length;
    setPending((prev) => {
      // De-duplicate by name+size so the same file isn't queued twice.
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      for (const f of ok) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(f);
        }
      }
      return merged;
    });
    if (rejected > 0) {
      setMsg({ type: 'err', text: `${rejected} file(s) skipped — only PDF, DOCX, JPG, PNG, WEBP are allowed.` });
    } else {
      setMsg(null);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files);
  }

  function removePending(idx) {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }

  async function upload() {
    if (!pending.length) {
      setMsg({ type: 'info', text: 'Add one or more files first.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    for (const f of pending) fd.append('files', f);
    try {
      const res = await fetch(`/api/applications/${app.id}/upload`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      patchLocal({ documents: data.documents });
      setPending([]);
      if (fileRef.current) fileRef.current.value = '';
      setMsg({
        type: 'ok',
        text: `Uploaded ${data.added.length} file(s). Click "Read with AI & pre-fill" so AI can identify each document and fill your intake.`,
      });
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
      if (data.documents) patchLocal({ documents: data.documents });
      const entries = Object.entries(data.fields || {});
      if (!entries.length) {
        setMsg({ type: 'info', text: 'Documents identified. No new intake details were found.' });
        return;
      }
      // Auto-apply to fields that are still empty; keep the rest as review suggestions.
      const current = app.data || {};
      const applied = [];
      const conflicts = {};
      for (const [k, v] of entries) {
        if (v == null || v === '') continue;
        if (!String(current[k] ?? '').trim()) {
          onExtracted(k, v);
          applied.push(k);
        } else if (String(current[k]) !== String(v)) {
          conflicts[k] = v;
        }
      }
      setSuggestions(
        Object.keys(conflicts).length
          ? { fields: conflicts, confidence: data.confidence || {}, notes: data.notes || [], conflict: true }
          : null
      );
      setMsg({
        type: 'ok',
        text: `Filled ${applied.length} intake field(s) from your documents.${
          Object.keys(conflicts).length ? ` ${Object.keys(conflicts).length} differ from what you entered — review below.` : ' Check the Intake tab to confirm.'
        }`,
      });
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
        <h2>Document checklist</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          These are the documents your application needs. Upload files below — the platform
          identifies what each file is and checks it off automatically.
        </p>
        <div style={{ marginTop: 8 }}>
          {checklist.map((c) => {
            const done = uploadedKeys.has(c.key);
            return (
              <div className="row" key={c.key}>
                <div>
                  <div style={{ fontWeight: 600 }}>{done ? '✅' : '⬜'} {c.label}</div>
                  <div className="muted small">{c.hint}</div>
                </div>
                <span className={`chip ${done ? 'ok' : 'warn'}`}>{done ? 'Provided' : 'Missing'}</span>
              </div>
            );
          })}
        </div>
        <div className="hint-box" style={{ marginTop: 14 }}>
          {missing.length === 0
            ? '🎉 All checklist documents are provided.'
            : `${missing.length} document(s) still missing: ${missing.map((m) => m.label).join(', ')}.`}
        </div>
      </div>

      <div className="card">
        <h2>Upload files</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Add as many files as you like — PDF, DOCX, JPG, PNG or WEBP. No need to say what each
          file is; we detect it from the file itself.
        </p>

        <div
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <div style={{ fontSize: 30 }}>📄⬆️</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>
            Drag &amp; drop files here
          </div>
          <div className="muted small">or click to browse — you can select several at once</div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {pending.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              {pending.length} file(s) ready to upload:
            </div>
            {pending.map((f, i) => (
              <div className="row" key={`${f.name}:${f.size}`} style={{ padding: '8px 0' }}>
                <div className="small" style={{ fontWeight: 600 }}>
                  {f.name} <span className="muted">· {(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button className="btn-ghost" onClick={() => removePending(i)}>Remove</button>
              </div>
            ))}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button onClick={upload} disabled={busy}>
                {busy ? <span className="spinner" /> : `Upload ${pending.length} file(s)`}
              </button>
              <button className="btn-secondary" onClick={() => setPending([])} disabled={busy}>
                Clear
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div className={`alert ${msg.type === 'err' ? 'err' : msg.type === 'ok' ? 'ok' : 'info'}`} style={{ marginTop: 14 }}>
            {msg.text}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginBottom: 0 }}>Your files ({docs.length})</h2>
          <button className="btn-secondary" onClick={extract} disabled={extracting || !docs.length}>
            {extracting ? <span className="spinner" /> : '✨ Read documents & fill intake'}
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
                    {d.category
                      ? `Detected: ${CATEGORY_LABELS[d.category] || d.category}`
                      : 'Not identified yet — run "Read with AI"'}{' '}
                    · {(d.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {d.category && <span className="chip ok">{CATEGORY_LABELS[d.category] || d.category}</span>}
                  <button className="btn-ghost" onClick={() => removeDoc(d.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {suggestions && (
          <div className="hint-box" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>
                {suggestions.conflict
                  ? `${Object.keys(suggestions.fields).length} value(s) differ from what you entered`
                  : `AI found ${Object.keys(suggestions.fields).length} value(s)`}
              </strong>
              <div className="btn-row">
                <button className="btn-secondary" onClick={() => setSuggestions(null)}>Keep mine</button>
                <button onClick={applyAll}>{suggestions.conflict ? 'Use document values' : 'Apply all to intake'}</button>
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
