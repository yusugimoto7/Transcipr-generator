'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Search, FolderOpen, AlertOctagon, FileQuestion, CheckCircle2, X, ArrowLeft, ChevronRight, Users, Archive } from 'lucide-react';
import { APP_TYPE_LIST, TYPE_GROUPS } from '@/lib/appTypes';
import { groupCases, caseLabel, caseKeyOf, normNumber, ROLE_LABEL } from '@/lib/cases';
import { fmtAgo } from '@/lib/format';
import { initials } from '@/components/TopBar';
import TypePicker from '@/components/cases/TypePicker';
import { Meter, CheckCell, StageChip, sumChecks } from '@/components/cases/bits';

const GROUPS = [...new Set([...TYPE_GROUPS, ...APP_TYPE_LIST.map((t) => t.group)])];
const firstName = (t) => String(t || '').split(' ')[0];

export default function DashboardClient({ initialApps, user }) {
  const router = useRouter();
  const staff = user?.role === 'admin' || user?.role === 'manager';
  const [apps] = useState(initialApps);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [quick, setQuick] = useState('all'); // all | serious | missing | ready
  const [showArchived, setShowArchived] = useState(false);
  const [picker, setPicker] = useState(false);

  // One row per client: the main applicant with the family members applying with them.
  const cases = useMemo(
    () =>
      groupCases(apps).map((c) => {
        const docs = c.members.reduce((acc, m) => ({ provided: acc.provided + (m.docs?.provided || 0), required: acc.required + (m.docs?.required || 0) }), { provided: 0, required: 0 });
        const team = [...new Map(c.members.flatMap((m) => m.assignedTo).map((t) => [t.id, t])).values()];
        return { ...c, docs, check: sumChecks(c.members), team, ready: c.members.every((m) => m.stage === 'ready'), archived: c.members.every((m) => m.archived) };
      }),
    [apps]
  );

  const active = cases.filter((c) => !c.archived);
  const archivedCount = cases.length - active.length;
  const stats = {
    all: active.length,
    serious: active.filter((c) => c.check.red).length,
    missing: active.filter((c) => c.docs.provided < c.docs.required).length,
    ready: active.filter((c) => c.ready).length,
  };

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return cases
      .filter((c) => (showArchived ? c.archived : !c.archived))
      .filter((c) => !t || c.members.some((m) => [m.title, m.clientNumber, m.typeTitle, m.service, ...m.assignedTo.map((x) => x.name)].join(' ').toLowerCase().includes(t)))
      .filter((c) => !group || c.members.some((m) => m.group === group))
      .filter((c) => quick === 'all' || (quick === 'serious' && c.check.red) || (quick === 'missing' && c.docs.provided < c.docs.required) || (quick === 'ready' && c.ready));
  }, [cases, q, group, quick, showArchived]);

  const groupsInUse = GROUPS.filter((g) => apps.some((a) => a.group === g));
  const clear = () => { setQ(''); setGroup(''); setQuick('all'); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{staff ? 'Client files' : 'My applications'}</h1>
          <p className="muted">
            {user?.name ? `Hi ${firstName(user.name)}. ` : ''}
            {staff ? 'One row per client, most recently changed first. Open a client to see each family member’s file.' : 'Your Canadian applications with Sugimoto Visa.'}
          </p>
        </div>
        <button type="button" onClick={() => setPicker(true)}>
          <Plus size={16} aria-hidden="true" /> New {staff ? 'client' : 'application'}
        </button>
      </div>

      {apps.length === 0 ? (
        <section className="card empty">
          <FolderOpen size={32} aria-hidden="true" />
          <h2>{staff ? 'No clients yet' : 'Start your first application'}</h2>
          <p style={{ maxWidth: 520, margin: '0 auto 16px' }}>
            {staff ? 'Create a client file, or ask an admin to assign one to you.' : 'Choose the kind of application. You can then upload your documents and fill in your details.'}
          </p>
          <button type="button" onClick={() => setPicker(true)}><Plus size={16} aria-hidden="true" /> {staff ? 'New client' : 'Create an application'}</button>
        </section>
      ) : staff ? (
        <>
          <div className="stat-row">
            {[
              ['all', 'All clients', FolderOpen, stats.all],
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
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, file number, type or manager" aria-label="Search clients" />
              </div>
              <label htmlFor="grp" className="sr-only">Service group</label>
              <select id="grp" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">All services</option>
                {groupsInUse.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              {(archivedCount > 0 || showArchived) && (
                <button type="button" className={showArchived ? 'btn-navy btn-sm' : 'btn-secondary btn-sm'} onClick={() => setShowArchived(!showArchived)} aria-pressed={showArchived} title="Clients whose Odoo card left the working stages, or archived by the team">
                  <Archive size={14} aria-hidden="true" /> Archived ({archivedCount})
                </button>
              )}
              {(q || group || quick !== 'all') && (
                <button type="button" className="btn-ghost btn-sm" onClick={clear}><X size={14} aria-hidden="true" /> Clear</button>
              )}
            </div>
            <div className="tbl-wrap">
              <table className="tbl stackable">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Stage</th>
                    <th className="hide-sm">Documents</th>
                    <th>Check</th>
                    <th className="hide-sm">Team</th>
                    <th className="hide-sm">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => {
                    const href = `/case/${encodeURIComponent(c.key)}`;
                    const others = c.members.filter((m) => m.id !== c.main.id);
                    return (
                      <tr key={c.key} className="clickable" onClick={() => router.push(href)}>
                        <td>
                          <Link href={href} className="file-cell" style={{ color: 'inherit' }} onClick={(e) => e.stopPropagation()}>
                            <span className="t" style={{ fontSize: 15 }}>{caseLabel(c)}{c.archived && <span className="chip" style={{ marginLeft: 8 }}>Archived</span>}</span>
                            <span className="s">{c.main.typeTitle}{c.main.service ? ` · ${c.main.service}` : ''}</span>
                            {others.length > 0 && (
                              <span className="s cluster" style={{ gap: 6, marginTop: 3 }}>
                                <Users size={13} aria-hidden="true" />
                                {others.map((m) => `${firstName(m.title)} (${(ROLE_LABEL[m.applicantRole] || 'family').split(' ')[0].toLowerCase()})`).join(', ')}
                              </span>
                            )}
                          </Link>
                        </td>
                        <td><StageChip f={c.main} /></td>
                        <td className="hide-sm"><Meter v={c.docs} /></td>
                        <td><CheckCell c={c.check} /></td>
                        <td className="hide-sm">
                          <div className="people">
                            {c.team.length ? c.team.map((m) => <span key={m.id} className="avatar" title={m.name}>{initials(m.name)}</span>) : <span className="faint small">—</span>}
                          </div>
                        </td>
                        <td className="hide-sm small muted nowrap" suppressHydrationWarning>{fmtAgo(c.updatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!shown.length && <div className="empty small">{showArchived ? 'No archived clients.' : <>No clients match. <button type="button" className="btn-ghost btn-sm" onClick={clear}>Show all</button></>}</div>}
          </section>
        </>
      ) : (
        <div className="stack">
          {apps.map((a) => (
            <Link key={a.id} href={`/application/${a.id}`} className="card" style={{ color: 'inherit', display: 'grid', gap: 12 }}>
              <div className="spread">
                <div>
                  <div className="strong" style={{ fontSize: 16 }}>{a.typeTitle}</div>
                  <div className="small muted">{a.title}{a.clientNumber ? ` · file ${a.clientNumber}` : ''}</div>
                </div>
                <span className="btn btn-secondary btn-sm">Continue <ChevronRight size={14} aria-hidden="true" /></span>
              </div>
              <div className="cluster" style={{ gap: 28 }}>
                <Meter v={a.docs} label="Documents" />
                <Meter v={a.intake} label="Your details" />
              </div>
            </Link>
          ))}
        </div>
      )}

      {picker && <NewFile staff={staff} existing={cases} onClose={() => setPicker(false)} />}
    </>
  );
}

/** A new client (staff) or application (client): the type, then the name and file number. */
function NewFile({ staff, existing, onClose }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [clientNumber, setClientNumber] = useState('');
  const [representation, setRepresentation] = useState('firm');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const chosen = APP_TYPE_LIST.find((t) => t.key === type);
  const taken = staff && normNumber(clientNumber) ? existing.find((c) => c.clientNumber === normNumber(clientNumber)) : null;

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, clientNumber, applicantRole: 'main', representation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create the file.');
      router.push(staff ? `/case/${encodeURIComponent(caseKeyOf(data.application))}` : `/application/${data.application.id}`);
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
            <h2 id="nf-h">{step === 1 ? (staff ? 'What is the main applicant applying for?' : 'What kind of application?') : chosen?.title}</h2>
            <p className="muted small">
              {step === 1 ? 'The type sets the checklist, intake questions, IRCC forms, letters and final files. Family members are added on the client’s page.' : `${chosen?.group}${chosen?.service ? ` · ${chosen.service}` : ''}`}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        {step === 1 ? (
          <>
            <div className="modal-body">
              <TypePicker value={type} onChange={setType} onPick={(k) => { setType(k); setStep(2); }} />
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
                {staff && (
                  <div className="field">
                    <label htmlFor="nf-num">Client file number</label>
                    <input id="nf-num" autoFocus value={clientNumber} onChange={(e) => setClientNumber(e.target.value.toUpperCase())} placeholder="e.g. S26213" className="mono" />
                    <div className="note">Shared by the whole family. Used to match emails and the Drive folder.</div>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="nf-title">{staff ? 'Main applicant’s name' : 'Your name'}<span className="req" aria-hidden="true">*</span></label>
                  <input id="nf-title" autoFocus={!staff} required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="As in the passport" />
                </div>
                {staff && (
                  <div className="field">
                    <label htmlFor="nf-rep">Representation</label>
                    <select id="nf-rep" value={representation} onChange={(e) => setRepresentation(e.target.value)}>
                      <option value="firm">Represented by the firm (IMM 5476 + Submission Letter)</option>
                      <option value="self">Self-represented</option>
                    </select>
                  </div>
                )}
              </div>
              {taken && (
                <div className="alert warn">
                  <span>
                    {taken.clientNumber} already exists ({taken.name}). To add a family member, open{' '}
                    <Link href={`/case/${encodeURIComponent(taken.key)}`}>the client’s page</Link> and use “Add family member”.
                  </span>
                </div>
              )}
              {err && <div className="alert err">{err}</div>}
            </div>
            <div className="modal-foot">
              <button type="button" className="btn-secondary" onClick={() => setStep(1)} style={{ marginRight: 'auto' }}><ArrowLeft size={15} aria-hidden="true" /> Back</button>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" disabled={busy || !title.trim() || Boolean(taken)}>{busy ? <span className="spinner" /> : staff ? 'Create client' : 'Create'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
