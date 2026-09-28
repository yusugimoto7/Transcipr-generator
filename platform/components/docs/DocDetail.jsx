'use client';

import { useState, useEffect } from 'react';
import { Cloud, CloudUpload, ExternalLink, Download, Trash2, UserCheck, Undo2, CheckCircle2, AlertOctagon, AlertTriangle, Info, CircleDashed, Check, X } from 'lucide-react';
import { CATEGORY_LABELS, OWNER_LABELS } from '@/lib/docLabels';
import { fmtDay } from '@/lib/format';
import { NotesBox } from '@/components/Notes';

// Document check colours (lib/verify.js): green ok · yellow minor · orange attention · red serious.
export const CHECK = {
  green: { label: 'OK', cls: 'ok', icon: CheckCircle2, title: 'Checked — nothing found' },
  yellow: { label: 'Minor', cls: 'minor', icon: Info, title: 'Minor issues — typos or notes' },
  orange: { label: 'Attention', cls: 'warn', icon: AlertTriangle, title: 'Needs attention — see the findings' },
  red: { label: 'Serious', cls: 'danger', icon: AlertOctagon, title: 'Serious problem — fix before submission' },
};
const SEV = { high: 'Serious', medium: 'Attention', low: 'Minor' };
const RANK = { red: 4, orange: 3, yellow: 2, green: 1 };

/** The worst check colour among some documents (for a checklist row). */
export function worstStatus(docs) {
  let best = null;
  for (const d of docs) {
    const s = d.verification?.status;
    if (s && (!best || RANK[s] > RANK[best])) best = s;
  }
  return best;
}

export function CheckChip({ v, showSigned = true }) {
  if (!v?.status) return <span className="chip">Not checked</span>;
  const c = CHECK[v.status] || CHECK.yellow;
  return (
    <span className={`chip ${c.cls}`} title={c.title}>
      <span className={`dot ${v.status}`} aria-hidden="true" /> {c.label}
      {showSigned && v.reviewedBy ? ' · signed off' : ''}
    </span>
  );
}

function Agreement({ f }) {
  if (f.by === 'platform') return <span className="agree plain">Exact check by the platform</span>;
  if (f.unverified) return <span className="agree minor"><AlertTriangle size={12} aria-hidden="true" /> Quoted text not found on the page — possibly invented, confirm by eye</span>;
  if (f.confirmed) return <span className="agree ok"><Check size={12} aria-hidden="true" /> Found by both models</span>;
  if (f.models?.length === 1 && f.confirmed === false) return <span className="agree warn">One model only ({f.models[0]}) — confirm by eye</span>;
  return null;
}

