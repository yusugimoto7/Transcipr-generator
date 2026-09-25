'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ProgressBar from '@/components/ProgressBar';
import { getAppType } from '@/lib/appTypes';

function pkgsFor(type) {
  return getAppType(type).packages.map((p) => ({
    pkg: p.key,
    key: `${p.key}-package`,
    title: p.title,
    desc: `One PDF with a table of contents: ${p.sections.map((s) => s.name).join(', ')}.`,
  }));
}

function resultMessage(data) {
  const included = (data.included || []).filter((s) => s.count > 0).map((s) => s.name);
  const missing = (data.included || []).filter((s) => s.count === 0).map((s) => s.name);
  const dropped =
    (data.droppedPages ? ` Removed ${data.droppedPages} blank page(s).` : '') +
    (data.mirroredPages ? ` Removed ${data.mirroredPages} mirrored scan page(s).` : '') +
    (data.rotatedPages ? ` Re-oriented ${data.rotatedPages} page(s).` : '');
  const skippedFiles = (data.skippedFiles || []).length
    ? ` ⚠️ Left out of the PDF (convert to PDF/JPG and re-upload): ${data.skippedFiles.join(', ')}.`
    : '';
  return {
    type: missing.length || skippedFiles ? 'warn' : 'ok',
    text:
      `Compiled ${included.length} section(s): ${included.join(', ')}.${dropped}${skippedFiles}` +
      (missing.length
        ? ` ⚠️ Skipped (no matching documents): ${missing.join(', ')} — set each file's type on the Documents tab, then re-compile.`
        : ''),
  };
}

function progressFor(job) {
  if (!job) return null;
  if (job.status === 'queued') return { value: null, label: 'Waiting for the other package to finish…' };
  const value = job.total ? job.done / job.total : null;
  const what =
    job.phase === 'letters' ? `Drafting ${job.current || 'letters'}`
    : job.phase === 'documents' ? `Preparing ${job.current || 'files'}`
    : job.phase === 'assembling' ? 'Assembling the PDF and table of contents'
    : 'Starting…';
  return { value, label: `${what}${value != null ? ` · ${Math.round(value * 100)}%` : ''}` };
}

export default function CompiledPackages({ app, patchLocal }) {
  const PKGS = pkgsFor(app.type);
  const [jobs, setJobs] = useState({}); // pkg -> job being followed on this page
  const [msgs, setMsgs] = useState({}); // pkg -> { type, text }
  const [cleanPages, setCleanPages] = useState(true);
  const [fixRotation, setFixRotation] = useState(true);
  const timer = useRef(null);
  const following = useRef(new Set());
  const generated = app.generated || [];
  const has = (key) => generated.some((g) => g.key === key);

  const poll = useCallback(
    (errors = 0) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/applications/${app.id}/compile`);
          const d = JSON.parse(await res.text());
          const all = d.jobs || {};
          const next = {};
          for (const pkg of following.current) {
            const job = all[pkg];
            if (!job) {
              following.current.delete(pkg);
              setMsgs((m) => ({ ...m, [pkg]: { type: 'err', text: 'Compiling was interrupted (the server restarted). Press Compile again.' } }));
            } else if (job.status === 'done') {
              following.current.delete(pkg);
              patchLocal({ generated: job.result.generated });
              setMsgs((m) => ({ ...m, [pkg]: resultMessage(job.result) }));
            } else if (job.status === 'failed') {
              following.current.delete(pkg);
              setMsgs((m) => ({ ...m, [pkg]: { type: 'err', text: job.error } }));
            } else {
              next[pkg] = job;
            }
          }
          setJobs(next);
          if (following.current.size) poll(0);
        } catch {
          // A network blip or a restarting server: keep trying for a while.
          if (errors < 8) poll(errors + 1);
        }
      }, 1500);
    },
    [app.id, patchLocal]
  );

  // Pick up packages still compiling when the page is (re)opened.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${app.id}/compile`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const active = Object.values(d.jobs || {}).filter((j) => j.status === 'running' || j.status === 'queued');
        if (!active.length) return;
        active.forEach((j) => following.current.add(j.pkg));
        setJobs(Object.fromEntries(active.map((j) => [j.pkg, j])));
        poll(0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer.current);
    };
  }, [app.id, poll]);

  async function compile(pkg) {
    setMsgs((m) => ({ ...m, [pkg]: null }));
    try {
      const res = await fetch(`/api/applications/${app.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkg, cleanPages, fixRotation }),
      });
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`The server did not answer properly (HTTP ${res.status}) — it may be restarting. Wait a minute and try again.`);
      }
      if (!res.ok) throw new Error(data.error || 'Compilation failed.');
      following.current.add(pkg);
      setJobs((j) => ({ ...j, [pkg]: data.job }));
      poll(0);
    } catch (e) {
      setMsgs((m) => ({ ...m, [pkg]: { type: 'err', text: e.message } }));
    }
  }

  return (
    <div className="card">
      <h2>Compiled packages</h2>
      <p className="muted small" style={{ marginTop: -6 }}>
        Merge your generated documents and uploaded files into single PDFs with a Table of
        Contents — in the same order and section names as a submission-ready package. Upload the
        supporting documents first (Documents tab) so each section has content.
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, margin: '10px 0 2px' }}>
        <input type="checkbox" style={{ width: 16 }} checked={cleanPages} onChange={(e) => setCleanPages(e.target.checked)} />
        <span className="small">Remove blank pages automatically</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, margin: '2px 0' }}>
        <input type="checkbox" style={{ width: 16 }} checked={fixRotation} onChange={(e) => setFixRotation(e.target.checked)} />
        <span className="small">Auto-correct sideways / upside-down scans</span>
      </label>
      <div style={{ marginTop: 10 }}>
        {PKGS.map((p) => {
          const job = jobs[p.pkg];
          const prog = progressFor(job);
          const msg = msgs[p.pkg];
          return (
            <div className="row" key={p.pkg} style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, maxWidth: '70%' }}>
                <div style={{ fontWeight: 600 }}>{p.title}</div>
                <div className="muted small">{p.desc}</div>
                {prog && <ProgressBar value={prog.value} label={prog.label} />}
                {msg && (
                  <div className={`alert ${msg.type === 'err' ? 'err' : msg.type === 'warn' ? 'info' : 'ok'}`} style={{ marginTop: 10, marginBottom: 0 }}>
                    {msg.text}
                  </div>
                )}
              </div>
              <div className="btn-row" style={{ gap: 6 }}>
                {has(p.key) && !job && (
                  <a className="btn btn-secondary" href={`/api/applications/${app.id}/download/${p.key}`}>↓ PDF</a>
                )}
                <button onClick={() => compile(p.pkg)} disabled={Boolean(job)}>
                  {job ? <span className="spinner" /> : has(p.key) ? 'Re-compile' : 'Compile'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
