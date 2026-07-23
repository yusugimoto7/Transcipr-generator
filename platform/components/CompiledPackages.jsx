'use client';

import { useState } from 'react';

const PKGS = [
  {
    pkg: 'client-info',
    key: 'client-info-package',
    title: 'Client Information',
    desc: 'One PDF with a Table of Contents: SOP, CV, transcripts, certificates, job offer, birth certificate/ID, flight ticket, accommodation.',
  },
  {
    pkg: 'financial-proof',
    key: 'financial-proof-package',
    title: 'Financial Support Proof',
    desc: 'One PDF with a Table of Contents: financial cover letter, financial summary, deposit, bank statements, source of funds, affidavit, title deeds.',
  },
];

export default function CompiledPackages({ app, patchLocal }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const generated = app.generated || [];
  const has = (key) => generated.some((g) => g.key === key);

  async function compile(pkg) {
    setBusy(pkg);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compilation failed.');
      patchLocal({ generated: data.generated });
      const included = (data.included || []).filter((s) => s.count > 0).map((s) => s.name);
      setMsg({
        type: 'ok',
        text: `Compiled ${included.length} section(s): ${included.join(', ')}.`,
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
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ marginTop: 14 }}>{msg.text}</div>}
    </div>
  );
}
