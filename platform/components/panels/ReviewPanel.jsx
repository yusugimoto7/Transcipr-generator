'use client';

import { useState } from 'react';
import { ShieldCheck, RefreshCw, FileQuestion, AlertOctagon, ThumbsUp, ChevronRight } from 'lucide-react';
import { fmtTime } from '@/lib/format';

/**
 * Readiness review: an AI read of the whole file — a score, what is still
 * missing, what to fix before submitting (including the document check's
 * serious findings) and the file's strengths.
 */
export default function ReviewPanel({ app, progress: p, patchLocal, go }) {
  const [review, setReview] = useState(app.review || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function runReview() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/applications/${app.id}/review`, { method: 'POST' });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`The server did not answer properly (HTTP ${res.status}). Wait a minute and try again.`);
      }
      if (!res.ok) throw new Error(data.error || 'Review failed.');
      setReview(data.review);
      patchLocal({ review: data.review });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const score = review?.readinessScore ?? 0;
  const tone = score >= 75 ? 'var(--ok)' : score >= 50 ? '#e07b00' : 'var(--danger)';
  const problems = p.check.red + p.check.orange;

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Readiness review</h1>
          <p className="muted small">An overall read of the file before submission. Run it again after changes.</p>
        </div>
        <button type="button" onClick={runReview} disabled={busy}>
          {busy ? <span className="spinner" /> : review ? <RefreshCw size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
          {busy ? 'Reviewing…' : review ? 'Run again' : 'Run the review'}
        </button>
      </div>
      {err && <div className="alert err" style={{ margin: 0 }}>{err}</div>}

      {(problems > 0 || p.documents.missing.length > 0) && (
        <div className="cluster">
          {problems > 0 && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => go('documents', 'filter=problems')}>
              <span className="dot red" aria-hidden="true" /> {problems} document{problems === 1 ? '' : 's'} with findings <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
          {p.documents.missing.length > 0 && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => go('documents', 'filter=missing')}>
              <FileQuestion size={14} aria-hidden="true" /> {p.documents.missing.length} missing <ChevronRight size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {!review ? (
        <section className="card empty">
          <ShieldCheck size={30} aria-hidden="true" />
          <h2>No review yet</h2>
          <p className="small">The review reads the intake, the documents and the check results, and lists what to fix before submitting.</p>
        </section>
      ) : (
        <>
          <section className="card" aria-label="Score">
            <div className="cluster" style={{ gap: 20, alignItems: 'center', flexWrap: 'nowrap' }}>
              <div className="score" style={{ background: `conic-gradient(${tone} ${score * 3.6}deg, #e5e9f1 0deg)` }} role="img" aria-label={`Readiness ${score} out of 100`}>
                <div className="score-inner">
                  <span className="num">{score}</span>
                  <span className="of">of 100</span>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0 }}>{review.summary}</p>
                <p className="small faint" style={{ margin: '6px 0 0' }} suppressHydrationWarning>Reviewed {fmtTime(review.generatedAt)}</p>
              </div>
            </div>
          </section>

          {review.weaknesses?.length > 0 && (
            <section className="card" aria-labelledby="fix-h">
              <h2 id="fix-h" className="cluster" style={{ gap: 8 }}><AlertOctagon size={18} color="var(--danger)" aria-hidden="true" /> Fix before submitting</h2>
              <div className="stack-sm">
                {review.weaknesses.map((w, i) => (
                  <div key={i} className={`severity-${w.severity || 'low'}`}>
                    <div className="cluster" style={{ gap: 8 }}>
                      <span className={`chip ${w.severity === 'high' ? 'danger' : w.severity === 'medium' ? 'warn' : ''}`}>{w.severity === 'high' ? 'Serious' : w.severity === 'medium' ? 'Attention' : 'Minor'}</span>
                      <span className="strong">{w.area}</span>
                    </div>
                    <div style={{ marginTop: 4 }}>{w.issue}</div>
                    {w.fix && <div className="small muted" style={{ marginTop: 3 }}>→ {w.fix}</div>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="ov" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {review.missingDocuments?.length > 0 && (
              <section className="card" aria-labelledby="miss-h">
                <h2 id="miss-h" className="cluster" style={{ gap: 8 }}><FileQuestion size={18} aria-hidden="true" /> Still missing</h2>
                <ul style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
                  {review.missingDocuments.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </section>
            )}
            {review.strengths?.length > 0 && (
              <section className="card" aria-labelledby="str-h">
                <h2 id="str-h" className="cluster" style={{ gap: 8 }}><ThumbsUp size={18} color="var(--ok)" aria-hidden="true" /> Strengths</h2>
                <ul style={{ paddingLeft: 18, margin: 0, display: 'grid', gap: 4 }}>
                  {review.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
