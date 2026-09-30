'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Hammer, AlertTriangle, FileText, PenLine, RefreshCw } from 'lucide-react';
import ProgressBar from '@/components/ProgressBar';
import { requiredMissing } from '@/lib/schema';

const KIND = { form: 'IRCC form', photo: 'Photo (JPG)', package: 'With clickable table of contents', documents: 'Document', letter: 'Letter' };
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * What a final file will contain, as its contents page will show it: numbered
 * sections, a/b/c sub-sections, and the uploaded file(s) behind each.
 */
function Contents({ contents, kind }) {
  const count = contents.reduce((n, s) => n + s.files.length + s.children.reduce((m, c) => m + c.files.length, 0), 0);
  const letters = contents.filter((s) => s.letter).length + contents.reduce((n, s) => n + s.children.filter((c) => c.letter).length, 0);
  const summary = [count ? `${count} file${count === 1 ? '' : 's'}` : '', letters ? `${letters} letter${letters === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  if (!summary) return null;
  const Files = ({ files }) => files.map((f, i) => <span key={i} className="contents-file"><FileText size={11} aria-hidden="true" /> {f}</span>);
  return (
    <details className="contents">
      <summary>{summary}{kind === 'package' ? ` in ${contents.length} section${contents.length === 1 ? '' : 's'}` : ''}</summary>
      <ol>
        {contents.map((s, i) => (
          <li key={i}>
            {kind === 'package' && <span className="contents-name">{s.name}</span>}
            {s.letter && <span className="contents-file"><PenLine size={11} aria-hidden="true" /> drafted letter</span>}
            <Files files={s.files} />
            {s.children.length > 0 && (
              <ol className="sub">
                {s.children.map((c, j) => (
                  <li key={j}>
                    <span className="contents-name">{s.children.length > 1 ? `${LETTERS[j] || j + 1}) ` : ''}{c.name}</span>
                    {c.letter && <span className="contents-file"><PenLine size={11} aria-hidden="true" /> drafted letter</span>}
                    <Files files={c.files} />
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

/**
 * The numbered files that go to the IRCC portal, one per upload slot, named as
 * the team names them ("05 - Client Information - Zahra.pdf"), built in one go.
 */
/** The boxes a pre-filled IRCC form still needs, from its last pre-fill. */
function FormChecks({ checks }) {
  if (!checks.length) return null;
  return (
    <details className="form-checks">
      <summary className="small">
        <AlertTriangle size={13} aria-hidden="true" /> {checks.length} box{checks.length === 1 ? '' : 'es'} to complete or check on this form
      </summary>
      <ul className="small">
        {checks.map((c, i) => <li key={i}>{c}</li>)}
      </ul>
    </details>
  );
}

export default function FinalFiles({ app, patchLocal, onGoIntake, stale: stalePlan, driveOn }) {
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

  /** Build the whole set, or one file (`slot`). */
  async function buildAll(slot = null) {
    setMissingModal(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/final-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleanPages, fixRotation, ...(slot ? { slot } : {}) }),
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
  const problemBySlot = new Map((data?.built?.problems || []).filter((p) => p.slot).map((p) => [p.slot, p.reason]));
  const genKeys = new Set((app.generated || []).map((g) => g.key));
  // What the pre-filled form still needs: blanks and answers it could not take.
  const formChecks = (e) => (e.source?.generated ? (app.generated || []).find((g) => g.key === e.source.generated)?.checks : null) || [];
  const progress = job
    ? {
        value: job.total ? (job.done + (job.inner?.total ? job.inner.done / job.inner.total : 0)) / job.total : null,
        label: job.only
          ? `Rebuilding ${job.current && job.current !== 'planning' ? job.current : 'one file'}${job.inner?.current ? ` — ${job.inner.current}` : ''}`
          : `Building file ${Math.min(job.done + 1, job.total)} of ${job.total}: ${job.current || ''}${job.inner?.current ? ` — ${job.inner.current}` : ''}`,
      }
    : null;

  const slots = plan.filter((e) => e.n);
  const builtCount = slots.filter((e) => {
    const b = builtByN.get(e.n);
    return b && b.filename === e.filename && genKeys.has(b.key);
  }).length;
  const stale = stalePlan;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Final files for the IRCC portal</h1>
          <p className="muted small">
            One file per upload slot, numbered and named like the team&apos;s &ldquo;02 - Final Files&rdquo; folders. Building also
            drafts the letters and pre-fills the IRCC forms.
          </p>
        </div>
        <div className="btn-row">
          {data?.built?.files?.length > 0 && !job && (
            <a className="btn btn-secondary" href={`/api/applications/${app.id}/final-files/zip`}><Download size={16} aria-hidden="true" /> Download all (.zip)</a>
          )}
          <button type="button" onClick={requestBuild} disabled={Boolean(job) || !plan.length}>
            {job ? <span className="spinner" /> : <Hammer size={16} aria-hidden="true" />}
            {job ? 'Building…' : data?.built ? 'Rebuild final files' : 'Build final files'}
          </button>
        </div>
      </div>

      {stale && !job && (
        <div className="alert warn" style={{ margin: 0 }}>
          <AlertTriangle size={16} aria-hidden="true" />
          <span>Documents or letters changed after the last build. Rebuild before uploading to the portal.</span>
        </div>
      )}
      {progress && (
        <div className="banner">
          <span className="spinner dark" aria-hidden="true" />
          <div className="grow"><ProgressBar value={progress.value} label={progress.label} /></div>
        </div>
      )}
      {msg && (
        <div className={`alert ${msg.type === 'err' ? 'err' : msg.type === 'warn' ? 'warn' : 'ok'}`} style={{ margin: 0, display: 'block' }}>
          {msg.text}
          {msg.list?.length > 0 && (
            <ul className="small" style={{ paddingLeft: 18, margin: '6px 0 0' }}>
              {msg.list.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
          )}
        </div>
      )}
      {data?.unplaced?.length > 0 && !job && (
        <div className="alert warn" style={{ margin: 0, display: 'block' }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />
          <strong>Not in any final file:</strong> {data.unplaced.map((d) => d.filename).join(', ')}. Give each one its checklist code in the file name (e.g. &ldquo;113 - Employment Letter&rdquo;) or read &amp; check it so it gets a type; otherwise it stays out of the portal files.
        </div>
      )}
      {note && (note.missingDocuments?.length > 0 || note.missingFields?.length > 0) && (
        <details className="hint-box">
          <summary className="small strong" style={{ cursor: 'pointer' }}>
            Still missing: {note.missingDocuments.length} document(s), {note.missingFields.length} intake answer(s)
          </summary>
          <ul className="small" style={{ paddingLeft: 18, marginTop: 6 }}>
            {note.missingDocuments.map((m, i) => <li key={`d${i}`}>{m}</li>)}
            {note.missingFields.map((m, i) => <li key={`f${i}`}>Intake: {m}</li>)}
          </ul>
        </details>
      )}

      <section className="card card-flush" aria-labelledby="slots-h">
        <div className="card-head" style={{ paddingBottom: 12, borderBottom: '1px solid var(--line)', marginBottom: 0 }}>
          <div>
            <h2 id="slots-h">Portal files</h2>
            <p className="muted small">
              {slots.length} slots · {builtCount} built
              {driveOn && builtCount > 0 && (
                Object.keys(app.driveGenerated || {}).some((k) => k.startsWith('final-')) && app.driveSource?.url ? (
                  <> · <a href={app.driveSource.url} target="_blank" rel="noreferrer">saved in Google Drive → 02 - Final Files</a></>
                ) : (
                  <> · saving to Google Drive…</>
                )
              )}
            </p>
          </div>
          <div className="cluster" style={{ gap: 16 }}>
            <label className="check-label"><input type="checkbox" checked={cleanPages} onChange={(e) => setCleanPages(e.target.checked)} /> Remove blank pages</label>
            <label className="check-label"><input type="checkbox" checked={fixRotation} onChange={(e) => setFixRotation(e.target.checked)} /> Turn scans upright</label>
          </div>
        </div>
        {!data && <div className="empty small"><span className="spinner dark" /> Loading…</div>}
        {plan.map((e, i) => {
          const b = e.n ? builtByN.get(e.n) : null;
          const current = b && b.filename === e.filename && genKeys.has(b.key);
          return (
            <div key={i} className={`slot${e.n ? '' : ' skip'}`}>
              <span className="n">{e.n ? String(e.n).padStart(2, '0') : '—'}</span>
              <div style={{ minWidth: 0 }}>
                <div className="name">{e.kind === 'form' && e.label ? e.label : e.name}</div>
                <div className="sub">
                  {e.kind === 'form' ? <span className="mono">{e.name}</span> : KIND[e.kind]}
                  {e.note ? <span> · {e.note}</span> : null}
                </div>
                {e.contents?.length > 0 && <Contents contents={e.contents} kind={e.kind} />}
                {e.kind === 'form' && <FormChecks checks={formChecks(e)} />}
              </div>
              <div className="act">
                {current ? (
                  <a href={`/api/applications/${app.id}/download/${b.key}`} className="btn btn-secondary btn-sm" title={b.filename}>
                    <Download size={14} aria-hidden="true" /> {size(b.size)}{b.pages ? ` · ${b.pages} p.` : ''}
                  </a>
                ) : e.n && problemBySlot.has(e.slot) ? (
                  <span className="chip warn" title={problemBySlot.get(e.slot)}>Not built · {problemBySlot.get(e.slot)}</span>
                ) : e.n ? (
                  <span className={`chip ${e.ready || e.kind === 'form' || e.kind === 'letter' ? '' : 'warn'}`}>{e.ready || e.kind === 'form' || e.kind === 'letter' ? 'Not built yet' : 'Needs input'}</span>
                ) : (
                  <span className="small faint">Nothing to include</span>
                )}
                {e.n && (
                  <button type="button" className="icon-btn" onClick={() => buildAll(e.slot)} disabled={Boolean(job)} title={current ? 'Rebuild only this file' : 'Build only this file'} aria-label={current ? 'Rebuild only this file' : 'Build only this file'}>
                    <RefreshCw size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {missingModal && (
        <div className="modal-overlay" onClick={() => setMissingModal(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="miss-h" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 id="miss-h">Some intake answers are empty</h2>
                <p className="muted small">The forms are filled from the intake. Complete these first, or build now and fill the gaps in the forms by hand.</p>
              </div>
            </div>
            <div className="modal-body">
              <ul style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 3 }}>
                {missingModal.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-secondary" onClick={() => buildAll()}>Build anyway</button>
              <button type="button" onClick={() => { setMissingModal(null); onGoIntake && onGoIntake(); }}>Complete the intake</button>
            </div>
          </div>
        </div>
      )}
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
    (r.mirroredPages ? ` Removed ${r.mirroredPages} mirrored scan page(s).` : '') +
    (r.reorderedFiles?.length ? ` Put ${r.reorderedFiles.length} document(s) in order: translation, certified copy, original.` : '');
  const what = r.only ? (r.built?.length ? `Rebuilt ${r.built.join(', ')}.` : 'Nothing was rebuilt.') : `Built ${r.files.length} final file(s).`;
  return { type: list.length ? 'warn' : 'ok', text: `${what}${fixes}`, list };
}
