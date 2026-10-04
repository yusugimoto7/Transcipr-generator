'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Copy, Check, Ban, RotateCcw, ChevronDown, Send, ExternalLink, FileDown } from 'lucide-react';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const asText = (v, columns) => {
  if (Array.isArray(v)) return v.map((r) => (columns || Object.keys(r || {}).map((id) => ({ id }))).map((c) => r?.[c.id]).filter((x) => x !== '' && x != null).join(' – ')).join('\n');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v ?? '');
};

/**
 * The client questionnaire, from the team's side: make the client's link and
 * copy it, see how far they are, and when they submit, compare each answer with
 * the intake and accept the ones to keep.
 */
export default function ClientFormBox({ app, fieldLabel, patchLocal }) {
  const [v, setV] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/applications/${app.id}/client-form`);
      if (res.ok) setV(await res.json());
    } catch {
      /* offline */
    }
  }, [app.id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (action, extra = {}) => {
    if (action === 'link' && v?.link && !v.link.revokedAt && !window.confirm('Make a new link? The link the client has now stops working.')) return;
    if (action === 'revoke' && !window.confirm('Turn off the client’s link? They will not be able to open the questionnaire until you make a new link.')) return;
    setBusy(action);
    setErr('');
    try {
      const res = await fetch(`/api/applications/${app.id}/client-form`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Could not do that.');
      setV(d);
      if (action === 'accept') {
        patchLocal?.({ data: d.data, dataVersion: d.dataVersion });
        setPick(new Set());
      }
      if (action === 'link') setOpen(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(v.link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy the link:', v.link.url);
    }
  };

  if (!v) return null;
  const { link, form, review, other, pdf, docx } = v;
  const live = link && !link.revokedAt && !(link.expiresAt && link.expiresAt < new Date().toISOString() && form?.status !== 'submitted');
  const submitted = form?.status === 'submitted';
  const todo = review.filter((r) => !r.same && !r.accepted);
  const pct = Math.round((form?.progress || 0) * 100);

  let state = 'No link yet';
  let tone = '';
  if (submitted) {
    state = todo.length ? `Submitted — ${todo.length} answer${todo.length === 1 ? '' : 's'} to review` : 'Submitted — reviewed';
    tone = todo.length ? 'warn' : 'ok';
  } else if (form) state = `Client is filling it in · ${pct}%`;
  else if (live) state = 'Link made — not opened yet';
  else if (link) state = link.revokedAt ? 'Link turned off' : 'Link expired';

  const toggle = (id) => setPick((s) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  return (
    <details className="card cf-box" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <Send size={15} aria-hidden="true" />
        <strong>Client questionnaire</strong>
        <span className={`chip tiny${tone ? ` ${tone}` : ''}`}>{state}</span>
        <ChevronDown size={15} className="cf-caret" aria-hidden="true" />
      </summary>
      <div className="stack" style={{ gap: 12, marginTop: 10 }}>
        <p className="muted small" style={{ margin: 0 }}>
          A one-page questionnaire (Persian first, with English) covering the Form 124 and 128 questions, for this person only. What the intake already has is filled in for them. They can come back to it with the same link until they confirm and submit; after that it is read-only for them, and their answers wait here for you to accept into the intake.
        </p>

        {live ? (
          <div className="cf-link">
            <input readOnly value={link.url} aria-label="Client link" onFocus={(e) => e.target.select()} dir="ltr" />
            <button type="button" className="btn-secondary btn-sm" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
            <a className="btn btn-secondary btn-sm" href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Open</a>
          </div>
        ) : null}
        {link && (
          <div className="small faint">
            Made {when(link.createdAt)}{link.createdBy?.name ? ` by ${link.createdBy.name}` : ''}
            {link.lastOpenedAt ? ` · last saved by the client ${when(link.lastOpenedAt)}` : ''}
            {live && link.expiresAt && !submitted ? ` · works until ${when(link.expiresAt)}` : ''}
          </div>
        )}
        {form && !submitted && (
          <div className="cluster" style={{ gap: 10, alignItems: 'center' }}>
            <div className="progress" style={{ flex: 1, maxWidth: 260 }}><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            <span className="small">{pct}% · {form.open} answer{form.open === 1 ? '' : 's'} still needed</span>
          </div>
        )}
        {submitted && form.confirmation && (
          <div className="hint-box small">
            Confirmed as true and complete by <strong>{form.confirmation.name}</strong> on {when(form.confirmation.at)}
            {form.confirmation.ip ? <span className="faint"> · {form.confirmation.ip}</span> : null}
          </div>
        )}

        <div className="btn-row">
          <button type="button" className={live ? 'btn-secondary btn-sm' : 'btn-sm'} onClick={() => act('link')} disabled={!!busy}>
            <Link2 size={14} /> {live ? 'New link' : link ? 'Make a new link' : 'Make the client’s link'}
          </button>
          {live && (
            <button type="button" className="btn-danger-ghost btn-sm" onClick={() => act('revoke')} disabled={!!busy}><Ban size={14} /> Turn off link</button>
          )}
          {submitted && pdf && (
            <a className="btn-secondary btn-sm" href={pdf.url} target="_blank" rel="noopener noreferrer" title={pdf.onDrive ? 'Also saved in the client’s folder on Google Drive' : 'Saved on the file; it goes to the client’s Drive folder shortly'}>
              <FileDown size={14} /> Questionnaire PDF{pdf.onDrive ? ' · on Drive' : ''}
            </a>
          )}
          {submitted && docx && (
            <a className="btn-secondary btn-sm" href={docx.url} target="_blank" rel="noopener noreferrer" title={docx.onDrive ? 'Also saved in the client’s folder on Google Drive' : 'Saved on the file; it goes to the client’s Drive folder shortly'}>
              <FileDown size={14} /> Word{docx.onDrive ? ' · on Drive' : ''}
            </a>
          )}
          {submitted && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => act('reopen')} disabled={!!busy} title="Let the client change their answers and submit again">
              <RotateCcw size={14} /> Reopen for the client
            </button>
          )}
        </div>
        {err && <div className="small" style={{ color: 'var(--danger)' }}>{err}</div>}

        {form && review.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="cluster" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <strong className="small">Client answers vs the intake {submitted ? '' : '(still a draft)'}</strong>
              {todo.length > 0 && (
                <div className="btn-row">
                  {pick.size > 0 && (
                    <button type="button" className="btn-sm" onClick={() => act('accept', { ids: [...pick] })} disabled={!!busy}>Accept {pick.size} selected</button>
                  )}
                  <button type="button" className="btn-secondary btn-sm" onClick={() => act('accept', { ids: todo.map((r) => r.id) })} disabled={!!busy}>Accept all {todo.length}</button>
                </div>
              )}
            </div>
            <div className="table-wrap">
              <table className="tbl cf-table">
                <thead>
                  <tr>
                    <th aria-label="Select" />
                    <th>Question</th>
                    <th>Client says</th>
                    <th>Intake now</th>
                  </tr>
                </thead>
                <tbody>
                  {review.map((r) => (
                    <tr key={r.id} className={r.same ? 'same' : ''}>
                      <td>
                        {r.same ? (
                          <span className="faint small" title="Same as the intake">=</span>
                        ) : r.accepted ? (
                          <Check size={15} aria-label="Accepted" style={{ color: 'var(--ok)' }} />
                        ) : (
                          <input type="checkbox" checked={pick.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Accept ${fieldLabel?.(r.id) || r.id}`} />
                        )}
                      </td>
                      <td className="small">{fieldLabel?.(r.id) || r.id}</td>
                      <td className="pre">{r.theirs || <span className="faint">—</span>}</td>
                      <td className="pre faint">{r.now || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {other.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <strong className="small">Other answers (not intake questions — for the letters and the file)</strong>
            <dl className="cf-other">
              {other.map((o) => (
                <div key={o.id}>
                  <dt className="small faint">{o.en}</dt>
                  <dd className="pre">{asText(o.value, o.columns)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </details>
  );
}
