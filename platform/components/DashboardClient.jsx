'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { APP_TYPE_LIST, STAGE_LABELS } from '@/lib/appTypes';

const STATUS_LABEL = {
  draft: { label: 'Draft', cls: '' },
  'in-progress': { label: 'In progress', cls: 'warn' },
  ready: { label: 'Ready', cls: 'ok' },
};

const GROUPS = [...new Set(APP_TYPE_LIST.map((t) => t.group))];

export default function DashboardClient({ initialApps, user }) {
  const router = useRouter();
  const [apps] = useState(initialApps);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const [type, setType] = useState('study-permit');
  const [clientNumber, setClientNumber] = useState('');
  const [title, setTitle] = useState('');
  const [applicantRole, setApplicantRole] = useState('main');
  const [representation, setRepresentation] = useState('firm');
  const [err, setErr] = useState('');
  const staff = user?.role === 'admin' || user?.role === 'manager';

  async function createApp() {
    setBusy(true);
    setErr('');
    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, title, clientNumber, applicantRole, representation }),
    });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/application/${data.application.id}`);
    else setErr(data.error || 'Could not create the file.');
  }

  const chosen = APP_TYPE_LIST.find((t) => t.key === type);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 }}>
        <div>
          <h1>{staff ? 'Client files' : 'Your applications'}</h1>
          <p className="muted">
            {user?.name ? `Hi ${user.name.split(' ')[0]}. ` : ''}
            {staff ? 'Files assigned to you. Create a new file for a client, or ask an admin to assign one.' : 'Create and manage your Canadian immigration applications.'}
          </p>
        </div>
        <button onClick={() => setPicker(true)} disabled={busy}>+ New {staff ? 'file' : 'application'}</button>
      </div>

      {apps.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 44 }}>
          <div style={{ fontSize: 34 }}>🍁</div>
          <h2 style={{ marginTop: 8 }}>{staff ? 'No files assigned yet' : 'Start your first application'}</h2>
          <p className="muted" style={{ maxWidth: 520, margin: '0 auto 16px' }}>
            Study permits, spousal open work permits, PGWP, visitor visas and reconsideration requests — upload documents, let AI pre-fill the intake, and generate forms, letters and compiled packages.
          </p>
          <button onClick={() => setPicker(true)} disabled={busy}>Create {staff ? 'a file' : 'an application'}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {apps.map((a) => {
            const s = STATUS_LABEL[a.status] || STATUS_LABEL.draft;
            return (
              <Link key={a.id} href={`/application/${a.id}`} className="appcard">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>
                      {a.clientNumber ? `${a.clientNumber} · ` : ''}{a.title}
                    </div>
                    <div className="muted small" style={{ marginTop: 2 }}>
                      {a.typeTitle}{a.applicantRole && a.applicantRole !== 'main' ? ` (${a.applicantRole})` : ''} · {STAGE_LABELS[a.stage] || 'Collecting documents'} · updated {new Date(a.updatedAt).toLocaleDateString()}
                      {staff && a.assignedTo?.length ? ` · ${a.assignedTo.map((m) => m.name).join(', ')}` : ''}
                    </div>
                  </div>
                  <span className={`chip ${s.cls}`}>{s.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {picker && (
        <div className="modal-overlay" onClick={() => setPicker(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h2 style={{ marginBottom: 4 }}>What kind of application?</h2>
            <p className="muted small">The type decides the intake questions, the IRCC forms, the document checklist, the letters and the compiled packages.</p>
            {GROUPS.map((g) => (
              <div key={g} style={{ marginTop: 12 }}>
                <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>{g}</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {APP_TYPE_LIST.filter((t) => t.group === g).map((t) => (
                    <label key={t.key} className="row" style={{ cursor: 'pointer', fontWeight: 400, border: type === t.key ? '2px solid var(--brand)' : undefined }}>
                      <input type="radio" name="type" checked={type === t.key} onChange={() => setType(t.key)} style={{ width: 16, marginRight: 8 }} />
                      <span>
                        <span style={{ fontWeight: 600 }}>{t.title}</span>
                        <div className="muted small">{t.description}</div>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="grid" style={{ gridTemplateColumns: staff ? '1fr 1fr' : '1fr', gap: 10, marginTop: 14 }}>
              <div className="field"><label>Title (applicant name)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${chosen?.title || ''} — name`} /></div>
              {staff && (
                <>
                  <div className="field"><label>Client file number</label><input value={clientNumber} onChange={(e) => setClientNumber(e.target.value)} placeholder="e.g. S26213" /></div>
                  <div className="field"><label>Applicant role</label>
                    <select value={applicantRole} onChange={(e) => setApplicantRole(e.target.value)}>
                      <option value="main">Main applicant</option>
                      <option value="spouse">Accompanying spouse</option>
                      <option value="child">Dependent child</option>
                    </select>
                  </div>
                  <div className="field"><label>Representation</label>
                    <select value={representation} onChange={(e) => setRepresentation(e.target.value)}>
                      <option value="firm">Represented by the firm (IMM 5476 + Submission Letter)</option>
                      <option value="self">Self-represented</option>
                    </select>
                  </div>
                </>
              )}
            </div>
            {err && <div className="alert err" style={{ marginTop: 10 }}>{err}</div>}
            <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setPicker(false)}>Cancel</button>
              <button onClick={createApp} disabled={busy}>{busy ? <span className="spinner" /> : `Create ${chosen?.title || ''}`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
