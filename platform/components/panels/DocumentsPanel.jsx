'use client';

import { useState, useRef, useEffect } from 'react';
import { checklistStatus } from '@/lib/checklist';
import { getAppType } from '@/lib/appTypes';
import DriveImport from '@/components/DriveImport';
import ProgressBar from '@/components/ProgressBar';
import { everyField } from '@/lib/schema';

const FIELD_LABELS = Object.fromEntries(everyField().map((f) => [f.id, f.label]));

/**
 * Parse a JSON response. A proxy or crash page (HTML) gets a readable message
 * instead of "Unexpected token '<'".
 */
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

const OWNER_LABELS = { spouse: 'the spouse', child: 'a child', parent: 'a parent', host: 'the host', sponsor: 'a sponsor', other: 'someone else' };

const CATEGORY_LABELS = {
  passport: 'Passport',
  loa: 'Letter of Acceptance',
  pal: 'Provincial Attestation Letter',
  'proof-of-funds': 'My bank statement',
  'source-of-funds': 'Source of my money',
  'affidavit-support': 'Affidavit of support',
  'title-deeds': 'My title deeds',
  'supporter-bank': "Supporter's bank statements",
  'supporter-income': "Supporter's pay slips / employment",
  'supporter-deeds': "Supporter's title deeds",
  'supporter-id': "Supporter's birth certificate / ID",
  gic: 'GIC certificate',
  deposit: 'Tuition deposit / receipt',
  photo: 'Photo',
  transcripts: 'Degree & transcripts',
  certificates: 'Certificates',
  cv: 'CV / résumé',
  'national-id': 'Birth certificate / national ID',
  language: 'Language test result',
  sop: 'Statement of Purpose',
  'employment-letter': 'Employment letter',
  'job-offer': 'Job offer letter',
  'leave-of-absence': 'Leave of absence letter',
  internship: 'Internship certificate',
  'ties-docs': 'Ties to home country docs',
  'police-clearance': 'Police clearance',
  military: 'Military service card',
  flight: 'Flight reservation',
  accommodation: 'Accommodation',
  medical: 'Medical exam',
  'family-info': 'Family information',
  'marriage-cert': 'Marriage certificate',
  'spouse-status': "Spouse's permit in Canada",
  'inviter-docs': "Spouse's / inviter's documents (employment, income, lease)",
  'host-docs': "Host's status & documents",
  'invitation-letter': 'Invitation letter',
  'status-in-canada': 'My current permit in Canada',
  'last-entry': 'Proof of last entry to Canada',
  'completion-letter': 'Completion of studies letter',
  'consent-letter': "Parents' consent letter",
  'custody-doc': 'Custody / guardianship document',
  'refusal-letter': 'Previous refusal / GCMS notes / old application',
  insurance: 'Social insurance records',
  'travel-history': 'Previous visas & travel history',
  'enrolment-letter': 'Enrolment letter / school enrolment certificate',
  'residence-abroad': 'Residence in another country',
  'relationship-proof': 'Proof of relationship to the inviter',
  'medical-insurance': 'Medical insurance (Super Visa)',
  scholarship: 'Funding / scholarship letter',
  'co-op-letter': 'Co-op letter',
  'research-proposal': 'Research proposal',
  'business-docs': 'Business documents (registration, licences)',
  'business-financials': 'Business financial statements & tax returns',
  'business-contracts': 'Business contracts & partnership agreements',
  'business-employees': 'Business employees & employment contracts',
  'business-premises': 'Business premises (deeds / leases)',
  'business-plan': 'Canadian business plan & job offer',
  questionnaire: 'Questionnaire (111 SOP / POT) — used to write the letter',
  'rep-form': 'IRCC form (IMM 5476, 5713…)',
  internal: 'Internal / intake form (never compiled)',
  other: 'Other',
};

const ACCEPT = ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp'];

function accepted(file) {
  const name = (file.name || '').toLowerCase();
  return ACCEPT.some((ext) => name.endsWith(ext));
}