const size = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round((b || 0) / 1024))} KB`);
const date = fmtDay;

/**
 * One uploaded document: what it is, the result of the accuracy check
 * (findings, translation-bundle parts), the staff sign-off and a preview.
 */
export default function DocDetail({ app, doc, staff, tr, onReview, reviewing, onCategory, onRemove, driveOn, patchLocal, viewer }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const v = doc.verification;
  const url = `/api/applications/${app.id}/upload?docId=${encodeURIComponent(doc.id)}`;
  const isPdf = doc.mime === 'application/pdf';
  const isImage = /^image\//.test(doc.mime || '');
  const parts = v?.parts || {};
  const showParts = tr || parts.translation || parts.certifiedCopy || parts.original;
  const c = v?.status ? CHECK[v.status] : null;
  const Icon = c?.icon || CircleDashed;

  const facts = [
    doc.category && `Detected: ${CATEGORY_LABELS[doc.category] || doc.category}`,
    doc.owner && doc.owner !== 'applicant' && `Belongs to ${OWNER_LABELS[doc.owner] || 'someone else'}`,
    size(doc.size),
    doc.source === 'email' ? `Emailed by the client${doc.mailDate ? ` ${date(doc.mailDate)}` : ''}${doc.driveId ? ' · filed on Drive' : ''}` : doc.source === 'drive' ? 'From Google Drive' : `Uploaded ${date(doc.uploadedAt)}`,
  ].filter(Boolean);

  return (
    <>
      <div className="stack-sm">
        <div className={`status-strip ${v?.status || 'none'}`}>
          <Icon size={18} aria-hidden="true" style={{ flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="strong">
              {c ? `${c.label}${v.findings?.length ? ` · ${v.findings.length} finding${v.findings.length === 1 ? '' : 's'}` : ' · nothing found'}` : 'Not checked yet'}
            </div>
            <div className="small">
              {v ? (
                <>
                  {v.documentType ? `${v.documentType}. ` : ''}
                  {v.models?.length ? `Checked by ${v.models.length === 2 ? 'two independent models' : 'one model'} (${v.models.join(' + ')})` : 'Checked'}
                  {v.checkedAt ? ` on ${date(v.checkedAt)}` : ''}.
                  {v.secondModelError ? ` The second model failed (${v.secondModelError}) — check by eye.` : ''}
                </>
              ) : (
                'Click "Read & check" to read this document and check it for errors.'
              )}
            </div>
          </div>
        </div>
        <div className="small muted">{facts.join(' · ')}</div>
        <DriveLine app={app} doc={doc} staff={staff} driveOn={driveOn} />
      </div>

      {v?.findings?.length > 0 && (
        <section aria-label="Findings">
          <h3>Findings</h3>
          <div>
            {v.findings.map((f, i) => (
              <div className="finding" key={i}>
                <span className={`bar ${f.severity}`} aria-hidden="true" />
                <div>
                  <div>{f.text}</div>
                  {f.quote && <div className="quote">“{f.quote}”</div>}
                  <div className="meta">
                    <span className="strong" style={{ color: f.severity === 'high' ? 'var(--danger)' : f.severity === 'medium' ? 'var(--warn)' : 'var(--minor)' }}>{SEV[f.severity] || f.severity}</span>
                    {f.kind && <span>{f.kind.replace(/-/g, ' ')}</span>}
                    {f.page ? <span>page {f.page}</span> : null}
                    <Agreement f={f} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showParts && v && (
        <section aria-label="Translation bundle">
          <h3>Translation bundle</h3>
          <div className="parts">
            {[['translation', 'Certified translation'], ['certifiedCopy', 'Certified copy'], ['original', 'Original scan'], ['translatorSeal', "Translator's seal"]].map(([k, l]) => (
              <div key={k} className={`part ${parts[k] ? 'yes' : 'no'}`}>
                {parts[k] ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />} {l}
              </div>
            ))}
          </div>
          {parts.notes && <p className="small muted" style={{ marginTop: 6 }}>{parts.notes}</p>}
        </section>
      )}

      {staff && (
        <div className="signoff-wrap">
        {v && (
        <div className="signoff">
          {v.reviewedBy ? (
            <>
              <span className="small" style={{ color: 'var(--ok)', fontWeight: 600, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <UserCheck size={16} aria-hidden="true" /> Signed off by {v.reviewedBy} on {date(v.reviewedAt)}
              </span>
              <button type="button" className="btn-secondary btn-sm" onClick={() => onReview(false)} disabled={reviewing}>
                <Undo2 size={14} aria-hidden="true" /> Undo
              </button>
            </>
          ) : (
            <>
              <span className="small muted">Open the document, confirm the findings by eye, then sign it off.</span>
              <button type="button" className="btn-navy btn-sm" onClick={() => onReview(true)} disabled={reviewing}>
                <UserCheck size={14} aria-hidden="true" /> I checked this document
              </button>
            </>
          )}
        </div>
        )}
        {patchLocal && (
          <NotesBox
            app={app}
            patchLocal={patchLocal}
            viewer={viewer}
            section="documents"
            docId={doc.id}
            title="Notes on this document"
            placeholder="e.g. Mr. Hamed approved going ahead with this document as it is."
            compact
          />
        )}
        </div>
      )}

      <section aria-label="Preview">
        <div className="spread" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Preview</h3>
          <div className="btn-row">
            <a className="btn btn-secondary btn-sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /> Open</a>
            <a className="btn btn-secondary btn-sm" href={`${url}&download=1`}><Download size={14} aria-hidden="true" /> Download</a>
          </div>
        </div>
        {isPdf ? (
          <PdfPages app={app} doc={doc} url={url} />
        ) : isImage ? (
          <div className="preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Preview of ${doc.filename}`} loading="lazy" />
          </div>
        ) : (
          <div className="preview"><div className="none">No preview for this file type. Use Open or Download.</div></div>
        )}
      </section>

      <section aria-label="File settings" className="stack-sm">
        <h3 style={{ margin: 0 }}>File</h3>
        <div className="cluster">
          <label htmlFor={`cat-${doc.id}`} className="sr-only">Document type</label>
          <select id={`cat-${doc.id}`} value={doc.category || ''} onChange={(e) => onCategory(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">— set the document type —</option>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          {confirmRemove ? (
            <>
              <span className="small">Remove this file from the platform?{doc.driveId ? ' The copy on Google Drive is kept.' : ''}</span>
              <button type="button" className="btn-sm" onClick={onRemove}>Remove</button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmRemove(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="btn-danger-ghost btn-sm" onClick={() => setConfirmRemove(true)}>
              <Trash2 size={14} aria-hidden="true" /> Remove file
            </button>
          )}
        </div>
      </section>
    </>
  );
}

