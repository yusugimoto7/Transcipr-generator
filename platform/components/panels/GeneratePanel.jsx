'use client';

import { useState } from 'react';
import OfficialFormsPanel from '@/components/OfficialFormsPanel';
import FinalFiles from '@/components/FinalFiles';
import { lettersFor, formsFor } from '@/lib/appTypes';

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
export default function GeneratePanel({ app, patchLocal, onGoIntake }) {
  return (
    <>
      <FinalFiles app={app} patchLocal={patchLocal} onGoIntake={onGoIntake} />
      <WorkingFiles app={app} patchLocal={patchLocal} />
      <OfficialFormsPanel />
    </>
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

  return (
    <div className="card">
      <h2>Letters &amp; working files</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Everything below is produced by <strong>Build final files</strong>. Review the letters, download them as Word
        to edit, or redraft one — then build again. Data sheets list every form value, for checking the forms.
      </p>
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`}>{msg.text}</div>}

      <table className="cmp">
        <tbody>
          {letters.map((l) => {
            const g = gen.get(l.key);
            return (
              <tr key={l.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{l.title}</div>
                  <div className="small muted">Letter{g ? ` · drafted ${new Date(g.generatedAt).toLocaleDateString()}` : ' · drafted when you build'}</div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {g && (
                    <>
                      <a className="small" href={dl(l.key)}>↓ PDF</a>
                      {l.word && <> · <a className="small" href={dl(l.key, 'docx')}>↓ Word</a></>}
                      {' · '}
                    </>
                  )}
                  <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => redraft(l.key, l.title)} disabled={Boolean(busyKey)}>
                    {busyKey === l.key ? <span className="spinner" /> : g ? '↻ Redraft' : 'Draft now'}
                  </button>
                </td>
              </tr>
            );
          })}
          {forms.map((f) => {
            const g = gen.get(f.key);
            return (
              <tr key={f.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.label} — data sheet</div>
                  <div className="small muted">Field-by-field values{g ? '' : ' · made when you build'}</div>
                </td>
                <td style={{ textAlign: 'right' }}>{g && <a className="small" href={dl(f.key)}>↓ PDF</a>}</td>
              </tr>
            );
          })}
          <tr>
            <td>
              <div style={{ fontWeight: 600 }}>Missing documents &amp; next steps</div>
              <div className="small muted">Refreshed every build</div>
            </td>
            <td style={{ textAlign: 'right' }}>{gen.get('next-steps') && <a className="small" href={dl('next-steps')}>↓ PDF</a>}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