export default function DocumentsPanel({ app, patchLocal, onExtracted, goIntake, staff }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState(null); // running read job: { done, total, docCount }
  const [readMsg, setReadMsg] = useState(null);
  // Whose file this is — a family folder holds several people's documents.
  const [readFor, setReadFor] = useState(app.readFor || '');
  const pollTimer = useRef(null);
  const appRef = useRef(app);
  appRef.current = app;
  const [pending, setPending] = useState([]); // File[] chosen but not yet uploaded
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const docs = app.documents || [];

  const checklist = checklistStatus(app);
  const missing = checklist.filter((c) => !c.provided && c.party !== 'firm');
  const service = getAppType(app.type);
  const groups = [
    ['applicant', 'Applicant'],
    ['principal', 'Spouse / parent / host / sponsor'],
    ['firm', 'Prepared by the firm'],
  ].map(([party, title]) => ({ party, title, items: checklist.filter((c) => c.party === party) })).filter((g) => g.items.length);

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const ok = incoming.filter(accepted);
    const rejected = incoming.length - ok.length;
    setPending((prev) => {
      // De-duplicate by name+size so the same file isn't queued twice.
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      for (const f of ok) {
        const key = `${f.name}:${f.size}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(f);
        }
      }
      return merged;
    });
    if (rejected > 0) {
      setMsg({ type: 'err', text: `${rejected} file(s) skipped — only PDF, DOCX, JPG, PNG, WEBP are allowed.` });
    } else {
      setMsg(null);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer?.files);
  }

  function removePending(idx) {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }

  async function upload() {
    if (!pending.length) {
      setMsg({ type: 'info', text: 'Add one or more files first.' });
      return;
    }
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    for (const f of pending) fd.append('files', f);
    try {
      const res = await fetch(`/api/applications/${app.id}/upload`, { method: 'POST', body: fd });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      patchLocal({ documents: data.documents });
      setPending([]);
      if (fileRef.current) fileRef.current.value = '';
      setMsg({
        type: 'ok',
        text: `Uploaded ${data.added.length} file(s). Click "Read with AI & pre-fill" so AI can identify each document and fill your intake.`,
      });
    } catch (e2) {
      setMsg({ type: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  async function removeDoc(docId) {
    const res = await fetch(`/api/applications/${app.id}/upload?docId=${docId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) patchLocal({ documents: data.documents });
  }

  async function setCategory(docId, category) {
    const res = await fetch(`/api/applications/${app.id}/upload`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, category }),
    });
    const data = await res.json();
    if (res.ok) patchLocal({ documents: data.documents });
  }

  // Reading runs as a server job (it can take minutes for a large file):
  // start it, then poll for progress. Resumes if the page is reloaded mid-run.
  async function extract(all = false) {
    setExtracting(true);
    setReadMsg(null);
    setComparison(null);
    setProgress(null);
    try {
      const res = await fetch(`/api/applications/${app.id}/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all, ...(staff && readFor.trim() ? { applicant: readFor.trim() } : {}) }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Could not start reading.');
      setProgress(data.job);
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
        const job = data.job;
        if (!job) throw new Error('Reading was interrupted (the server restarted). Click the button to start again — files already read are skipped.');
        setProgress(job);
        if (job.status === 'running') return poll(0);
        if (job.status === 'failed') throw new Error(job.error || 'Reading failed.');
        applyResult(job.result || {});
        setExtracting(false);
        setProgress(null);
      } catch (e2) {
        // A network blip or a restarting server: keep trying for a while.
        if ((e2.transient || e2 instanceof TypeError) && errors < 8) return poll(errors + 1);
        setReadMsg({ type: 'err', text: e2.message });
        setExtracting(false);
        setProgress(null);
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
          setProgress(data.job);
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
    if (!entries.length) {
      setReadMsg({ type: 'info', text: 'Documents identified. No intake details could be read.' });
      if (data.notes?.length) setComparison({ rows: [], notes: data.notes });
      return;
    }

    const current = appRef.current.data || {}; // latest answers, incl. anything typed while reading
    const rows = [];
    let applied = 0;
    for (const [k, v] of entries) {
      const yours = String(current[k] ?? '');
      let status;
      if (!yours.trim()) {
        onExtracted(k, v); // auto-fill empty fields
        applied++;
        status = 'added';
      } else if (yours === String(v)) {
        status = 'match';
      } else {
        status = 'differ';
      }
      rows.push({ id: k, label: FIELD_LABELS[k] || k, yours, doc: String(v), source: sources[k] || '', conf: conf[k] || '', status });
    }
    setComparison({ rows, notes: data.notes || [] });
    const differ = rows.filter((r) => r.status === 'differ').length;
    setReadMsg({
      type: 'ok',
      text: `Filled ${applied} empty field(s) from the documents. See the comparison below${
        differ ? ` — ${differ} value(s) differ from what is already entered.` : '.'
      }`,
    });
  }


  function useDoc(row) {
    onExtracted(row.id, row.doc);
    setComparison((c) => ({
      ...c,
      rows: c.rows.map((r) => (r.id === row.id ? { ...r, yours: row.doc, status: 'match' } : r)),
    }));
  }

  function useAllDiffering() {
    if (!comparison) return;
    for (const r of comparison.rows) if (r.status === 'differ') onExtracted(r.id, r.doc);
    setComparison((c) => ({
      ...c,
      rows: c.rows.map((r) => (r.status === 'differ' ? { ...r, yours: r.doc, status: 'match' } : r)),
    }));
  }

  return (
    <>
      <div className="card">
        <h2>
          Document checklist{service.service ? <span className="muted small" style={{ fontWeight: 400 }}> · {service.service}</span> : null}
        </h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Name each file with its code and document name (e.g. <em>101-Birth Certificate</em>) — a
          file is matched to its box by the code. <strong>TR</strong> = English translation with the
          translator&apos;s seal + Persian copy with seal + Persian original, in one PDF.
        </p>
        {groups.map((g) => (
          <div key={g.party} style={{ marginTop: 10 }}>
            <div className="small" style={{ fontWeight: 700, margin: '6px 0' }}>{g.title}</div>
            {g.items.map((c) => (
              <div className="row" key={c.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {c.provided ? '✅' : c.party === 'firm' ? '🗂️' : '⬜'}{' '}
                    <span className="muted" style={{ fontWeight: 400 }}>{/^\d/.test(c.code) ? c.code : c.code.toUpperCase()}</span>{' '}
                    {c.label}
                    {c.tr && <span className="chip" style={{ marginLeft: 6 }} title="Certified translation bundle required">TR</span>}
                  </div>
                  {(c.cond || c.hint) && (
                    <div className="muted small">{c.cond ? <em>{c.cond}. </em> : null}{c.hint}</div>
                  )}
                </div>
                <span className={`chip ${c.provided ? 'ok' : c.party === 'firm' ? '' : 'warn'}`}>
                  {c.provided ? 'Provided' : c.party === 'firm' ? 'Firm prepares' : 'Missing'}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="hint-box" style={{ marginTop: 14 }}>
          {missing.length === 0
            ? '🎉 All checklist documents are provided.'
            : `${missing.length} document(s) still missing: ${missing.map((m) => `${m.code} ${m.label}`).join(', ')}.`}
        </div>
      </div>

      {staff && <DriveImport app={app} patchLocal={patchLocal} onImported={() => extract()} />}

      <div className="card">
        <h2>Upload files</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Add as many files as you like — PDF, DOCX, JPG, PNG or WEBP. No need to say what each
          file is; we detect it from the file itself.
        </p>

        <div
          className={`dropzone ${dragOver ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <div style={{ fontSize: 30 }}>📄⬆️</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>
            Drag &amp; drop files here
          </div>
          <div className="muted small">or click to browse — you can select several at once</div>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }}
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {pending.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="muted small" style={{ marginBottom: 6 }}>
              {pending.length} file(s) ready to upload:
            </div>
            {pending.map((f, i) => (
              <div className="row" key={`${f.name}:${f.size}`} style={{ padding: '8px 0' }}>
                <div className="small" style={{ fontWeight: 600 }}>
                  {f.name} <span className="muted">· {(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button className="btn-ghost" onClick={() => removePending(i)}>Remove</button>
              </div>
            ))}
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button onClick={upload} disabled={busy}>
                {busy ? <span className="spinner" /> : `Upload ${pending.length} file(s)`}
              </button>
              <button className="btn-secondary" onClick={() => setPending([])} disabled={busy}>
                Clear
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div className={`alert ${msg.type === 'err' ? 'err' : msg.type === 'ok' ? 'ok' : 'info'}`} style={{ marginTop: 14 }}>
            {msg.text}
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginBottom: 0 }}>Your files ({docs.length})</h2>
          <button className="btn-secondary" onClick={() => extract()} disabled={extracting || !docs.length}>
            {extracting ? <span className="spinner" /> : '✨ Read documents & fill intake'}
          </button>
        </div>
        {staff && docs.length > 0 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
            <label htmlFor="readFor" className="small" style={{ margin: 0, fontWeight: 600 }}>Reading for</label>
            <input
              id="readFor"
              value={readFor}
              onChange={(e) => setReadFor(e.target.value)}
              placeholder="Applicant's name, as in the file names"
              style={{ flex: '1 1 220px', maxWidth: 320, padding: '6px 10px' }}
              disabled={extracting}
            />
            <span className="muted small" style={{ flex: '1 1 260px' }}>
              The applicant this file is for. Other family members&apos; documents only fill their own sections.
            </span>
            {docs.some((d) => d.extractedAt) && !extracting && (
              <a href="#" className="small" onClick={(e) => { e.preventDefault(); extract(true); }}>
                Re-read all documents
              </a>
            )}
          </div>
        )}
        {extracting && progress && (
          <ProgressBar
            value={progress.total ? progress.done / progress.total : null}
            label={`Reading ${progress.docCount} document(s) with AI — part ${Math.min(progress.done + 1, progress.total)} of ${progress.total}${
              progress.failed ? ` · ${progress.failed} part(s) failed` : ''
            }. You can keep working; this page updates when it is done.`}
          />
        )}
        {readMsg && (
          <div className={`alert ${readMsg.type === 'err' ? 'err' : readMsg.type === 'ok' ? 'ok' : 'info'}`} style={{ marginTop: 10 }}>
            {readMsg.text}
          </div>
        )}

        {docs.length === 0 ? (
          <p className="muted small" style={{ marginTop: 12 }}>No files yet.</p>
        ) : (
          <div style={{ marginTop: 8 }}>
            {docs.map((d) => (
              <div className="row" key={d.id}>
                <div>
                  <div style={{ fontWeight: 600 }}>{d.filename}</div>
                  <div className="muted small">
                    {d.category
                      ? `Detected: ${CATEGORY_LABELS[d.category] || d.category}`
                      : 'Not identified yet — run "Read with AI"'}
                    {d.owner && d.owner !== 'applicant' ? ` · ${OWNER_LABELS[d.owner] || 'someone else'}’s document` : ''}{' '}
                    · {(d.size / 1024).toFixed(0)} KB
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <select
                    value={d.category || ''}
                    onChange={(e) => setCategory(d.id, e.target.value)}
                    style={{ width: 190, padding: '6px 8px', fontSize: 12.5 }}
                  >
                    <option value="">— set type —</option>
                    {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                  <button className="btn-ghost" onClick={() => removeDoc(d.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {comparison && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>You entered vs. your documents</h3>
              {comparison.rows.some((r) => r.status === 'differ') && (
                <button className="btn-secondary" onClick={useAllDiffering}>Use all document values</button>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="cmp">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>You entered</th>
                    <th>In your documents</th>
                    <th>Source</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.rows.map((r) => (
                    <tr key={r.id} className={r.status === 'differ' ? 'row-differ' : ''}>
                      <td>{r.label}</td>
                      <td className="muted">{r.yours || <span className="chip">empty</span>}</td>
                      <td style={{ fontWeight: 600 }}>
                        {r.doc}{' '}
                        {r.conf && (
                          <span className={`chip ${r.conf === 'high' ? 'ok' : r.conf === 'low' ? 'danger' : 'warn'}`}>{r.conf}</span>
                        )}
                      </td>
                      <td className="muted small">{r.source || '—'}</td>
                      <td>
                        {r.status === 'added' && <span className="chip ok">added</span>}
                        {r.status === 'match' && <span className="chip">✓</span>}
                        {r.status === 'differ' && <button className="btn-ghost" onClick={() => useDoc(r)}>Use this</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {comparison.notes?.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Notes from your documents</h3>
                <ul className="muted small" style={{ paddingLeft: 18 }}>
                  {comparison.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              </>
            )}
            <p className="muted small" style={{ marginTop: 8 }}>
              Empty fields were filled automatically. Always verify against your original documents.
            </p>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="btn-ghost" onClick={goIntake}>Continue to Intake →</button>
        </div>
      </div>
    </>
  );
}