/** The PDF's pages as pictures (rendered on the server), three at first. */
function PdfPages({ app, doc, url }) {
  const [info, setInfo] = useState(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    let off = false;
    setInfo(null);
    setAll(false);
    fetch(`/api/applications/${app.id}/preview?docId=${encodeURIComponent(doc.id)}&info=1`)
      .then((r) => (r.ok ? r.json() : { pages: 0 }))
      .then((d) => !off && setInfo(d))
      .catch(() => !off && setInfo({ pages: 0 }));
    return () => { off = true; };
  }, [app.id, doc.id]);
  if (!info) return <div className="preview"><div className="none"><span className="spinner dark" /> Loading preview…</div></div>;
  if (!info.pages) {
    return (
      <div className="preview">
        <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title={`Preview of ${doc.filename}`} loading="lazy" />
      </div>
    );
  }
  const shown = all ? info.pages : Math.min(3, info.pages);
  return (
    <div className="stack-sm">
      <div className="pages">
        {Array.from({ length: shown }, (_, i) => (
          <figure key={i} className="page-img">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/applications/${app.id}/preview?docId=${encodeURIComponent(doc.id)}&page=${i + 1}`} alt={`Page ${i + 1} of ${doc.filename}`} loading="lazy" />
            <figcaption>Page {i + 1}{info.total > 1 ? ` of ${info.total}` : ''}</figcaption>
          </figure>
        ))}
      </div>
      {info.pages > shown && (
        <button type="button" className="btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => setAll(true)}>
          Show all {info.pages} pages
        </button>
      )}
      {info.total > info.pages && <p className="small faint" style={{ margin: 0 }}>Showing the first {info.pages} of {info.total} pages. Open the file to see the rest.</p>}
    </div>
  );
}

/** Where the file is kept: on Google Drive (with a link for the team), or still on its way there. */
function DriveLine({ app, doc, staff, driveOn }) {
  if (!driveOn) return null;
  if (doc.driveId) {
    const id = String(doc.driveId).split(':')[0]; // a file inside a zip links to the zip
    const where = doc.drivePath ? doc.drivePath.split('/').slice(0, -1).join(' / ') : '';
    return (
      <div className="small cluster" style={{ gap: 6, color: 'var(--ok)' }}>
        <Cloud size={14} aria-hidden="true" />
        <span>On Google Drive{where ? ` · ${where}` : ''}</span>
        {staff && (
          <a href={`https://drive.google.com/file/d/${encodeURIComponent(id)}/view`} target="_blank" rel="noreferrer" className="cluster" style={{ gap: 3 }}>
            Open in Drive <ExternalLink size={12} aria-hidden="true" />
          </a>
        )}
      </div>
    );
  }
  return (
    <div className="small cluster" style={{ gap: 6, color: app.driveSync?.error ? 'var(--danger)' : 'var(--ink-faint)' }}>
      <CloudUpload size={14} aria-hidden="true" />
      <span>{app.driveSync?.error ? `Not saved to Google Drive yet: ${app.driveSync.error}` : 'Saving to Google Drive…'}</span>
    </div>
  );
}
