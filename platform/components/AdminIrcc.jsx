'use client';

import { useEffect, useRef, useState } from 'react';

const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * Admin: every IRCC checklist and visa office instruction the platform tracks
 * — version, last check, and what changed — with "Check IRCC now".
 */
export default function AdminIrcc() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const timer = useRef(null);

  const load = async () => {
    clearTimeout(timer.current);
    try {
      const res = await fetch('/api/admin/ircc');
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Could not load.');
      setData(d);
      setErr('');
      if (d.checking) timer.current = setTimeout(load, 4000);
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    load();
    return () => clearTimeout(timer.current);
  }, []);

  async function checkNow() {
    setErr('');
    const res = await fetch('/api/admin/ircc', { method: 'POST' });
    if (!res.ok) setErr('Could not start the check.');
    setData((d) => ({ ...(d || { sources: [] }), checking: true }));
    timer.current = setTimeout(load, 1500);
  }

  const sources = data?.sources || [];
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>IRCC checklists</h2>
        <button onClick={checkNow} disabled={data?.checking}>
          {data?.checking ? <><span className="spinner" /> Checking IRCC…</> : 'Check IRCC now'}
        </button>
      </div>
      <p className="muted small">
        The general document checklists (IMM 5484, 5483, 5488, 5555, 5556, 5558) and the visa office
        instructions for every country a client has applied from. Each is re-checked at least daily
        when a file needs it; a changed checklist is read again and the documents it adds or drops are
        listed here and on the files it affects.
      </p>
      {err && <div className="alert err">{err}</div>}
      {!sources.length && !data?.checking && <p className="muted">Nothing checked yet — press “Check IRCC now”.</p>}
      {sources.map((s) => (
        <details key={s.id} className="row" style={{ display: 'block' }}>
          <summary style={{ cursor: 'pointer' }}>
            <strong>{s.code ? `${s.code} — ` : ''}{s.title}</strong>{' '}
            <span className="muted small">
              · version {s.version || '—'} · checked {s.checking ? 'now…' : when(s.checkedAt)} · {s.items.length} documents
              {s.changes[0] ? ` · last change ${when(s.changes[0].at)}` : ''}
            </span>
            {s.error && <span className="chip danger" style={{ marginLeft: 6 }}>check failed</span>}
          </summary>
          <div className="small" style={{ margin: '8px 0 4px 16px' }}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>
            {s.documents.filter((d) => d.url !== s.url).map((d) => (
              <div key={d.url}><a href={d.url} target="_blank" rel="noreferrer">{d.title}</a></div>
            ))}
            {s.visaOffice && <div>Visa office: {s.visaOffice}</div>}
            {s.error && <div style={{ color: 'var(--danger)' }}>{s.error}</div>}
            {s.changes.length > 0 && (
              <>
                <div style={{ fontWeight: 700, marginTop: 8 }}>Changes</div>
                <ul style={{ paddingLeft: 18 }}>
                  {s.changes.map((c, i) => (
                    <li key={i}>
                      {when(c.at)}{c.version ? ` (version ${c.version})` : ''}:{' '}
                      {c.added.length ? `new — ${c.added.join('; ')}` : ''}
                      {c.added.length && c.removed.length ? ' · ' : ''}
                      {c.removed.length ? `removed — ${c.removed.join('; ')}` : ''}
                      {!c.added.length && !c.removed.length ? 'wording changed, same documents' : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div style={{ fontWeight: 700, marginTop: 8 }}>Documents IRCC lists</div>
            <ul style={{ paddingLeft: 18 }}>
              {s.items.map((it, i) => (
                <li key={i}>
                  <strong>{it.document}</strong>{it.condition ? <em> — {it.condition}</em> : null}
                  {it.details ? <div className="muted">{it.details}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}
    </div>
  );
}
