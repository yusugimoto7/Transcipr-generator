'use client';

import { useState } from 'react';
import { Mail, RefreshCw, Paperclip, Quote, EyeOff, Eye, ArrowRight } from 'lucide-react';
import { TOPICS } from '@/lib/emails';
import { fmtDay, fmtTime } from '@/lib/format';

/**
 * The client's emails on this file (team only): each message's text, and the
 * facts read from it — grouped by topic, with the words they come from. Facts
 * go into the letter drafts and the readiness review as the client's own
 * statements; a fact the team leaves out does not.
 */
export default function EmailsPanel({ app, patchLocal, onFieldChange, fieldLabel }) {
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const emails = [...(app.emails || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  async function act(body, key) {
    setBusy(key);
    setErr('');
    try {
      const res = await fetch(`/api/applications/${app.id}/emails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed.');
      patchLocal({ emails: d.emails, data: d.data, dataVersion: d.dataVersion });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  }

  const facts = emails.flatMap((e) => (e.analysis?.facts || []).map((f) => ({ ...f, mail: e })));
  const byTopic = Object.keys(TOPICS).map((k) => [k, facts.filter((f) => f.topic === k)]).filter(([, l]) => l.length);
  const conflicts = emails.flatMap((e) => (e.analysis?.conflicts || []).filter((c) => !c.used && String(app.data?.[c.field] ?? '') !== String(c.email)).map((c) => ({ ...c, mail: e })));
  const filled = [...new Set(emails.flatMap((e) => e.analysis?.filled || []))];

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Emails</h1>
          <p className="muted small">
            What the client wrote to the team&apos;s mailbox. Each email is kept here and read for facts that may matter to the application.
            Facts are the client&apos;s own statements: they help the letters and the review, but documents always come first.
          </p>
        </div>
      </div>
      {err && <div className="alert err">{err}</div>}

      {!emails.length && (
        <section className="card">
          <div className="empty">
          <Mail size={28} aria-hidden="true" />
          <h2>No emails yet</h2>
          <p className="muted small">Emails the client sends with the file number (e.g. {app.clientNumber || 'S26281'}) in the subject or text, or from the email on their Odoo card, appear here by themselves.</p>
          </div>
        </section>
      )}

      {conflicts.length > 0 && (
        <section className="card" aria-labelledby="em-conf">
          <h2 id="em-conf">Check these answers</h2>
          <p className="muted small">The email says something different from the intake. Keep the intake, or take the email&apos;s value.</p>
          <div className="em-conf">
            {conflicts.map((c) => (
              <div key={`${c.mail.id}-${c.field}`} className="em-conf-row">
                <span className="lbl">{fieldLabel(c.field) || c.label}</span>
                <span><span className="muted small">Intake</span> {String(app.data?.[c.field] ?? '')}</span>
                <ArrowRight size={14} aria-hidden="true" className="faint" />
                <span><span className="muted small">Email</span> <strong>{String(c.email)}</strong></span>
                <button type="button" className="btn-secondary btn-sm" disabled={busy === `u${c.field}`} onClick={async () => { onFieldChange(c.field, c.email); await act({ action: 'used', emailId: c.mail.id, field: c.field }, `u${c.field}`); }}>
                  Use the email&apos;s value
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {byTopic.length > 0 && (
        <section className="card" aria-labelledby="em-facts">
          <div className="card-head">
            <div>
              <h2 id="em-facts">Facts from the emails</h2>
              <p className="muted small">
                {facts.filter((f) => !f.dismissed).length} facts from {emails.length} email{emails.length === 1 ? '' : 's'}
                {filled.length ? ` · filled in the intake: ${filled.map((f) => fieldLabel(f) || f).join(', ')}` : ''}
              </p>
            </div>
          </div>
          <div className="em-topics">
            {byTopic.map(([k, list]) => (
              <div key={k} className="em-topic">
                <h3>{TOPICS[k]}</h3>
                <ul>
                  {list.map((f) => (
                    <li key={f.id} className={f.dismissed ? 'off' : ''}>
                      <div className="em-fact">
                        <span>{f.text}{f.about && f.about !== 'applicant' ? <span className="chip" style={{ marginLeft: 6 }}>{f.about}</span> : null}</span>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          title={f.dismissed ? 'Use this fact again' : 'Leave this fact out of letters and the review'}
                          disabled={busy === f.id}
                          onClick={() => act({ action: 'dismiss', emailId: f.mail.id, factId: f.id, undo: f.dismissed }, f.id)}
                        >
                          {f.dismissed ? <Eye size={14} aria-hidden="true" /> : <EyeOff size={14} aria-hidden="true" />}
                          <span className="sr-only">{f.dismissed ? 'Use again' : 'Leave out'}</span>
                        </button>
                      </div>
                      {f.quote && <div className="em-quote"><Quote size={12} aria-hidden="true" /> <span dir="auto">{f.quote}</span></div>}
                      <div className="faint small" suppressHydrationWarning>{f.mail.subject || '(no subject)'} · {fmtDay(f.mail.date)}</div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {emails.map((e) => (
        <section key={e.id} className="card em-mail">
          <div className="card-head">
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 16 }}>{e.subject || '(no subject)'}</h2>
              <p className="muted small" suppressHydrationWarning>
                {e.from?.name ? `${e.from.name} <${e.from.address}>` : e.from?.address} · {fmtTime(e.date)}{e.how ? ` · matched by ${e.how}` : ''}
              </p>
            </div>
            <button type="button" className="btn-secondary btn-sm" disabled={busy === e.id} onClick={() => act({ action: 'analyze', emailId: e.id }, e.id)}>
              {busy === e.id ? <span className="spinner" /> : <RefreshCw size={14} aria-hidden="true" />} Read again
            </button>
          </div>
          {e.attachments?.length > 0 && (
            <div className="cluster small" style={{ gap: 6, marginBottom: 8 }}>
              {e.attachments.map((n, i) => <span key={i} className="chip"><Paperclip size={12} aria-hidden="true" /> {n}</span>)}
            </div>
          )}
          {e.analysis?.summary && <p style={{ margin: '0 0 8px' }}>{e.analysis.summary}</p>}
          {!e.analysis && !e.analysisError && <p className="muted small">Not read yet.</p>}
          {e.analysisError && <div className="alert err small">Could not read this email: {e.analysisError}</div>}
          {e.analysis?.requests?.length > 0 && (
            <div className="small" style={{ marginBottom: 8 }}>
              <strong>Asks or promises</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{e.analysis.requests.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}
          <details>
            <summary className="small">The email</summary>
            <div className="em-body" dir="auto">{e.body || '(no text)'}</div>
          </details>
        </section>
      ))}
    </div>
  );
}
