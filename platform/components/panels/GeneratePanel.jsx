'use client';

import { useState } from 'react';
import OfficialFormsPanel from '@/components/OfficialFormsPanel';
import FinalFiles from '@/components/FinalFiles';
import { lettersFor, formsFor } from '@/lib/appTypes';
import { FileDown, FileText, RefreshCw } from 'lucide-react';
import { fmtDay } from '@/lib/format';

/** Parse a JSON reply; a proxy / crash page gets a readable message. */
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The server did not answer properly (HTTP ${res.status}) — it may be restarting. Wait a minute and try again.`);
  }
}

/**
 * Generate tab. One action — "Build final files" — drafts the letters,
 * pre-fills the forms and builds the numbered files for the IRCC portal.
 * Below it, the letters and working files, to review, redraft or download
 * (letters also as Word).
 */
export default function GeneratePanel({ app, patchLocal, onGoIntake, progress, driveOn }) {
  return (
    <div className="stack">
      <FinalFiles app={app} patchLocal={patchLocal} onGoIntake={onGoIntake} stale={progress?.final?.stale} driveOn={driveOn} />
      <WorkingFiles app={app} patchLocal={patchLocal} />
      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Blank IRCC forms (latest versions)</summary>
        <div style={{ marginTop: 12 }}>
          <OfficialFormsPanel bare />
        </div>
      </details>
    </div>
  );
}

function WorkingFiles({ app, patchLocal }) {
  const [busyKey, setBusyKey] = useState(null);
  const [msg, setMsg] = useState(null);
  const gen = new Map((app.generated || []).map((g) => [g.key, g]));
  const letters = lettersFor(app);
  const forms = formsFor(app);

  async function redraft(key, title) {
    setBusyKey(key);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docs: [key] }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Drafting failed.');
      patchLocal({ generated: data.generated });
      setMsg({ type: 'ok', text: `Redrafted: ${title}. Build the final files again to include it.` });
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusyKey(null);
    }
  }

  const dl = (key, format) => `/api/applications/${app.id}/download/${key}${format ? `?format=${format}` : ''}`;

  const Row = ({ title, sub, children }) => (
    <div className="list-row">
      <div className="grow">
        <div className="strong">{title}</div>
        <div className="small muted">{sub}</div>
      </div>
      <div className="btn-row" style={{ gap: 6, justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );

  return (
    <section className="card card-flush" aria-labelledby="wf-h">
      <div className="card-head" style={{ paddingBottom: 12, borderBottom: '1px solid var(--line)', marginBottom: 0 }}>
        <div>
          <h2 id="wf-h">Letters &amp; working files</h2>
          <p className="muted small">Produced by Build final files. Edit a letter in Word or redraft it, then build again.</p>
        </div>
      </div>
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ margin: '12px 18px 0' }}>{msg.text}</div>}
      {letters.map((l) => {
        const g = gen.get(l.key);
        return (
          <Row key={l.key} title={l.title} sub={g ? `Letter · drafted ${fmtDay(g.generatedAt)}` : 'Letter · drafted when you build'}>
            {g && <a className="btn btn-secondary btn-sm" href={dl(l.key)}><FileDown size={14} aria-hidden="true" /> PDF</a>}
            {g && l.word && <a className="btn btn-secondary btn-sm" href={dl(l.key, 'docx')}><FileText size={14} aria-hidden="true" /> Word</a>}
            <button type="button" className="btn-ghost btn-sm" onClick={() => redraft(l.key, l.title)} disabled={Boolean(busyKey)}>
              {busyKey === l.key ? <span className="spinner dark" /> : <RefreshCw size={14} aria-hidden="true" />} {g ? 'Redraft' : 'Draft now'}
            </button>
          </Row>
        );
      })}
      {forms.map((f) => {
        const g = gen.get(f.key);
        return (
          <Row key={f.key} title={`${f.label} — data sheet`} sub={g ? 'Every form value, for checking the form' : 'Made when you build'}>
            {g && <a className="btn btn-secondary btn-sm" href={dl(f.key)}><FileDown size={14} aria-hidden="true" /> PDF</a>}
          </Row>
        );
      })}
      <Row title="Missing documents & next steps" sub="Refreshed on every build">
        {gen.get('next-steps') && <a className="btn btn-secondary btn-sm" href={dl('next-steps')}><FileDown size={14} aria-hidden="true" /> PDF</a>}
      </Row>
    </section>
  );
}
