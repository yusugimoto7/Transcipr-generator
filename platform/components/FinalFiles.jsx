'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Hammer, AlertTriangle, FileText, PenLine, RefreshCw, X, Plus, Lock, Undo2, FolderPlus } from 'lucide-react';
import ProgressBar from '@/components/ProgressBar';
import { requiredMissing } from '@/lib/schema';

const KIND = { form: 'IRCC form', photo: 'Photo (JPG)', package: 'With clickable table of contents', documents: 'Document', letter: 'Letter' };
const size = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * What a final file will contain, as its contents page will show it: numbered
 * sections, a/b/c sub-sections, and the uploaded file(s) behind each. With
 * `edit`, each document can be taken out of the file or moved to another one,
 * and any other uploaded document can be put in it.
 */
function Contents({ contents, kind, edit, open }) {
  const count = contents.reduce((n, s) => n + s.files.length + s.children.reduce((m, c) => m + c.files.length, 0), 0);
  const letters = contents.filter((s) => s.letter).length + contents.reduce((n, s) => n + s.children.filter((c) => c.letter).length, 0);
  const summary = [count ? `${count} file${count === 1 ? '' : 's'}` : '', letters ? `${letters} letter${letters === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
  if (!summary && !edit) return null;
  const Files = ({ files, ids = [] }) =>
    files.map((f, i) => (
      <span key={i} className="contents-file">
        <FileText size={11} aria-hidden="true" /> <span className="cf-name">{f}</span>
        {edit && ids[i] && <DocActions id={ids[i]} edit={edit} />}
      </span>
    ));
  return (
    <details className="contents" open={open || undefined}>
      <summary>{summary ? `${summary}${kind === 'package' ? ` in ${contents.length} section${contents.length === 1 ? '' : 's'}` : ''}` : 'Empty — add documents'}</summary>
      {contents.length > 0 && (
        <ol>
          {contents.map((s, i) => (
            <li key={i}>
              {kind === 'package' && <span className="contents-name">{s.name}</span>}
              {s.letter && <span className="contents-file"><PenLine size={11} aria-hidden="true" /> drafted letter</span>}
              <Files files={s.files} ids={s.ids} />
              {s.children.length > 0 && (
                <ol className="sub">
                  {s.children.map((c, j) => (
                    <li key={j}>
                      <span className="contents-name">{s.children.length > 1 ? `${LETTERS[j] || j + 1}) ` : ''}{c.name}</span>
                      {c.letter && <span className="contents-file"><PenLine size={11} aria-hidden="true" /> drafted letter</span>}
                      <Files files={c.files} ids={c.ids} />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
      {edit && <AddDocument edit={edit} />}
    </details>
  );
}

/** Take a document out of this file, move it to another, or undo a move. */
function DocActions({ id, edit }) {
  const moved = edit.assign[id] === edit.slot;
  return (
    <span className="doc-acts">
      {moved && <span className="chip tiny" title="Put in this file by hand">moved here</span>}
      <select
        className="mini-select"
        aria-label="Move to another file"
        value=""
        disabled={edit.busy}
        onChange={(e) => e.target.value && edit.change({ op: 'assign', doc: id, to: e.target.value })}
      >
        <option value="">Move to…</option>
        {edit.targets.filter((t) => t.slot !== edit.slot).map((t) => <option key={t.slot} value={t.slot}>{t.name}</option>)}
      </select>
      {moved ? (
        <button type="button" className="icon-btn tiny" title="Undo: back to where it goes automatically" aria-label="Undo the move" disabled={edit.busy} onClick={() => edit.change({ op: 'assign', doc: id, to: null })}>
          <Undo2 size={12} aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className="icon-btn tiny" title="Leave this document out of this file" aria-label="Leave out of this file" disabled={edit.busy} onClick={() => edit.change({ op: 'assign', doc: id, to: 'none' })}>
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  );
}

/** Put any other uploaded document in this file. */
function AddDocument({ edit }) {
  const options = edit.docs.filter((d) => !edit.here.has(d.id));
  if (!options.length) return null;
  return (
    <div className="add-doc">
      <Plus size={12} aria-hidden="true" />
      <select
        className="mini-select"
        aria-label="Add a document to this file"
        value=""
        disabled={edit.busy}
        onChange={(e) => e.target.value && edit.change({ op: 'assign', doc: e.target.value, to: edit.slot })}
      >
        <option value="">Add a document to this file…</option>
        {options.map((d) => <option key={d.id} value={d.id}>{d.filename}{d.where ? ` — now in ${d.where}` : d.out ? ' — left out' : ''}</option>)}
      </select>
    </div>
  );
}

/**
 * The numbered files that go to the IRCC portal, one per upload slot, named as
 * the team names them ("05 - Client Information - Zahra.pdf"), built in one go.
 */
/** The IRCC portal's upload limit per file (lib/finalFiles.js PORTAL_MAX_BYTES). */
const MAX_BYTES = 4 * 1024 * 1024;

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
  const [busy, setBusy] = useState(false); // a change to the set is being saved
  const [addSlot, setAddSlot] = useState('');
  const [customName, setCustomName] = useState('');
  const [openSlot, setOpenSlot] = useState(null); // the file whose contents were just edited stays open
  const [pendingSlot, setPendingSlot] = useState(null); // a one-file rebuild was asked for, not started yet
  const timer = useRef(null);

  /** Change the set (lib/finalFiles.js applySetupChange) and show the new plan. */
  async function change(body, keepOpen = body.to && body.to !== 'none' ? body.to : null) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/final-files`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Could not change the set.');
      setData((prev) => ({ ...prev, ...d }));
      patchLocal({ finalSetup: d.finalSetup });
      if (keepOpen) setOpenSlot(keepOpen);
      return true;
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
      return false;
    } finally {
      setBusy(false);
    }
  }

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
    setPendingSlot(slot);
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
    } finally {
      setPendingSlot(null);
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

  /** Progress of the file being built in this row (a one-file rebuild, or the current file of a full build). */
  const rowProgress = (e) => {
    if (pendingSlot === e.slot) return { value: null };
    if (!job) return null;
    const inner = job.inner?.total ? job.inner.done / job.inner.total : null;
    if (job.only === e.slot) {
      // Preparing (letters, forms) is the first step, building the file the second.
      return { value: job.total ? (job.done + (inner || 0)) / job.total : null, step: job.inner?.current || job.inner?.phase || job.current };
    }
    if (!job.only && job.current === e.filename) return { value: inner, step: job.inner?.current || job.inner?.phase };
    return null;
  };

  const slots = plan.filter((e) => e.n);
  // Files that can hold documents, and where each uploaded document is now.
  const holds = (e) => !['form', 'photo', 'letter'].includes(e.kind);
  const targets = plan.filter(holds).map((e) => ({ slot: e.slot, name: e.name }));
  const docWhere = new Map();
  for (const e of plan) for (const sec of e.contents || []) for (const n of [sec, ...sec.children]) (n.ids || []).forEach((id) => docWhere.set(id, e.name));
  const assign = data?.setup?.assign || app.finalSetup?.assign || {};
  const movable = (app.documents || [])
    .filter((d) => !['internal', 'questionnaire', 'rep-form', 'photo'].includes(d.category))
    .map((d) => ({ id: d.id, filename: d.filename, where: docWhere.get(d.id) || null, out: assign[d.id] === 'none' }));
  const editFor = (e) => {
    const here = new Set();
    for (const sec of e.contents || []) for (const n of [sec, ...sec.children]) (n.ids || []).forEach((id) => here.add(id));
    return { slot: e.slot, change, busy: busy || Boolean(job), targets, docs: movable, here, assign };
  };
  const suggestions = (data?.suggestions || []).filter((d) => d.options.length);
  const catalog = data?.catalog || [];
  const basis = data?.basis;
  const setupChanged = Boolean(data?.setup && ((data.setup.removed || []).length || (data.setup.added || []).length || (data.setup.custom || []).length || Object.keys(data.setup.assign || {}).length));
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
            <a className="btn btn-secondary" href={`/api/applications/${app.id}/final-files/zip`} target="_blank" rel="noopener noreferrer"><Download size={16} aria-hidden="true" /> Download all (.zip)</a>
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
      {suggestions.length > 0 && !job && (
        <details className="hint-box" open={suggestions.some((d) => !d.where)}>
          <summary className="small strong" style={{ cursor: 'pointer' }}>
            <AlertTriangle size={14} aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 6 }} />
            {suggestions.filter((d) => !d.where).length > 0
              ? `${suggestions.filter((d) => !d.where).length} document(s) are in no final file`
              : `${suggestions.length} document(s) only landed in "Other Supporting Documents"`}{' '}
            — choose where they go
          </summary>
          <ul className="suggest-list">
            {suggestions.map((d) => (
              <li key={d.id}>
                <span className="contents-file"><FileText size={11} aria-hidden="true" /> {d.filename}</span>
                <span className="small faint">{d.label ? `${d.label} · ` : ''}{d.where ? `now in ${plan.find((e) => e.slot === d.where)?.name || d.where}` : 'not in any file'}</span>
                <span className="btn-row">
                  {d.options.map((o) => (
                    <button
                      key={o.slot}
                      type="button"
                      className="btn-secondary btn-sm"
                      disabled={busy}
                      title={o.portal ? `Portal slot: ${o.portal}` : undefined}
                      onClick={async () => {
                        if (o.action === 'add' && !(await change({ op: 'add', slot: o.slot }))) return;
                        await change({ op: 'assign', doc: d.id, to: o.slot });
                      }}
                    >
                      {o.action === 'add' ? <FolderPlus size={13} aria-hidden="true" /> : null}
                      {o.action === 'add' ? `New file: ${o.name}` : `Put in ${o.name}`}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </details>
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
            {basis && (
              <p className="muted small">
                Standard set for this type, from the latest {basis.n} application{basis.n === 1 ? '' : 's'}
                {basis.from ? ` (submitted ${basis.from.slice(0, 7)} – ${basis.to.slice(0, 7)})` : ''}.{' '}
                <Lock size={11} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> files are always included; the others can be taken out.
                {setupChanged && (
                  <>
                    {' '}
                    <button type="button" className="link-btn" disabled={busy || Boolean(job)} onClick={() => window.confirm('Go back to the standard set? Added files, files made by hand and documents you moved are reset.') && change({ op: 'reset' })}>
                      Reset to the standard set
                    </button>
                  </>
                )}
              </p>
            )}
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
                <div className="name">
                  {e.kind === 'form' && e.label ? e.label : e.name}
                  {e.fixed && e.kind !== 'form' && <Lock size={12} className="slot-lock" aria-label="always included" />}
                  {e.custom && <span className="chip tiny">made by hand</span>}
                  {e.added && !e.custom && <span className="chip tiny">added</span>}
                </div>
                <div className="sub">
                  {e.kind === 'form' ? <span className="mono">{e.name}</span> : e.custom ? 'With clickable table of contents' : KIND[e.kind]}
                  {e.note ? <span> · {e.note}</span> : null}
                  {e.seen && e.kind !== 'form' && !e.fixed ? <span> · in {e.seen} of the latest {e.of}</span> : null}
                </div>
                {e.n && e.portal && (
                  e.portal.name ? (
                    <div className="portal-slot">Portal slot: <strong>{e.portal.name}</strong></div>
                  ) : (
                    <div className="portal-slot warn"><AlertTriangle size={12} aria-hidden="true" /> {e.portal.hint}</div>
                  )
                )}
                {holds(e) ? (
                  <Contents contents={e.contents || []} kind={e.kind} edit={editFor(e)} open={openSlot === e.slot || (e.custom && !e.ready)} />
                ) : (
                  e.contents?.length > 0 && <Contents contents={e.contents} kind={e.kind} />
                )}
                {e.kind === 'form' && <FormChecks checks={formChecks(e)} />}
              </div>
              <div className="act">
                {(() => {
                  const rp = rowProgress(e);
                  if (!rp) return null;
                  const pct = rp.value == null ? null : Math.max(0, Math.min(100, Math.round(rp.value * 100)));
                  return (
                    <div className="row-progress" title={rp.step ? String(rp.step) : 'Building this file'}>
                      <div className="progress" role="progressbar" aria-label={`Building ${e.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
                        <div className={pct == null ? 'progress-fill indeterminate' : 'progress-fill'} style={pct == null ? undefined : { width: `${pct}%` }} />
                      </div>
                      <span className="small faint">{pct == null ? 'Building…' : `${pct}%`}</span>
                    </div>
                  );
                })()}
                {rowProgress(e) ? null : current && b.size > MAX_BYTES && (
                  <span className="chip warn" title="IRCC's portal takes files up to 4 MB. Rebuild with blank pages removed, or split / compress this file.">Over 4 MB</span>
                )}
                {rowProgress(e) ? null : current ? (
                  <a href={`/api/applications/${app.id}/download/${b.key}`} className="btn btn-secondary btn-sm" title={b.filename} target="_blank" rel="noopener noreferrer">
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
                {!e.fixed && (
                  <button type="button" className="icon-btn danger" onClick={() => change({ op: 'remove', slot: e.slot })} disabled={busy || Boolean(job)} title="Remove this file from the set" aria-label={`Remove ${e.name} from the set`}>
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {data && (
          <div className="add-file">
            <div className="add-file-row">
              <label className="small strong" htmlFor="add-slot">Add a file</label>
              <select id="add-slot" value={addSlot} onChange={(e) => setAddSlot(e.target.value)} disabled={busy || Boolean(job)}>
                <option value="">Choose a portal file…</option>
                {catalog.map((c) => (
                  <option key={c.slot} value={c.slot}>
                    {c.name}{c.seen ? ` — in ${c.seen} of the latest ${c.of}` : ''}{c.portal ? ` · portal: ${c.portal}` : ' · no portal slot of its own'}
                  </option>
                ))}
              </select>
              <button type="button" className="btn-secondary btn-sm" disabled={!addSlot || busy || Boolean(job)} onClick={async () => (await change({ op: 'add', slot: addSlot })) && setAddSlot('')}>
                <Plus size={14} aria-hidden="true" /> Add
              </button>
            </div>
            <div className="add-file-row">
              <label className="small strong" htmlFor="custom-name">New file</label>
              <input
                id="custom-name"
                value={customName}
                placeholder="e.g. Proof of Status / Invitation Letter"
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && customName.trim() && change({ op: 'custom', name: customName }).then((ok) => ok && setCustomName(''))}
                disabled={busy || Boolean(job)}
              />
              <button type="button" className="btn-secondary btn-sm" disabled={!customName.trim() || busy || Boolean(job)} onClick={async () => (await change({ op: 'custom', name: customName })) && setCustomName('')}>
                <FolderPlus size={14} aria-hidden="true" /> Create
              </button>
            </div>
            <p className="small faint" style={{ margin: 0 }}>
              A new file starts empty: open it and add the documents it should hold. Documents moved into it leave the file they were in.
            </p>
          </div>
        )}
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
  const big = (r.files || []).filter((f) => f.size > MAX_BYTES);
  if (big.length) list.push(`Over the portal's 4 MB limit: ${big.map((f) => `${f.filename} (${(f.size / 1048576).toFixed(1)} MB)`).join(', ')} — compress or split before uploading`);
  const fixes =
    (r.rotatedPages ? ` Turned ${r.rotatedPages} page(s) upright.` : '') +
    (r.droppedPages ? ` Removed ${r.droppedPages} blank page(s).` : '') +
    (r.mirroredPages ? ` Removed ${r.mirroredPages} mirrored scan page(s).` : '') +
    (r.reorderedFiles?.length ? ` Put ${r.reorderedFiles.length} document(s) in order: translation, certified copy, original.` : '');
  const what = r.only ? (r.built?.length ? `Rebuilt ${r.built.join(', ')}.` : 'Nothing was rebuilt.') : `Built ${r.files.length} final file(s).`;
  return { type: list.length ? 'warn' : 'ok', text: `${what}${fixes}`, list };
}
