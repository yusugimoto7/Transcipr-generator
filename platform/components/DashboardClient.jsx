'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, FolderOpen, AlertOctagon, FileQuestion, CheckCircle2, X, ArrowLeft, ChevronRight } from 'lucide-react';
import { APP_TYPE_LIST, TYPE_GROUPS } from '@/lib/appTypes';
import { STAGE_TEXT } from '@/lib/progress';
import { fmtAgo } from '@/lib/format';
import { initials } from '@/components/TopBar';

// Picker order follows the TR team's service groups; any stray group goes last.
const GROUPS = [...new Set([...TYPE_GROUPS, ...APP_TYPE_LIST.map((t) => t.group)])].filter((g) => APP_TYPE_LIST.some((t) => t.group === g));
const STAGE_CHIP = { documents: '', intake: 'info', letter: 'info', final: 'warn', ready: 'ok' };

function Meter({ v }) {
  if (!v) return <span className="faint">—</span>;
  const [a, b] = 'provided' in v ? [v.provided, v.required] : [v.done, v.total];
  return (
    <div style={{ minWidth: 80 }}>
      <div className="small strong">{a}<span className="faint"> / {b}</span></div>
      <div className="meter"><i style={{ width: `${b ? Math.round((a / b) * 100) : 0}%` }} /></div>
    </div>
  );
}

function CheckCell({ c }) {
  if (!c) return <span className="faint">—</span>;
  if (c.red) return <span className="chip danger"><span className="dot red" aria-hidden="true" /> {c.red} serious</span>;
  if (c.orange) return <span className="chip warn"><span className="dot orange" aria-hidden="true" /> {c.orange} attention</span>;
  return <span className="faint small">No problems</span>;
}

