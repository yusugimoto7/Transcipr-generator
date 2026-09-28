'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Sparkles, Search, ArrowLeft, FolderCog, CircleDashed, FileText, RotateCcw, Landmark, ListChecks, X, StickyNote } from 'lucide-react';
import { getAppType } from '@/lib/appTypes';
import { everyField } from '@/lib/schema';
import { CATEGORY_LABELS } from '@/lib/docLabels';
import { fmtTime } from '@/lib/format';
import ProgressBar from '@/components/ProgressBar';
import IrccRequirements from '@/components/IrccRequirements';
import DocDetail, { CHECK, CheckChip, worstStatus } from '@/components/docs/DocDetail';
import AddDocuments from '@/components/docs/AddDocuments';
import UploadBox from '@/components/docs/UploadBox';
import { NotesBox, NotesFeed } from '@/components/Notes';

const FIELD_LABELS = Object.fromEntries(everyField().map((f) => [f.id, f.label]));

/** Parse a JSON response; a proxy or crash page gets a readable message instead of "Unexpected token '<'". */
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const e = new Error(
      res.status >= 500 || res.status === 0
        ? `The server did not answer properly (HTTP ${res.status}) — it may be restarting. Wait a minute and try again.`
        : `Unexpected server response (HTTP ${res.status}).`
    );
    e.transient = true;
    throw e;
  }
}

const GROUPS = [
  ['applicant', 'Applicant'],
  ['principal', 'Spouse / parent / host / sponsor'],
  ['ircc', "Also required by IRCC"],
  ['firm', 'Prepared by the firm'],
];
const PROBLEM = new Set(['red', 'orange', 'yellow']);

/** Parse the URL sub-position: "filter=missing", "doc=<id>", "item=<id>", "ircc", "compare". */
function parseSub(sub) {
  if (!sub) return {};
  if (sub.startsWith('filter=')) {
    const f = sub.slice(7);
    return { filter: f === 'serious' || f === 'attention' ? 'problems' : f };
  }
  return { sel: sub };
}

