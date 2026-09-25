'use client';

import { useEffect, useRef, useState } from 'react';
import { getAppType } from '@/lib/appTypes';

const when = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

/**
 * IRCC's current requirements for this file — the general document checklist
 * and the visa office instructions for the country the client applies from —
 * compared with the firm's checklist. Documents IRCC asks for that the firm's
 * list lacks are added to the file's checklist (the "Also required by IRCC"
 * group). Sources are re-checked on the server at least daily.
 */
export default function IrccRequirements({ app, patchLocal }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const timer = useRef(null);
  const residence = app.data?.countryOfResidence || app.data?.citizenship || '';

  useEffect(() => {
    let cancelled = false;
    let polls = 0;
    const load = async () => {
      try {
        const res = await fetch(`/api/applications/${app.id}/ircc`);
        const text = await res.text();
        const d = JSON.parse(text);
        if (!res.ok) throw new Error(d.error || 'Could not load IRCC requirements.');
        if (cancelled) return;
        setData(d);
        setErr('');
        if (d.application?.ircc) patchLocal({ ircc: d.application.ircc });
        // A check is running on the server: look again shortly (up to ~5 minutes).
        if (d.checking && polls++ < 75) timer.current = setTimeout(load, 4000);
      } catch (e) {
        if (!cancelled) setErr(e.message.startsWith('Unexpected') ? 'IRCC requirements are unavailable right now.' : e.message);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
    // Re-check when the country the client applies from changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.type, residence]);

  if (!data && !err) return null;

  const sources = data?.sources || [];
  const ready = sources.filter((s) => s.itemCount > 0);
  const recent = sources.filter((s) => s.lastChange && Date.now() - new Date(s.lastChange.at).getTime() < 30 * 86400000);
  const needsCountry = !residence && getAppType(app.type).group.includes('outside Canada');

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ marginBottom: 0 }}>IRCC&apos;s current requirements</h2>
        {data?.checking && <span className="small muted"><span className="spinner" style={{ width: 12, height: 12 }} /> Checking IRCC for updates…</span>}
      </div>
      <p className="muted small" style={{ marginTop: 4 }}>
        Read from IRCC&apos;s own checklist and the visa office instructions for the country the
        client applies from, re-checked at least daily. Anything IRCC asks for that the firm&apos;s
        checklist doesn&apos;t cover is added above under &ldquo;Also required by IRCC&rdquo;.
      </p>

      {err && <div className="alert err">{err}</div>}
      {needsCountry && sources.length < 2 && (
        <div className="alert info">Enter the <strong>country of current residence</strong> in the intake to include that country&apos;s visa office instructions.</div>
      )}

      {sources.length > 0 && (
        <table className="cmp" style={{ marginTop: 6 }}>
          <thead>
            <tr><th>Source</th><th>Version</th><th>Checked</th><th>Last change</th></tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.code ? `${s.code} — ` : ''}{s.title}</a>
                  {s.documents?.filter((d) => d.code && d.code !== s.code).map((d) => (
                    <div key={d.url} className="small"><a href={d.url} target="_blank" rel="noreferrer">{d.title}</a></div>
                  ))}
                  {s.visaOffice && <div className="small muted">Visa office: {s.visaOffice}</div>}
                  {s.error && <div className="small" style={{ color: 'var(--danger)' }}>Last check failed: {s.error}</div>}
                </td>
                <td className="small">{s.version || '—'}</td>
                <td className="small">{s.checking ? 'checking…' : when(s.checkedAt)}</td>
                <td className="small">{when(s.changedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {recent.map((s) => (
        <div key={s.id} className="alert info" style={{ marginTop: 10 }}>
          <strong>IRCC updated {s.code || s.title}</strong> on {when(s.lastChange.at)}
          {s.lastChange.added?.length ? <> — new: {s.lastChange.added.join('; ')}</> : null}
          {s.lastChange.removed?.length ? <> — no longer listed: {s.lastChange.removed.join('; ')}</> : null}.
        </div>
      ))}

      {ready.length > 0 && (
        <div className="small" style={{ marginTop: 10 }}>
          <strong>{data.extra.length}</strong> added to this file&apos;s checklist ·{' '}
          <strong>{data.covered.length}</strong> already in the firm&apos;s checklist ·{' '}
          <strong>{data.handled.length}</strong> forms and fees the platform handles
          {data.covered.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary>Already covered by the firm&apos;s checklist</summary>
              <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                {data.covered.map((c, i) => (
                  <li key={i}>
                    {c.document}{c.condition ? <em> ({c.condition})</em> : null} <span className="muted">— {c.source}, covered by {c.coveredBy}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {data.handled.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary>Forms and fees</summary>
              <ul style={{ paddingLeft: 18, marginTop: 4 }}>
                {data.handled.map((c, i) => <li key={i}>{c.document} <span className="muted">— {c.source}</span></li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      {!ready.length && !err && !data?.checking && sources.length > 0 && (
        <p className="small muted">IRCC&apos;s checklists haven&apos;t been read yet — they are checked in the background.</p>
      )}
    </div>
  );
}
