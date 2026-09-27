'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { fmtTime } from '@/lib/format';

/** Admin → Odoo: the TR Visa project connection, the last sync, and what it did. */
export default function AdminOdoo() {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function load(method = 'GET') {
    setErr('');
    try {
      const res = await fetch('/api/admin/odoo', { method });
      const d = JSON.parse(await res.text());
      if (!res.ok) throw new Error(d.error || 'Could not load.');
      setS(d);
    } catch (e) {
      setErr(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  const r = s?.lastResult;
  return (
    <div className="stack">
      <section className="card">
        <div className="card-head">
          <div>
            <h2>Odoo — {s?.project || 'TR Visa'} project</h2>
            <p className="muted small">
              Each main applicant&apos;s file is linked to their card (by client number, else by name; the most recent card
              when there are several) and takes the card&apos;s number and name. New cards become client files. Odoo is only
              read, never changed. Syncs every 15 minutes.
            </p>
          </div>
          <button type="button" onClick={async () => { setBusy(true); await load('POST'); setBusy(false); }} disabled={busy || !s?.configured}>
            {busy ? <span className="spinner" /> : <RefreshCw size={16} aria-hidden="true" />} Sync with Odoo now
          </button>
        </div>
        {err && <div className="alert err">{err}</div>}
        {!s && !err && <p className="muted small"><span className="spinner dark" /> Loading…</p>}
        {s && !s.configured && (
          <div className="alert info" style={{ display: 'block' }}>
            Not connected. On Render, add <code>ODOO_URL</code>, <code>ODOO_DB</code>, <code>ODOO_USER</code> and <code>ODOO_API_KEY</code>
            (Odoo → My Profile → Account Security → New API Key). See the README, section &ldquo;Odoo&rdquo;.
          </div>
        )}
        {s?.configured && (
          <dl className="kv">
            <dt>Odoo</dt>
            <dd><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a></dd>
            <dt>Last sync</dt>
            <dd suppressHydrationWarning>{s.lastSyncAt ? fmtTime(s.lastSyncAt) : 'Not yet — the first sync runs a few minutes after start-up'}</dd>
            {s.lastError && (<><dt>Problem</dt><dd style={{ color: 'var(--danger)' }}>{s.lastError}</dd></>)}
            {r && !r.error && (
              <>
                <dt>Result</dt>
                <dd>
                  <span className="chip ok"><CheckCircle2 size={13} aria-hidden="true" /> {r.cards} open cards</span>{' '}
                  {r.linked} linked · {r.created} new file(s) · {r.unmatched} file(s) without a matching card
                </dd>
              </>
            )}
          </dl>
        )}
      </section>

      {s?.log?.length > 0 && (
        <section className="card card-flush" aria-labelledby="odoo-log">
          <div className="card-head" style={{ paddingBottom: 12 }}><h2 id="odoo-log">Recent changes from Odoo</h2></div>
          <div>
            {s.log.map((l, i) => (
              <div className="list-row" key={i}>
                <div className="grow small">
                  {l.text}
                  {l.file && <> · <Link href={`/application/${l.file.id}`}>open file</Link></>}
                </div>
                <span className="small faint nowrap" suppressHydrationWarning>{fmtTime(l.at)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