/** A short file name for an upload made for a checklist item: "101 - Birth certificate - Sara.pdf". */
function nameFor(item, firstName, file) {
  if (!/^\d/.test(item.code)) return null;
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  const label = item.label.split(/ — | \(|, /)[0].replace(/[\\/:*?"<>|]/g, '').slice(0, 60).trim();
  return `${item.code} - ${label}${firstName ? ` - ${firstName}` : ''}${ext}`;
}

export default function DocumentsPanel({ app, progress, patchLocal, onExtracted, staff, selected, onSelect, driveOn, viewer }) {
  const init = parseSub(selected);
  const [filter, setFilter] = useState(init.filter || 'all');
  const [sel, setSelState] = useState(init.sel || null);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [job, setJob] = useState(null);
  const [readMsg, setReadMsg] = useState(null);
  const [readFor, setReadFor] = useState(app.readFor || '');
  const [reviewing, setReviewing] = useState(null);
  const pollTimer = useRef(null);
  const appRef = useRef(app);
  appRef.current = app;

  const docs = app.documents || [];
  const docById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);
  const checklist = progress.checklist;
  const service = getAppType(app.type);
  const firstName = (app.data?.givenName || readFor || '').split(' ')[0];

  // Follow the URL when the overview links here with a filter.
  useEffect(() => {
    const p = parseSub(selected);
    if (p.filter) setFilter(p.filter);
    if (p.sel) setSelState(p.sel);
  }, [selected]);

  const select = (s) => {
    setSelState(s);
    onSelect?.(s);
  };

  // ---- the list: checklist items with their files, then files that match no item ----
  const matched = new Set(checklist.flatMap((c) => c.docIds || []));
  const loose = docs.filter((d) => !matched.has(d.id));
  const itemDocs = (c) => (c.docIds || []).map((id) => docById.get(id)).filter(Boolean);
  // Open a document in the pane (from a note): under its checklist item when it has one.
  const openDoc = (docId) => {
    const item = checklist.find((c) => (c.docIds || []).includes(docId));
    select(item ? `item=${item.id}|file=${docId}` : `doc=${docId}`);
  };
  const noteCount = (docId) => (app.notes || []).filter((n) => n.docId === docId).length;

  const q = query.trim().toLowerCase();
  const passes = (label, files, missing) => {
    if (q && ![label, ...files.map((f) => f.filename)].join(' ').toLowerCase().includes(q)) return false;
    if (filter === 'missing') return missing;
    if (filter === 'problems') return files.some((f) => PROBLEM.has(f.verification?.status));
    if (filter === 'sign') return files.some((f) => f.verification && !f.verification.reviewedBy);
    return true;
  };

  const counts = {
    missing: progress.documents.missing.length,
    problems: progress.check.red + progress.check.orange + progress.check.yellow,
    sign: progress.check.toSign,
  };

  const groups = GROUPS.map(([party, title]) => ({
    party,
    title,
    rows: checklist
      .filter((c) => c.party === party)
      .map((c) => ({ c, files: itemDocs(c) }))
      .filter(({ c, files }) => passes(`${c.code} ${c.label}`, files, !c.provided && c.party !== 'firm' && !c.optional)),
  })).filter((g) => g.rows.length);
  const looseShown = loose.filter((d) => passes(d.filename, [d], false));

  // ---- reading & checking (a server job; resumes if the page is reloaded) ----
  async function extract(all = false) {
    setExtracting(true);
    setReadMsg(null);
    setComparison(null);
    setJob(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all, ...(staff && readFor.trim() ? { applicant: readFor.trim() } : {}) }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Could not start reading.');
      setJob(data.job);
      poll(0);
    } catch (e2) {
      setReadMsg({ type: 'err', text: e2.message });
      setExtracting(false);
    }
  }

  function poll(errors) {
    clearTimeout(pollTimer.current);
    pollTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/applications/${app.id}/extract`);
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || 'Could not check progress.');
        const j = data.job;
        if (!j) throw new Error('Reading was interrupted (the server restarted). Click "Read & check" again — files already read are skipped.');
        setJob(j);
        if (j.status === 'running') return poll(0);
        if (j.status === 'failed') throw new Error(j.error || 'Reading failed.');
        applyResult(j.result || {});
        setExtracting(false);
        setJob(null);
      } catch (e2) {
        if ((e2.transient || e2 instanceof TypeError) && errors < 8) return poll(errors + 1);
        setReadMsg({ type: 'err', text: e2.message });
        setExtracting(false);
        setJob(null);
      }
    }, 2500);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await readJson(await fetch(`/api/applications/${app.id}/extract`));
        if (!cancelled && data.applicant) setReadFor((cur) => cur || data.applicant);
        if (!cancelled && data.job?.status === 'running') {
          setExtracting(true);
          setJob(data.job);
          poll(0);
        }
      } catch {
        /* nothing running */
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  function applyResult(data) {
    if (data.documents) patchLocal({ documents: data.documents });
    const fields = data.fields || {};
    const sources = data.sources || {};
    const conf = data.confidence || {};
    const entries = Object.entries(fields).filter(([, v]) => v != null && String(v).trim() !== '');
    const check = data.check;
    const problems = check ? check.red + check.orange + check.yellow : 0;
    const checkText = check ? ` Check: ${check.green} OK${problems ? `, ${problems} with findings` : ''}.` : '';
    if (!entries.length) {
      setReadMsg({ type: 'info', text: `Documents identified. No intake details could be read.${checkText}` });
      if (data.notes?.length) {
        setComparison({ rows: [], notes: data.notes });
        select('compare');
      }
      return;
    }
    // The server already filled the empty fields (data.filled): load its copy.
    const before = appRef.current.data || {};
    if (data.data) patchLocal({ data: data.data, dataVersion: data.dataVersion });
    const filled = new Set(data.filled || []);
    const rows = [];
    let applied = 0;
    for (const [k, v] of entries) {
      const yours = String((filled.has(k) ? before[k] : (data.data || before)[k]) ?? '');
      let status;
      if (filled.has(k)) {
        applied++;
        status = 'added';
      } else if (!yours.trim()) {
        onExtracted(k, v); // older servers: fill it from the page
        applied++;
        status = 'added';
      } else if (yours === String(v)) status = 'match';
      else status = 'differ';
      rows.push({ id: k, label: FIELD_LABELS[k] || k, yours, doc: String(v), source: sources[k] || '', conf: conf[k] || '', status });
    }
    setComparison({ rows, notes: data.notes || [] });
    const differ = rows.filter((r) => r.status === 'differ').length;
    setReadMsg({ type: 'ok', text: `Filled ${applied} empty field(s) from the documents${differ ? `; ${differ} value(s) differ from what was entered` : ''}.${checkText}` });
    select('compare');
  }

  function useDoc(row) {
    onExtracted(row.id, row.doc);
    setComparison((c) => ({ ...c, rows: c.rows.map((r) => (r.id === row.id ? { ...r, yours: row.doc, status: 'match' } : r)) }));
  }
  function useAllDiffering() {
    if (!comparison) return;
    for (const r of comparison.rows) if (r.status === 'differ') onExtracted(r.id, r.doc);
    setComparison((c) => ({ ...c, rows: c.rows.map((r) => (r.status === 'differ' ? { ...r, yours: r.doc, status: 'match' } : r)) }));
  }

  // ---- per-document actions ----
  async function patchDoc(docId, body) {
    const res = await fetch(`/api/applications/${app.id}/upload`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docId, ...body }) });
    const data = await readJson(res);
    if (res.ok) patchLocal({ documents: data.documents });
    else setReadMsg({ type: 'err', text: data.error || 'Could not save.' });
  }
  async function setReviewed(docId, reviewed) {
    setReviewing(docId);
    try {
      await patchDoc(docId, { reviewed });
    } finally {
      setReviewing(null);
    }
  }
  async function removeDoc(docId) {
    const res = await fetch(`/api/applications/${app.id}/upload?docId=${encodeURIComponent(docId)}`, { method: 'DELETE' });
    const data = await readJson(res);
    if (res.ok) {
      patchLocal({ documents: data.documents });
      select(null);
    }
  }

  // ---- what the right-hand pane shows ----
  let pane = null;
  const selKind = sel?.startsWith('item=') ? 'item' : sel?.startsWith('doc=') ? 'doc' : sel;
  const selId = sel?.includes('=') ? sel.slice(sel.indexOf('=') + 1) : null;

  if (selKind === 'item') {
    const [itemId, docPick] = selId.split('|file=');
    const item = checklist.find((c) => c.id === itemId);
    if (item) {
      const files = itemDocs(item);
      const current = files.find((f) => f.id === docPick) || files.slice().sort((a, b) => (RANKV(b) - RANKV(a)))[0];
      pane = {
        title: item.label,
        eyebrow: /^\d/.test(item.code) ? item.code : item.source || 'IRCC',
        tr: item.tr,
        body: (
          <>
            {files.length > 1 && (
              <div className="seg" role="group" aria-label="Files for this item">
                {files.map((f) => (
                  <button key={f.id} type="button" aria-pressed={f.id === current.id} onClick={() => select(`item=${item.id}|file=${f.id}`)} title={f.filename}>
                    <span className={`dot ${f.verification?.status || 'hollow'}`} aria-hidden="true" /> {f.filename.length > 28 ? `${f.filename.slice(0, 26)}…` : f.filename}
                  </button>
                ))}
              </div>
            )}
            {current ? (
              <>
                {files.length === 1 && <div className="small faint" style={{ overflowWrap: 'anywhere' }}><FileText size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {current.filename}</div>}
                <DocDetail
                  driveOn={driveOn}
                  app={app}
                  doc={current}
                  staff={staff}
                  tr={item.tr}
                  reviewing={reviewing === current.id}
                  onReview={(r) => setReviewed(current.id, r)}
                  onCategory={(c) => patchDoc(current.id, { category: c })}
                  onRemove={() => removeDoc(current.id)}
                  patchLocal={staff ? patchLocal : null}
                  viewer={viewer}
                />
              </>
            ) : item.party === 'firm' ? (
              <div className="status-strip none">
                <FolderCog size={18} aria-hidden="true" />
                <div>
                  <div className="strong">Prepared by the firm</div>
                  <div className="small">{item.hint || 'The team prepares this document; it is produced with the final files.'}</div>
                </div>
              </div>
            ) : (
              <>
                <div className={`status-strip ${item.optional ? 'none' : 'orange'}`}>
                  <CircleDashed size={18} aria-hidden="true" />
                  <div>
                    <div className="strong">{item.optional ? 'Only if it applies' : 'Missing'}</div>
                    <div className="small">
                      {item.cond ? <em>{item.cond}. </em> : null}
                      {item.hint || (item.party === 'ircc' ? `Listed by IRCC (${item.source}). The firm's checklist doesn't cover it.` : '')}
                      {item.tr ? ' Needs the certified translation bundle: translation with seal, certified copy and the original, in one PDF.' : ''}
                    </div>
                  </div>
                </div>
                <UploadBox
                  app={app}
                  patchLocal={patchLocal}
                  compact
                  hint={/^\d/.test(item.code) ? `Files are renamed to “${item.code} - …” so they land in this box.` : undefined}
                  rename={(f) => nameFor(item, firstName, f)}
                />
              </>
            )}
          </>
        ),
      };
    }
  } else if (selKind === 'doc') {
    const d = docById.get(selId);
    if (d) {
      pane = {
        title: d.filename,
        eyebrow: 'Not matched to a checklist item',
        body: (
          <>
            <p className="small muted" style={{ margin: 0 }}>Rename the file with its checklist code (e.g. “113 - …”) or set its type below so it counts for the right item.</p>
            <DocDetail driveOn={driveOn} app={app} doc={d} staff={staff} reviewing={reviewing === d.id} onReview={(r) => setReviewed(d.id, r)} onCategory={(c) => patchDoc(d.id, { category: c })} onRemove={() => removeDoc(d.id)} patchLocal={staff ? patchLocal : null} viewer={viewer} />
          </>
        ),
      };
    }
  } else if (selKind === 'compare' && comparison) {
    pane = { title: 'What the documents say', eyebrow: 'Reading result', body: <Comparison comparison={comparison} onUse={useDoc} onUseAll={useAllDiffering} /> };
  }
  if (!pane) {
    pane = {
      title: 'Documents summary',
      eyebrow: service.service ? `Checklist ${service.service}` : 'Checklist',
      body: <Summary app={app} progress={progress} staff={staff} onFilter={setFilter} onRead={(all) => extract(Boolean(all))} extracting={extracting} hasComparison={Boolean(comparison)} openComparison={() => select('compare')} patchLocal={patchLocal} viewer={viewer} openDoc={openDoc} />,
    };
  }

  const readingLabel = job
    ? job.phase === 'checking'
      ? `Checking document ${Math.min((job.checkDone || 0) + 1, job.checkTotal || 1)} of ${job.checkTotal || 0}${job.checkCurrent ? ` — ${job.checkCurrent}` : ''}: translation, dates, names, completeness.`
      : `Reading ${job.docCount || ''} document(s) — part ${Math.min((job.done || 0) + 1, job.total || 1)} of ${job.total || '…'}${job.failed ? ` · ${job.failed} part(s) failed` : ''}.`
    : 'Starting…';
  const readingValue = job
    ? job.phase === 'checking'
      ? job.checkTotal ? (job.checkDone || 0) / job.checkTotal : null
      : job.total ? job.done / job.total : null
    : null;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Documents</h1>
          <p className="muted small">
            {progress.documents.provided} of {progress.documents.required} required provided · {docs.length} file{docs.length === 1 ? '' : 's'}
            {progress.check.unread ? ` · ${progress.check.unread} not read yet` : ''}
          </p>
        </div>
        <div className="btn-row">
          {staff && docs.length > 0 && (
            <div className="cluster" style={{ gap: 6 }}>
              <label htmlFor="readFor" className="small faint" style={{ margin: 0, fontWeight: 500 }}>Reading for</label>
              <input id="readFor" value={readFor} onChange={(e) => setReadFor(e.target.value)} placeholder="First name" style={{ width: 130, padding: '6px 9px' }} disabled={extracting} title="The applicant this file is for, as in the file names. Other family members' documents only fill their own sections." />
            </div>
          )}
          <button type="button" className="btn-navy" onClick={() => extract(false)} disabled={extracting || !docs.length}>
            {extracting ? <span className="spinner" /> : <Sparkles size={16} aria-hidden="true" />} Read &amp; check
          </button>
          <button type="button" onClick={() => setAddOpen(true)}>
            <Plus size={16} aria-hidden="true" /> Add documents
          </button>
        </div>
      </div>

      {extracting && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <span className="spinner dark" aria-hidden="true" />
          <div className="grow">
            <ProgressBar value={readingValue} label={`${readingLabel} You can keep working.`} />
          </div>
        </div>
      )}
      {readMsg && (
        <div className={`alert ${readMsg.type === 'err' ? 'err' : readMsg.type === 'ok' ? 'ok' : 'info'}`}>
          <span style={{ flex: 1 }}>{readMsg.text}</span>
          {comparison && selKind !== 'compare' && <button type="button" className="btn-secondary btn-sm" onClick={() => select('compare')}>Show what was read</button>}
          <button type="button" className="icon-btn" onClick={() => setReadMsg(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="docs-bar">
        <div className="seg" role="group" aria-label="Filter">
          {[
            ['all', 'All'],
            ['missing', 'Missing', counts.missing],
            ['problems', 'Problems', counts.problems],
            ...(staff ? [['sign', 'To sign off', counts.sign]] : []),
          ].map(([k, l, n]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}{n != null ? <span className="count"> {n}</span> : null}
            </button>
          ))}
        </div>
        <div className="grow" />
        <div className="input-icon" style={{ width: 240, maxWidth: '100%' }}>
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents" aria-label="Search documents" style={{ padding: '7px 10px 7px 32px' }} />
        </div>
      </div>

      <div className={`docs${sel ? ' has-sel' : ''}`}>
        <div className="docs-list" role="list" aria-label="Checklist">
          {groups.map((g) => (
            <div key={g.party} role="presentation">
              <div className="grp">
                <span>{g.title}</span>
                <span>{g.rows.filter((r) => r.c.provided).length}/{g.rows.length}</span>
              </div>
              {g.rows.map(({ c, files }) => {
                const worst = worstStatus(files);
                const missing = !c.provided && c.party !== 'firm';
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="listitem"
                    className={`doc-row${sel?.startsWith(`item=${c.id}`) ? ' sel' : ''}${missing ? ' missing' : ''}`}
                    onClick={() => select(`item=${c.id}`)}
                  >
                    <span className="st" aria-hidden="true">
                      {c.party === 'firm' && !files.length ? <FolderCog size={15} className="faint" /> : <span className={`dot ${worst || (c.provided ? 'green' : 'hollow')}`} style={c.provided && !worst ? { background: 'var(--line-strong)' } : c.optional && !c.provided ? { borderStyle: 'dashed' } : undefined} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="lbl">
                        {/^\d/.test(c.code) ? <span className="code">{c.code}</span> : <span className="chip code" style={{ marginRight: 6 }}>{c.source || 'IRCC'}</span>}
                        {c.label}
                      </span>
                      <span className="files">
                        {files.length
                          ? files.map((f) => (
                              <span key={f.id}>
                                {f.filename}
                                {f.verification?.reviewedBy ? <span className="faint">· signed off</span> : null}
                                {staff && noteCount(f.id) ? <span className="note-flag" title={`${noteCount(f.id)} note(s)`}><StickyNote size={11} aria-hidden="true" /> {noteCount(f.id)}</span> : null}
                              </span>
                            ))
                          : <span className="faint">{c.party === 'firm' ? 'Firm prepares' : c.optional ? 'If applicable' : c.cond || 'Missing'}</span>}
                      </span>
                    </span>
                    <span>
                      {worst ? <span className={`chip ${CHECK[worst].cls}`}>{CHECK[worst].label}</span> : c.tr ? <span className="chip outline" title="Certified translation bundle required">TR</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          {looseShown.length > 0 && (
            <div role="presentation">
              <div className="grp"><span>Other files</span><span>{looseShown.length}</span></div>
              {looseShown.map((d) => (
                <button key={d.id} type="button" role="listitem" className={`doc-row${sel === `doc=${d.id}` ? ' sel' : ''}`} onClick={() => select(`doc=${d.id}`)}>
                  <span className="st" aria-hidden="true"><span className={`dot ${d.verification?.status || 'hollow'}`} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span className="lbl" style={{ overflowWrap: 'anywhere' }}>{d.filename}</span>
                    <span className="files"><span className="faint">{d.category ? CATEGORY_LABELS[d.category] || d.category : 'Type not detected yet'}</span></span>
                  </span>
                  <span>{d.verification?.status ? <span className={`chip ${CHECK[d.verification.status].cls}`}>{CHECK[d.verification.status].label}</span> : null}</span>
                </button>
              ))}
            </div>
          )}
          {!groups.length && !looseShown.length && (
            <div className="empty small">
              <ListChecks size={26} aria-hidden="true" />
              <p style={{ marginTop: 8 }}>{docs.length || filter !== 'all' || q ? 'Nothing matches this filter.' : 'No documents yet.'}</p>
              {(filter !== 'all' || q) && <button type="button" className="btn-secondary btn-sm" onClick={() => { setFilter('all'); setQuery(''); }}>Show everything</button>}
            </div>
          )}
        </div>

        <section className="docs-pane" aria-label="Details">
          <div className="pane-head">
            <button type="button" className="icon-btn pane-back" onClick={() => select(null)} aria-label="Back to the list"><ArrowLeft size={18} /></button>
            <div className="grow">
              <div className="eyebrow">{pane.eyebrow}</div>
              <h2>
                {pane.title}
                {pane.tr ? <span className="chip outline" style={{ marginLeft: 8, verticalAlign: '2px' }} title="Certified translation bundle required">TR</span> : null}
              </h2>
            </div>
            {sel && <button type="button" className="icon-btn pane-close" onClick={() => select(null)} aria-label="Close"><X size={17} /></button>}
          </div>
          <div className="pane-body">{pane.body}</div>
        </section>
      </div>

      <AddDocuments
        app={app}
        patchLocal={patchLocal}
        staff={staff}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onImported={() => { setAddOpen(false); extract(false); }}
        onUploaded={() => {}}
      />
    </div>
  );
}

const RANKS = { red: 4, orange: 3, yellow: 2, green: 1 };
function RANKV(d) {
  return RANKS[d.verification?.status] || 0;
}

/** Shown when nothing is selected: the check at a glance, reading, and IRCC's current requirements. */
function Summary({ app, progress: p, staff, onFilter, onRead, extracting, hasComparison, openComparison, patchLocal, viewer, openDoc }) {
  const docs = app.documents || [];
  const readAt = docs.map((d) => d.extractedAt).filter(Boolean).sort().pop();
  return (
    <>
      <section className="stack-sm" aria-label="Document check">
        <h3 style={{ margin: 0 }}>Accuracy check</h3>
        <div className="cluster">
          {['red', 'orange', 'yellow', 'green'].map((k) => (
            <button key={k} type="button" className="btn-secondary btn-sm" onClick={() => onFilter(k === 'green' ? 'all' : 'problems')}>
              <span className={`dot ${k}`} aria-hidden="true" /> {p.check[k] || 0} {CHECK[k].label.toLowerCase()}
            </button>
          ))}
          {p.check.unchecked > 0 && <span className="small faint">{p.check.unchecked} not checked yet</span>}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Every document is read by two independent models and checked for translation errors, dates (Persian ↔ Gregorian),
          names, typos, vague statements and missing parts of the translation bundle. Select a document to see why it got its colour.
        </p>
        <div className="cluster">
          <button type="button" className="btn-secondary btn-sm" onClick={() => onRead(false)} disabled={extracting || !docs.length}>
            <Sparkles size={14} aria-hidden="true" /> {readAt ? 'Read new files' : 'Read & check now'}
          </button>
          {hasComparison && <button type="button" className="btn-ghost btn-sm" onClick={openComparison}>What the documents say</button>}
          {readAt && <span className="small faint">Last read {fmtTime(readAt)}</span>}
        </div>
      </section>

      {p.documents.missing.length > 0 && (
        <section className="stack-sm" aria-label="Missing">
          <h3 style={{ margin: 0 }}>Still missing ({p.documents.missing.length})</h3>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 3 }}>
            {p.documents.missing.slice(0, 8).map((m) => (
              <li key={m.id}><span className="mono faint">{/^\d/.test(m.code) ? m.code : m.source}</span> {m.label}</li>
            ))}
          </ul>
          {p.documents.missing.length > 8 && <button type="button" className="btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => onFilter('missing')}>Show all missing</button>}
        </section>
      )}

      {staff && (
        <section aria-label="Notes" className="stack-sm">
          <h3 style={{ margin: 0 }}>Notes on documents</h3>
          <NotesFeed app={app} viewer={viewer} patchLocal={patchLocal} only="documents" onOpen={(n) => openDoc(n.docId)} empty="No notes on documents yet — add one next to “I checked this document”." />
          <NotesBox app={app} patchLocal={patchLocal} viewer={viewer} section="documents" title="Notes on the documents in general" placeholder="e.g. The client will send the police certificate after 10 October." compact />
        </section>
      )}

      <section aria-label="IRCC requirements" className="stack-sm">
        <h3 style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}><Landmark size={14} aria-hidden="true" /> IRCC&apos;s current requirements</h3>
        <IrccRequirements app={app} patchLocal={patchLocal} bare />
      </section>

      {staff && (
        <p className="small faint" style={{ margin: 0 }}>
          <RotateCcw size={12} aria-hidden="true" style={{ verticalAlign: '-1px' }} /> To read every file again (for example after renaming files), use{' '}
          <a href="#" onClick={(e) => { e.preventDefault(); onRead(true); }}>re-read all documents</a>.
        </p>
      )}
    </>
  );
}

/** The reading result: what was filled, what matches, and what differs. */
function Comparison({ comparison, onUse, onUseAll }) {
  const differ = comparison.rows.filter((r) => r.status === 'differ').length;
  return (
    <>
      {comparison.rows.length > 0 && (
        <>
          <div className="spread">
            <p className="small muted" style={{ margin: 0 }}>Empty fields were filled automatically. Where the documents disagree with what was entered, choose which to keep.</p>
            {differ > 0 && <button type="button" className="btn-secondary btn-sm" onClick={onUseAll}>Use all document values ({differ})</button>}
          </div>
          <div className="tbl-wrap" style={{ border: '1px solid var(--line)', borderRadius: 8 }}>
            <table className="cmp">
              <thead>
                <tr><th>Field</th><th>Entered</th><th>In the documents</th><th>Source</th><th /></tr>
              </thead>
              <tbody>
                {comparison.rows.map((r) => (
                  <tr key={r.id} className={r.status === 'differ' ? 'row-differ' : ''}>
                    <td>{r.label}</td>
                    <td className="muted">{r.yours || <span className="faint">empty</span>}</td>
                    <td className="strong">
                      {r.doc}{' '}
                      {r.conf && r.conf !== 'high' && <span className={`chip ${r.conf === 'low' ? 'danger' : 'warn'}`}>{r.conf} confidence</span>}
                    </td>
                    <td className="small muted">{r.source || '—'}</td>
                    <td className="nowrap">
                      {r.status === 'added' && <span className="chip ok">Filled</span>}
                      {r.status === 'match' && <span className="chip">Same</span>}
                      {r.status === 'differ' && <button type="button" className="btn-secondary btn-sm" onClick={() => onUse(r)}>Use this</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {comparison.notes?.length > 0 && (
        <section>
          <h3>Notes from the documents</h3>
          <ul className="small muted" style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
            {comparison.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </section>
      )}
      <p className="small faint" style={{ margin: 0 }}>Always verify against the original documents.</p>
    </>
  );
}
