'use client';

import { useState } from 'react';

export default function ReviewPanel({ app, initialChecklist, patchLocal }) {
  const [checklist] = useState(initialChecklist || []);
  const [review, setReview] = useState(app.review || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function runReview() {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/applications/${app.id}/review`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Review failed.');
      setReview(data.review);
      patchLocal({ review: data.review });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  const scoreColor = (s) => (s >= 75 ? 'ok' : s >= 50 ? 'warn' : 'danger');

  return (
    <>
      <div className="card">
        <h2>Document checklist</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          Personalized for your answers. Upload each item on the Documents tab and tag its type.
        </p>
        <div style={{ marginTop: 8 }}>
          {checklist.map((c) => (
            <div className="row" key={c.key}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {c.uploaded ? '✅ ' : '⬜ '}{c.label}
                </div>
                <div className="muted small">{c.hint}</div>
              </div>
              <span className={`chip ${c.uploaded ? 'ok' : ''}`}>{c.uploaded ? 'Uploaded' : 'Missing'}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ marginBottom: 0 }}>AI readiness review</h2>
          <button onClick={runReview} disabled={busy}>
            {busy ? <span className="spinner" /> : review ? 'Re-run review' : 'Run AI review'}
          </button>
        </div>
        {err && <div className="alert err" style={{ marginTop: 12 }}>{err}</div>}

        {!review ? (
          <p className="muted small" style={{ marginTop: 12 }}>
            Run an AI review to get a readiness score and specific ways to strengthen your file
            before you submit.
          </p>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <div className={`chip ${scoreColor(review.readinessScore)}`} style={{ fontSize: 15, padding: '6px 14px' }}>
                Readiness: {review.readinessScore}/100
              </div>
              <span className="muted small">{new Date(review.generatedAt).toLocaleString()}</span>
            </div>
            <p>{review.summary}</p>

            {review.missingDocuments?.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Still missing</h3>
                <ul style={{ paddingLeft: 18 }}>
                  {review.missingDocuments.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </>
            )}

            {review.weaknesses?.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Fix before submitting</h3>
                <div style={{ display: 'grid', gap: 12, marginTop: 6 }}>
                  {review.weaknesses.map((w, i) => (
                    <div key={i} className={`severity-${w.severity || 'low'}`}>
                      <div style={{ fontWeight: 600 }}>
                        <span className={`chip ${w.severity === 'high' ? 'danger' : w.severity === 'medium' ? 'warn' : ''}`}>
                          {w.severity}
                        </span>{' '}
                        {w.area}: {w.issue}
                      </div>
                      <div className="muted small" style={{ marginTop: 3 }}>→ {w.fix}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {review.strengths?.length > 0 && (
              <>
                <h3 style={{ marginTop: 16 }}>Strengths</h3>
                <ul style={{ paddingLeft: 18 }}>
                  {review.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
