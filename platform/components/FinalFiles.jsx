'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ProgressBar from '@/components/ProgressBar';
import { requiredMissing } from '@/lib/schema';

const KIND = { form: 'IRCC form', photo: 'Photo (JPG)', package: 'With table of contents', documents: 'Document', letter: 'Letter' };
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/**
 * The numbered files that go to the IRCC portal, one per upload slot, named as
 * the team names them ("05 - Client Information - Zahra.pdf"), built in one go.
 */
export default function FinalFiles({ app, patchLocal, onGoIntake }) {
  const [data, setData] = useState(null); // { plan, built, job }
  const [job, setJob] = useState(null);
  const [msg, setMsg] = useState(null);
  const [cleanPages, setCleanPages] = useState(true);
  const [fixRotation, setFixRotation] = useState(true);
  const [missingModal, setMissingModal] = useState(null); // labels of empty required intake fields
  const [note, setNote] = useState(null); // missing documents & next steps, from the last build
  const timer = useRef(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/applications/${app.id}/final-files`);
    const d = JSON.parse(await res.text());
    setData(d);
    return d;
  }, [app.id]);

  const poll = useCallback(
    (errors = 0) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          const d = await load();
          const j = d.job;
          if (!j) {
            setJob(null);
            setMsg({ type: 'err', text: 'Building was interrupted (the server restarted). Press Build again.' });
          } else if (j.status === 'running') {
            setJob(j);
            poll(0);
          } else {
            setJob(null);
            if (j.status === 'failed') setMsg({ type: 'err', text: j.error });
            else {
              patchLocal({ generated: j.result.generated, finalFiles: d.built });
              setMsg(summary(j.result));
              setNote(j.result.note || null);
            }
          }
        } catch {
          if (errors < 8) poll(errors + 1);
        }
      }, 1500);
    },
    [load, patchLocal]
  );

  useEffect(() => {
    load()
      .then((d) => {
        if (d.job?.status === 'running') {
          setJob(d.job);
          poll(0);
        }
      })
      .catch(() => {});
    return () => clearTimeout(timer.current);
    // Re-plan when documents or generated files change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, (app.documents || []).length, (app.generated || []).length]);

  // The forms are filled from the intake: warn first if required answers are empty.
  function requestBuild() {
    const missing = requiredMissing(app.data || {}, app.type).map((f) => f.label);
    if (missing.length) setMissingModal(missing);
    else buildAll();
  }

  async function buildAll() {
    setMissingModal(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/final-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleanPages, fixRotation }),
      });
      const text = await res.text();
      let d;
      try {
        d = JSON.parse(text);
      } catch {
        throw new Error(`The server did not answer properly (HTTP ${res.status}) — it may be restarting. Wait a minute and try again.`);
      }
      if (!res.ok) throw new Error(d.error || 'Could not start building.');
      setJob(d.job);
      poll(0);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    }
  }

  const plan = data?.plan || [];
  const builtByN = new Map((data?.built?.files || []).map((f) => [f.n, f]));
  const genKeys = new Set((app.generated || []).map((g) => g.key));
  const progress = job
    ? {
        value: job.total ? (job.done + (job.inner?.total ? job.inner.done / job.inner.total : 0)) / job.total : null,
        label: `Building file ${Math.min(job.done + 1, job.total)} of ${job.total}: ${job.current || ''}${job.inner?.current ? ` — ${job.inner.current}` : ''}`,
      }
    : null;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Final files for the IRCC portal</h2>
        <div className="btn-row" style={{ gap: 6 }}>
          {data?.built?.files?.length > 0 && !job && (
            <a className="btn btn-secondary" href={`/api/applications/${app.id}/final-files/zip`}>↓ Download all (.zip)</a>
          )}
          <button onClick={requestBuild} disabled={Boolean(job) || !plan.length}>
            {job ? <span className="spinner" /> : data?.built ? 'Rebuild final files' : 'Build final files'}
          </button>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>
        One button does everything: drafts the letters, pre-fills the IRCC forms and builds one file per upload
        slot in the portal, numbered and named like the team&apos;s &ldquo;02 - Final Files&rdquo; folders. Documents
        with their own slot — like the marriage certificate — are left out of Client Information.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, margin: '6px 0 2px' }}>
        <input type="checkbox" style={{ width: 16 }} checked={cleanPages} onChange={(e) => setCleanPages(e.target.checked)} />
        <span className="small">Remove blank pages automatically</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, margin: '2px 0' }}>
        <input type="checkbox" style={{ width: 16 }} checked={fixRotation} onChange={(e) => setFixRotation(e.target.checked)} />
        <span className="small">Turn sideways / upside-down scans upright (read from the text)</span>
      </label>

      {progress && <ProgressBar value={progress.value} label={progress.label} />}
      {msg && (
        <div className={`alert ${msg.type === 'err' ? 'err' : msg.type === 'warn' ? 'info' : 'ok'}`} style={{ marginTop: 12 }}>
          {msg.text}
          {msg.list?.length > 0 && (
            <ul className="small" style={{ paddingLeft: 18, margin: '6px 0 0' }}>
              {msg.list.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      )}

      {note && (note.missingDocuments?.length > 0 || note.missingFields?.length > 0) && (
        <details style={{ marginTop: 10 }}>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
            Still missing: {note.missingDocuments.length} document(s), {note.missingFields.length} intake answer(s)
          </summary>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 6 }}>
            {note.missingDocuments.map((m, i) => <li key={`d${i}`}>{m}</li>)}
            {note.missingFields.map((m, i) => <li key={`f${i}`}>Intake: {m}</li>)}
          </ul>
        </details>
      )}

      {missingModal && (
        <div className="modal-overlay" onClick={() => setMissingModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginBottom: 6 }}>Some required information is missing</h2>
            <p className="muted small">
              The forms are filled from the intake. You can complete these answers first, or build now and fill the
              gaps in the forms by hand.
            </p>
            <ul style={{ paddingLeft: 18, marginTop: 10, maxHeight: 220, overflowY: 'auto' }}>
              {missingModal.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
            <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => buildAll()}>Build anyway</button>
              <button onClick={() => { setMissingModal(null); onGoIntake && onGoIntake(); }}>Complete in Intake →</button>
            </div>
          </div>
        </div>
      )}

      <table className="cmp" style={{ marginTop: 12 }}>
        <tbody>
          {plan.map((e, i) => {
            const b = e.n ? builtByN.get(e.n) : null;
            const current = b && b.filename === e.filename && genKeys.has(b.key);
            return (
              <tr key={i} style={e.n ? undefined : { opacity: 0.55 }}>
                <td style={{ width: 34, fontWeight: 700 }}>{e.n ? String(e.n).padStart(2, '0') : '—'}</td>
                <td>
                  <div style={{ fontWeight: 600 }}>{e.name}</div>
                  <div className="small muted">
                    {KIND[e.kind]}
                    {!e.ready && e.note ? <span style={{ color: e.n ? 'var(--warn)' : undefined }}> · {e.note}</span> : null}
                    {e.ready && e.note ? ` · ${e.note}` : null}
                  </div>
                </td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {current ? (
                    <a href={`/api/applications/${app.id}/download/${b.key}`} className="small">
                      ↓ {b.filename.replace(/\.(pdf|jpg)$/, '')}
                      <span className="muted"> · {size(b.size)}{b.pages ? ` · ${b.pages} p.` : ''}</span>
                    </a>
                  ) : e.n ? (
                    <span className="small muted">not built yet</span>
                  ) : (
                    <span className="small muted">nothing to include</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function summary(r) {
  const list = [];
  if (r.problems?.length) list.push(...r.problems.map((p) => `Not built — ${p.filename}: ${p.reason}`));
  if (r.uncertainPages?.length) list.push(`Check the orientation of: ${r.uncertainPages.join('; ')} (not enough text to be sure — left as scanned)`);
  if (r.skippedFiles?.length) list.push(`Left out (convert to PDF/JPG and re-upload): ${r.skippedFiles.join(', ')}`);
  const fixes =
    (r.rotatedPages ? ` Turned ${r.rotatedPages} page(s) upright.` : '') +
    (r.droppedPages ? ` Removed ${r.droppedPages} blank page(s).` : '') +
    (r.mirroredPages ? ` Removed ${r.mirroredPages} mirrored scan page(s).` : '');
  return { type: list.length ? 'warn' : 'ok', text: `Built ${r.files.length} final file(s).${fixes}`, list };
}
