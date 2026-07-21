'use client';

import { useState } from 'react';
import OfficialFormsPanel from '@/components/OfficialFormsPanel';

const DOCS = [
  { key: 'sop', label: 'Statement of Purpose / Study Plan', desc: 'AI-drafted, tailored to your answers.' },
  { key: 'financial-cover-letter', label: 'Financial Cover Letter', desc: 'First-person letter: funds, source of funds, transfer method.' },
  { key: 'financial-summary', label: 'Financial Summary Report', desc: 'Expense + sources-of-funds + assets tables.' },
  { key: 'cover-letter', label: 'RCIC Submission Letter', desc: 'Full submission letter with case-law citations & signature.' },
  { key: 'imm1294', label: 'IMM 1294 — Study Permit data sheet', desc: 'Field-by-field values to transcribe into the official form.' },
  { key: 'imm5257', label: 'IMM 5257 — TRV / Schedule 1 data sheet', desc: 'Temporary Resident Visa application values.' },
  { key: 'imm5645', label: 'IMM 5645 — Family Information data sheet', desc: 'Family details layout for the official form.' },
  { key: 'imm5476', label: 'IMM 5476 — Use of a Representative data sheet', desc: 'Representative appointment (RCIC) values.' },
];

export default function GeneratePanel({ app, patchLocal }) {
  const [selected, setSelected] = useState(DOCS.map((d) => d.key));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [note, setNote] = useState(null);
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
      setNote(data.note || null);
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

      {note && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginBottom: 0 }}>📋 Missing documents & next steps</h2>
            <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/next-steps`}>
              ↓ Download as PDF
            </a>
          </div>

          <h3 style={{ marginTop: 14 }}>Missing documents</h3>
          {note.missingDocuments.length === 0 ? (
            <p className="small" style={{ color: 'var(--ok)' }}>All checklist documents provided. 🎉</p>
          ) : (
            <ul style={{ paddingLeft: 18 }}>
              {note.missingDocuments.map((m, i) => <li key={i}>{m}</li>)}
            </ul>
          )}

          {note.missingFields.length > 0 && (
            <>
              <h3 style={{ marginTop: 14 }}>Intake fields still empty</h3>
              <ul style={{ paddingLeft: 18 }}>
                {note.missingFields.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </>
          )}

          <h3 style={{ marginTop: 14 }}>Suggested next steps</h3>
          <ol style={{ paddingLeft: 18 }}>
            {note.nextSteps.map((s, i) => <li key={i} style={{ marginBottom: 6 }}>{s}</li>)}
          </ol>
        </div>
      )}

      <OfficialFormsPanel />

      <div className="hint-box">
        <strong>Forms &amp; data sheets:</strong> The platform pulls the latest official IRCC
        forms from canada.ca (above). Because those forms are Adobe dynamic (XFA) PDFs that need
        the <em>Validate</em> step, the data sheets give you every value laid out by section so
        you can fill the official form quickly and accurately.
      </div>
    </>
  );
}
