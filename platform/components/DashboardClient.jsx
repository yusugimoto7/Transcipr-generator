'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STATUS_LABEL = {
  draft: { label: 'Draft', cls: '' },
  'in-progress': { label: 'In progress', cls: 'warn' },
  ready: { label: 'Ready', cls: 'ok' },
};

export default function DashboardClient({ initialApps, userName }) {
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [busy, setBusy] = useState(false);

  async function createApp() {
    setBusy(true);
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'study-permit', title: 'Study Permit Application' }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/application/${data.application.id}`);
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <h1>Your applications</h1>
          <p className="muted">
            {userName ? `Hi ${userName.split(' ')[0]}. ` : ''}
            Create and manage your Canadian immigration applications.
          </p>
        </div>
        <button onClick={createApp} disabled={busy}>
          {busy ? <span className="spinner" /> : '+ New study permit'}
        </button>
      </div>

      {apps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 44 }}>
          <div style={{ fontSize: 34 }}>🍁</div>
          <h2 style={{ marginTop: 8 }}>Start your first application</h2>
          <p className="muted" style={{ maxWidth: 460, margin: '0 auto 16px' }}>
            We currently support the <strong>Study Permit</strong> (single applicant). Upload your
            documents, let AI pre-fill your intake, and generate your forms and supporting letters.
          </p>
          <button onClick={createApp} disabled={busy}>Create study permit application</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {apps.map((a) => {
            const s = STATUS_LABEL[a.status] || STATUS_LABEL.draft;
            return (
              <Link key={a.id} href={`/application/${a.id}`} className="appcard">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{a.title}</div>
                    <div className="muted small" style={{ marginTop: 2 }}>
                      Study Permit · updated {new Date(a.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`chip ${s.cls}`}>{s.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
