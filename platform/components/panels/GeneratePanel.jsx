'use client';

import { useState } from 'react';

const DOCS = [
  { key: 'sop', label: 'Statement of Purpose / Study Plan', desc: 'AI-drafted, tailored to your answers.' },
  { key: 'financial-summary', label: 'Financial Summary', desc: 'Proof-of-funds cover sheet.' },
  { key: 'cover-letter', label: 'Submission Cover Letter', desc: 'Lists enclosed documents for IRCC.' },
  { key: 'imm1294', label: 'IMM 1294 — Study Permit data sheet', desc: 'Field-by-field values to transcribe into the official form.' },
  { key: 'imm5645', label: 'IMM 5645 — Family Information data sheet', desc: 'Family details layout for the official form.' },
];

export default function GeneratePanel({ app, patchLocal }) {
  const [selected, setSelected] = useState(DOCS.map((d) => d.key));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const generated = app.generated || [];

  const toggle = (key) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const hasGenerated = (key) => generated.some((g) => g.key === key);

  async function generate() {
    if (!selected.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed.');
      patchLocal({ generated: data.generated });
      const errNote = data.errors?.length
        ? ` (${data.errors.length} had issues: ${data.errors.map((e) => e.key).join(', ')})`
        : '';
      setMsg({ type: 'ok', text: `Generated ${data.produced.length} document(s).${errNote}` });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>Generate documents & forms</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Choose what to produce. Everything is a first draft built from your intake — review,
          edit, and verify before submitting to IRCC.
        </p>

        <div style={{ marginTop: 12 }}>
          {DOCS.map((d) => (
            <div className="row" key={d.key}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 400, margin: 0 }}>
                <input
                  type="checkbox"
                  style={{ width: 18, marginTop: 3 }}
                  checked={selected.includes(d.key)}
                  onChange={() => toggle(d.key)}
                />
                <span>
                  <span style={{ fontWeight: 600 }}>{d.label}</span>
                  <div className="muted small">{d.desc}</div>
                </span>
              </label>
              {hasGenerated(d.key) && (
                <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/${d.key}`}>
                  ↓ Download
                </a>
              )}
            </div>
          ))}
        </div>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button onClick={generate} disabled={busy || !selected.length}>
            {busy ? <span className="spinner" /> : `Generate ${selected.length} document(s)`}
          </button>
          {generated.length > 0 && (
            <a className="btn btn-secondary" href={`/api/applications/${app.id}/package`}>
              📦 Download full package (ZIP)
            </a>
          )}
        </div>
        {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ marginTop: 14 }}>{msg.text}</div>}
      </div>

      <div className="hint-box">
        <strong>About the IMM form data sheets:</strong> Official IRCC forms like IMM 1294 are
        Adobe dynamic (XFA) PDFs that require you to click <em>Validate</em> to produce a barcode,
        which software cannot do reliably. The data sheets give you every value laid out by
        section so you can transcribe into the official validated form quickly and accurately.
      </div>
    </>
  );
}