export default function DashboardClient({ initialApps, user }) {
  const router = useRouter();
  const staff = user?.role === 'admin' || user?.role === 'manager';
  const [apps] = useState(initialApps);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [quick, setQuick] = useState('all'); // all | serious | missing | ready
  const [picker, setPicker] = useState(false);

  const stats = {
    all: apps.length,
    serious: apps.filter((a) => a.check?.red).length,
    missing: apps.filter((a) => a.docs && a.docs.provided < a.docs.required).length,
    ready: apps.filter((a) => a.stage === 'ready').length,
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return apps
      .filter((a) => !t || [a.title, a.clientNumber, a.typeTitle, a.service, ...a.assignedTo.map((m) => m.name)].join(' ').toLowerCase().includes(t))
      .filter((a) => !group || a.group === group)
      .filter((a) => quick === 'all' || (quick === 'serious' && a.check?.red) || (quick === 'missing' && a.docs && a.docs.provided < a.docs.required) || (quick === 'ready' && a.stage === 'ready'))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }, [apps, q, group, quick]);

  const groupsInUse = GROUPS.filter((g) => apps.some((a) => a.group === g));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{staff ? 'Client files' : 'My applications'}</h1>
          <p className="muted">
            {user?.name ? `Hi ${user.name.split(' ')[0]}. ` : ''}
            {staff ? 'Files you can work on, most recently changed first.' : 'Your Canadian applications with Sugimoto Visa.'}
          </p>
        </div>
        <button type="button" onClick={() => setPicker(true)}>
          <Plus size={16} aria-hidden="true" /> New {staff ? 'file' : 'application'}
        </button>
      </div>

      {apps.length === 0 ? (
        <section className="card empty">
          <FolderOpen size={32} aria-hidden="true" />
          <h2>{staff ? 'No files yet' : 'Start your first application'}</h2>
          <p style={{ maxWidth: 520, margin: '0 auto 16px' }}>
            {staff
              ? 'Create a file for a client, or ask an admin to assign one to you.'
              : 'Choose the kind of application. You can then upload your documents and fill in your details.'}
          </p>
          <button type="button" onClick={() => setPicker(true)}><Plus size={16} aria-hidden="true" /> Create {staff ? 'a file' : 'an application'}</button>
        </section>
      ) : staff ? (
        <>
          <div className="stat-row">
            {[
              ['all', 'All files', FolderOpen, stats.all],
              ['serious', 'Serious findings', AlertOctagon, stats.serious],
              ['missing', 'Missing documents', FileQuestion, stats.missing],
              ['ready', 'Ready to submit', CheckCircle2, stats.ready],
            ].map(([k, l, Icon, n]) => (
              <button key={k} type="button" className={`stat${quick === k ? ' on' : ''}`} onClick={() => setQuick(quick === k && k !== 'all' ? 'all' : k)} aria-pressed={quick === k}>
                <span className="lbl"><Icon size={14} aria-hidden="true" style={k === 'serious' && n ? { color: 'var(--danger)' } : undefined} /> {l}</span>
                <span className="val">{n}</span>
              </button>
            ))}
          </div>

          <section className="card card-flush">
            <div className="filters">
              <div className="input-icon">
                <Search size={15} aria-hidden="true" />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, file number, type or manager" aria-label="Search files" />
              </div>
              <label htmlFor="grp" className="sr-only">Service group</label>
              <select id="grp" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">All services</option>
                {groupsInUse.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              {(q || group || quick !== 'all') && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => { setQ(''); setGroup(''); setQuick('all'); }}>
                  <X size={14} aria-hidden="true" /> Clear
                </button>
              )}
            </div>
            <div className="tbl-wrap">
              <table className="tbl stackable">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Stage</th>
                    <th className="hide-sm">Documents</th>
                    <th>Check</th>
                    <th className="hide-sm">Intake</th>
                    <th className="hide-sm">Team</th>
                    <th className="hide-sm">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((a) => (
                    <tr key={a.id} className="clickable" onClick={() => router.push(`/application/${a.id}`)}>
                      <td>
                        <Link href={`/application/${a.id}`} className="file-cell" style={{ color: 'inherit' }} onClick={(e) => e.stopPropagation()}>
                          <span className="t">{a.clientNumber && <span className="mono faint" style={{ marginRight: 8 }}>{a.clientNumber}</span>}{a.title}</span>
                          <span className="s">{a.typeTitle}{a.service ? ` · ${a.service}` : ''}{a.applicantRole !== 'main' ? ` · ${a.applicantRole}` : ''}</span>
                        </Link>
                      </td>
                      <td><span className={`chip ${STAGE_CHIP[a.stage] || ''}`}>{a.finalStale && a.stage !== 'documents' ? 'Rebuild files' : STAGE_TEXT[a.stage]}</span></td>
                      <td className="hide-sm"><Meter v={a.docs} /></td>
                      <td><CheckCell c={a.check} /></td>
                      <td className="hide-sm"><Meter v={a.intake} /></td>
                      <td className="hide-sm">
                        <div className="people">
                          {a.assignedTo.length ? a.assignedTo.map((m) => <span key={m.id} className="avatar" title={m.name}>{initials(m.name)}</span>) : <span className="faint small">—</span>}
                        </div>
                      </td>
                      <td className="hide-sm small muted nowrap" suppressHydrationWarning>{fmtAgo(a.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!shown.length && <div className="empty small">No files match. <button type="button" className="btn-ghost btn-sm" onClick={() => { setQ(''); setGroup(''); setQuick('all'); }}>Show all</button></div>}
          </section>
        </>
      ) : (
        <div className="stack">
          {shown.map((a) => (
            <Link key={a.id} href={`/application/${a.id}`} className="card" style={{ color: 'inherit', display: 'grid', gap: 12 }}>
              <div className="spread">
                <div>
                  <div className="strong" style={{ fontSize: 16 }}>{a.typeTitle}</div>
                  <div className="small muted">{a.title}{a.clientNumber ? ` · file ${a.clientNumber}` : ''}</div>
                </div>
                <span className="btn btn-secondary btn-sm">Continue <ChevronRight size={14} aria-hidden="true" /></span>
              </div>
              <div className="cluster" style={{ gap: 28 }}>
                <div><div className="tiny faint">Documents</div><Meter v={a.docs} /></div>
                <div><div className="tiny faint">Your details</div><Meter v={a.intake} /></div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {picker && <NewFile staff={staff} onClose={() => setPicker(false)} />}
    </>
  );
}

/** Two steps: choose the application type, then the file details. */
function NewFile({ staff, onClose }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [find, setFind] = useState('');
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [clientNumber, setClientNumber] = useState('');
  const [applicantRole, setApplicantRole] = useState('main');
  const [representation, setRepresentation] = useState('firm');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosen = APP_TYPE_LIST.find((t) => t.key === type);
  const f = find.trim().toLowerCase();
  const matches = (t) => !f || `${t.title} ${t.service || ''} ${t.description} ${t.group}`.toLowerCase().includes(f);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, clientNumber, applicantRole, representation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the file.');
      router.push(`/application/${data.application.id}`);
    } catch (e2) {
      setErr(e2.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="nf-h" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Step {step} of 2</div>
            <h2 id="nf-h">{step === 1 ? 'What kind of application?' : chosen?.title}</h2>
            <p className="muted small">
              {step === 1 ? 'The type sets the checklist, intake questions, IRCC forms, letters and final files.' : `${chosen?.group}${chosen?.service ? ` · ${chosen.service}` : ''}`}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {step === 1 ? (
          <>
            <div className="modal-body">
              <div className="input-icon" style={{ marginBottom: 14 }}>
                <Search size={15} aria-hidden="true" />
                <input type="search" autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search: visitor, spouse, 100-304, PGWP…" aria-label="Search application types" />
              </div>
              {GROUPS.map((g) => {
                const list = APP_TYPE_LIST.filter((t) => t.group === g && matches(t));
                if (!list.length) return null;
                return (
                  <div key={g} style={{ marginBottom: 16 }}>
                    <h3>{g}</h3>
                    <div className="type-grid" role="radiogroup" aria-label={g}>
                      {list.map((t) => (
                        <button
                          key={t.key}
                          type="button"
                          role="radio"
                          aria-checked={type === t.key}
                          className={`type-card${type === t.key ? ' on' : ''}`}
                          onClick={() => setType(t.key)}
                          onDoubleClick={() => { setType(t.key); setStep(2); }}
                        >
                          <span className="tt"><span>{t.title}</span>{t.service && <span className="mono faint" style={{ fontWeight: 500 }}>{t.service}</span>}</span>
                          <span className="td">{t.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!APP_TYPE_LIST.some(matches) && <p className="muted">No type matches “{find}”.</p>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="button" onClick={() => setStep(2)} disabled={!type}>Continue</button>
            </div>
          </>
        ) : (
          <form onSubmit={create} style={{ display: 'contents' }}>
            <div className="modal-body">
              <div className="grid2">
                <div className="field">
                  <label htmlFor="nf-title">Applicant name</label>
                  <input id="nf-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="As in the passport" />
                </div>
                {staff && (
                  <>
                    <div className="field">
                      <label htmlFor="nf-num">Client file number</label>
                      <input id="nf-num" value={clientNumber} onChange={(e) => setClientNumber(e.target.value.toUpperCase())} placeholder="e.g. S26213" className="mono" />
                      <div className="note">Used to match client emails and the Drive folder.</div>
                    </div>
                    <div className="field">
                      <label htmlFor="nf-role">Applicant role</label>
                      <select id="nf-role" value={applicantRole} onChange={(e) => setApplicantRole(e.target.value)}>
                        <option value="main">Main applicant</option>
                        <option value="spouse">Accompanying spouse</option>
                        <option value="child">Dependent child</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="nf-rep">Representation</label>
                      <select id="nf-rep" value={representation} onChange={(e) => setRepresentation(e.target.value)}>
                        <option value="firm">Represented by the firm (IMM 5476 + Submission Letter)</option>
                        <option value="self">Self-represented</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              {err && <div className="alert err">{err}</div>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ marginRight: 'auto' }}><ArrowLeft size={15} aria-hidden="true" /> Back</button>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" disabled={busy}>{busy ? <span className="spinner" /> : 'Create file'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
