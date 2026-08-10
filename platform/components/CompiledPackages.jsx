'use client';

import { useState } from 'react';

const PKGS = [
  {
    pkg: 'client-info',
    key: 'client-info-package',
    title: 'Client Information',
    desc: 'One PDF with TOC: SOP, CV, degree & transcripts, employment/job offer/leave/internship letters, certificates, ties, birth certificate/ID, flight, accommodation.',
  },
  {
    pkg: 'financial-proof',
    key: 'financial-proof-package',
    title: 'Financial Support Proof',
    desc: "One PDF with TOC: cover letter, summary report, deposit, my bank statement (+ source of my money), my title deeds, supporter's documents (affidavit, bank, pay slips, deeds, ID).",
  },
];

export default function CompiledPackages({ app, patchLocal }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [cleanPages, setCleanPages] = useState(true);
  const [fixRotation, setFixRotation] = useState(true);
  const generated = app.generated || [];
  const has = (key) => generated.some((g) => g.key === key);

  async function compile(pkg) {
    setBusy(pkg);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkg, cleanPages, fixRotation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compilation failed.');
      patchLocal({ generated: data.generated });
      const included = (data.included || []).filter((s) => s.count > 0).map((s) => s.name);
      const missing = (data.included || []).filter((s) => s.count === 0).map((s) => s.name);
      const dropped =
        (data.droppedPages ? ` Removed ${data.droppedPages} blank page(s).` : '') +
        (data.mirroredPages ? ` Removed ${data.mirroredPages} mirrored scan page(s).` : '') +
        (data.rotatedPages ? ` Re-oriented ${data.rotatedPages} page(s).` : '');
      const skippedFiles = (data.skippedFiles || []).length
        ? ` ⚠️ Left out of the PDF (convert to PDF/JPG and re-upload): ${data.skippedFiles.join(', ')}.`
        : '';
      setMsg({
        type: missing.length || skippedFiles ? 'warn' : 'ok',
        text:
          `Compiled ${included.length} section(s): ${included.join(', ')}.${dropped}${skippedFiles}` +
          (missing.length
            ? ` ⚠️ Skipped (no matching documents): ${missing.join(', ')} — set each file's type on the Documents tab, then re-compile.`
            : ''),
      });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <h2>Compiled packages</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Merge your generated documents and uploaded files into single PDFs with a Table of
        Contents — in the same order and section names as a submission-ready package. Upload the
        supporting documents first (Documents tab) so each section has content.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, margin: '10px 0 2px' }}>
        <input type="checkbox" style={{ width: 16 }} checked={cleanPages} onChange={(e) => setCleanPages(e.target.checked)} />
        <span className="small">Remove blank pages automatically</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, margin: '2px 0' }}>
        <input type="checkbox" style={{ width: 16 }} checked={fixRotation} onChange={(e) => setFixRotation(e.target.checked)} />
        <span className="small">Auto-correct sideways / upside-down scans</span>
      </label>
      <div style={{ marginTop: 10 }}>
        {PKGS.map((p) => (
          <div className="row" key={p.pkg}>
            <div style={{ maxWidth: '70%' }}>
              <div style={{ fontWeight: 600 }}>{p.title}</div>
              <div className="muted small">{p.desc}</div>
            </div>
            <div className="btn-row" style={{ gap: 6 }}>
              {has(p.key) && (
                <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/${p.key}`}>↓ PDF</a>
              )}
              <button onClick={() => compile(p.pkg)} disabled={busy === p.pkg}>
                {busy === p.pkg ? <span className="spinner" /> : has(p.key) ? 'Re-compile' : 'Compile'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {msg && (
        <div className={`alert ${msg.type === 'err' ? 'err' : msg.type === 'warn' ? 'info' : 'ok'}`} style={{ marginTop: 14 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
