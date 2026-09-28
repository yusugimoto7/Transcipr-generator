'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { LayoutDashboard, FileStack, ClipboardList, PenLine, ShieldCheck, PackageCheck, CheckCircle2, ChevronRight, Loader2, CloudOff, AlertTriangle, Mail } from 'lucide-react';
import OverviewPanel from '@/components/panels/OverviewPanel';
import DocumentsPanel from '@/components/panels/DocumentsPanel';
import IntakePanel from '@/components/panels/IntakePanel';
import SopBuilderPanel from '@/components/panels/SopBuilderPanel';
import ReviewPanel from '@/components/panels/ReviewPanel';
import GeneratePanel from '@/components/panels/GeneratePanel';
import EmailsPanel from '@/components/panels/EmailsPanel';
import { primaryLetter, getAppType } from '@/lib/appTypes';
import { fileProgress } from '@/lib/progress';
import { ROLE_LABEL, displayName } from '@/lib/cases';
import { initials } from '@/components/TopBar';

const SECTION_IDS = ['overview', 'documents', 'emails', 'intake', 'sop', 'review', 'generate'];

/** Read "#section" or "#section:sub" from the URL. */
function readHash() {
  if (typeof window === 'undefined') return {};
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const [tab, sub] = raw.split(':');
  return SECTION_IDS.includes(tab) ? { tab, sub: sub || null } : {};
}

/**
 * A client file: the client header, the stage sidebar (with live counts) and
 * the selected stage. The position is kept in the URL (#documents, #intake:family…)
 * so a refresh or a shared link opens the same place.
 */
export default function Workspace({ initialApp, schema, viewerRole, family, driveOn = false }) {
  const [app, setApp] = useState(initialApp);
  const staff = viewerRole === 'admin' || viewerRole === 'manager';
  const [tab, setTabState] = useState('overview');
  const [sub, setSubState] = useState(null);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error | conflict
  // Version of the intake answers this page last saw (see the PATCH route).
  const versionRef = useRef(initialApp.dataVersion || 0);
  const saveTimer = useRef(null);

  const type = getAppType(app.type);
  const letter = primaryLetter(app.type);
  const p = useMemo(() => fileProgress(app, schema), [app, schema]);
  const showFinal = staff || app.representation === 'self';

  useEffect(() => {
    const sync = () => {
      const { tab: t, sub: s } = readHash();
      if (t) {
        setTabState(t);
        setSubState(s);
      }
    };
    sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  /** Go to a section (and optional sub-position) and record it in the URL. */
  const go = useCallback((next, s = null) => {
    setTabState(next);
    setSubState(s);
    if (typeof window !== 'undefined') {
      const hash = `#${next}${s ? `:${s}` : ''}`;
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      window.scrollTo({ top: 0 });
    }
  }, []);

  /** Remember a sub-position (intake step, selected document) without a history entry each time. */
  const setSub = useCallback(
    (s) => {
      setSubState(s);
      if (typeof window !== 'undefined') {
        const hash = `#${tab}${s ? `:${s}` : ''}`;
        window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
      }
    },
    [tab]
  );

  // Merge a partial update into local app state.
  const patchLocal = useCallback((partial) => {
    if (partial.dataVersion != null) versionRef.current = partial.dataVersion; // saved on the server alongside
    setApp((a) => ({ ...a, ...partial, data: { ...a.data, ...(partial.data || {}) } }));
  }, []);

  // Debounced persistence of intake data.
  const saveData = useCallback(
    (data) => {
      setSaveState('saving');
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/applications/${app.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, baseDataVersion: versionRef.current }),
          });
          if (res.status === 409) {
            // Someone else saved this file first: keep their copy, tell the user.
            const d = await res.json();
            if (d.application) {
              versionRef.current = d.application.dataVersion || 0;
              setApp((a) => ({ ...a, ...d.application }));
            }
            setSaveState('conflict');
            return;
          }
          if (!res.ok) throw new Error();
          const d = await res.json();
          versionRef.current = d.application?.dataVersion ?? versionRef.current;
          setSaveState('saved');
        } catch {
          setSaveState('error');
        }
      }, 700);
    },
    [app.id]
  );

  const onFieldChange = useCallback(
    (id, value) => {
      setApp((a) => {
        const nextData = { ...a.data, [id]: value };
        saveData(nextData);
        return { ...a, data: nextData };
      });
    },
    [saveData]
  );

  const attention = p.check.red + p.check.orange;
  const fieldLabels = useMemo(() => new Map(schema.steps.flatMap((st) => st.fields.map((f) => [f.id, f.label]))), [schema]);
  const nav = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    {
      id: 'documents',
      label: 'Documents',
      icon: FileStack,
      sub: `${p.documents.provided} of ${p.documents.required} provided`,
      badge: p.check.red ? { n: p.check.red, cls: 'danger', title: 'serious findings' } : attention ? { n: attention, cls: 'warn', title: 'need attention' } : null,
      done: p.documents.required > 0 && !p.documents.missing.length && !attention,
    },
    ...(staff
      ? [{
          id: 'emails', label: 'Emails', icon: Mail,
          sub: app.emails?.length ? `${app.emails.length} email${app.emails.length === 1 ? '' : 's'} · ${(app.emails || []).reduce((n, e) => n + (e.analysis?.facts || []).filter((f) => !f.dismissed).length, 0)} facts` : 'None yet',
        }]
      : []),
    { id: 'intake', label: staff ? 'Intake' : 'Your details', icon: ClipboardList, sub: `${p.intake.done} of ${p.intake.total} sections`, done: p.intake.done === p.intake.total },
    { id: 'sop', label: letter.title.replace(/ \(.*\)$/, ''), icon: PenLine, sub: p.letter.done ? 'Drafted' : 'Not written yet', done: p.letter.done },
    { id: 'review', label: 'Review', icon: ShieldCheck, sub: p.review ? `Readiness ${p.review.score}/100` : 'Not run yet' },
    ...(showFinal
      ? [{
          id: 'generate', label: 'Final files', icon: PackageCheck,
          sub: p.final.count ? (p.final.stale ? 'Out of date — rebuild' : `${p.final.count} files built`) : 'Not built yet',
          badge: p.final.stale ? { n: '!', cls: 'warn', title: 'out of date' } : null,
          done: p.final.count > 0 && !p.final.stale,
        }]
      : []),
  ];

  return (
    <>
      <div className="ws-head">
        <div className="ws-head-inner">
          <div className="ws-id">
            <div className="crumbs">
              <Link href="/dashboard">{staff ? 'Client files' : 'My applications'}</Link>
              <ChevronRight size={13} aria-hidden="true" />
              {staff && family ? <Link href={`/case/${encodeURIComponent(family.key)}`}>{family.label}</Link> : <span>{app.clientNumber || 'File'}</span>}
            </div>
            <div className="ws-title">
              <h1>{displayName(app)}</h1>
              <span className="chip">{ROLE_LABEL[app.applicantRole] || ROLE_LABEL.main}</span>
            </div>
            <div className="ws-meta">
              <span>{type.title}</span>
              {type.service && <span className="mono">{type.service}</span>}
              {staff && <span>{app.representation === 'self' ? 'Self-represented' : 'Represented by the firm'}</span>}
            </div>
            {family && family.members.length > 1 && (
              <nav className="family" aria-label="Family members">
                {family.members.map((m) => (
                  <Link key={m.id} href={`/application/${m.id}`} className={m.id === app.id ? 'on' : ''} aria-current={m.id === app.id ? 'page' : undefined}>
                    <span className="avatar" aria-hidden="true">{initials(m.title)}</span>
                    {m.title.split(' ')[0]} · {m.main ? 'main' : (ROLE_LABEL[m.applicantRole] || 'family').split(' ')[0].toLowerCase()}
                  </Link>
                ))}
              </nav>
            )}
          </div>
          <div className="ws-stats" aria-label="File status">
            <Stat label="Documents" value={`${p.documents.provided}/${p.documents.required}`} ratio={p.documents.required ? p.documents.provided / p.documents.required : 0} />
            <Stat label="Intake" value={`${p.intake.done}/${p.intake.total}`} ratio={p.intake.total ? p.intake.done / p.intake.total : 0} />
            <div className="ws-stat">
              <span className="lbl">Check</span>
              <span className="val">
                {p.check.red ? <span className="chip danger">{p.check.red} serious</span> : attention ? <span className="chip warn">{attention} attention</span> : p.check.green ? <span className="chip ok">All OK</span> : <span className="faint">—</span>}
              </span>
            </div>
          </div>
          <SaveBadge state={saveState} />
        </div>
      </div>

      {app.archived && (
        <div className="ws-head-inner" style={{ paddingTop: 0 }}>
          <div className="alert warn" style={{ margin: '10px 0 0', width: '100%' }}>
            <span>
              This file is archived{app.archived.reason ? ` — ${app.archived.reason}` : ''}. It is hidden from Client files; nothing was deleted.
              {staff && family && <> <Link href={`/case/${encodeURIComponent(family.key)}`}>Restore it on the client page</Link>.</>}
            </span>
          </div>
        </div>
      )}
      <div className="ws">
        <nav className="ws-side" aria-label="File sections">
          <div className="side-label">{staff ? 'This file' : 'Your application'}</div>
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <button key={n.id} type="button" className={`side-item${tab === n.id ? ' on' : ''}`} onClick={() => go(n.id)} aria-current={tab === n.id ? 'page' : undefined}>
                <span className="ico"><Icon size={18} aria-hidden="true" /></span>
                <span>
                  {n.label}
                  {n.sub && <span className="sub">{n.sub}</span>}
                </span>
                {n.badge ? (
                  <span className={`count ${n.badge.cls}`} title={`${n.badge.n} ${n.badge.title}`}>{n.badge.n}</span>
                ) : n.done ? (
                  <CheckCircle2 size={16} className="state-done" aria-label="done" />
                ) : <span />}
              </button>
            );
          })}
        </nav>

        <main className="ws-main">
          {tab === 'overview' && <OverviewPanel app={app} progress={p} staff={staff} showFinal={showFinal} go={go} letterTitle={letter.title.replace(/ \(.*\)$/, '')} />}
          {tab === 'documents' && (
            <DocumentsPanel
              app={app}
              progress={p}
              patchLocal={patchLocal}
              onExtracted={onFieldChange}
              goIntake={() => go('intake')}
              staff={staff}
              selected={sub}
              onSelect={setSub}
              driveOn={driveOn}
            />
          )}
          {tab === 'emails' && staff && (
            <EmailsPanel app={app} patchLocal={patchLocal} onFieldChange={onFieldChange} fieldLabel={(id) => fieldLabels.get(id)} />
          )}
          {tab === 'intake' && (
            <IntakePanel app={app} schema={schema} sections={p.intake.sections} onFieldChange={onFieldChange} onFinish={() => go(showFinal ? 'review' : 'overview')} activeStepId={sub} onStepChange={setSub} saveState={saveState} />
          )}
          {tab === 'sop' && <SopBuilderPanel app={app} patchLocal={patchLocal} />}
          {tab === 'review' && <ReviewPanel app={app} progress={p} patchLocal={patchLocal} go={go} />}
          {tab === 'generate' && showFinal && <GeneratePanel app={app} patchLocal={patchLocal} onGoIntake={() => go('intake')} progress={p} driveOn={driveOn} />}
        </main>
      </div>
    </>
  );
}

function Stat({ label, value, ratio }) {
  return (
    <div className="ws-stat">
      <span className="lbl">{label}</span>
      <span className="val">{value}</span>
      <div className="meter" aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, ratio) * 100)}%` }} /></div>
    </div>
  );
}

function SaveBadge({ state }) {
  if (state === 'saving') return <span className="save-state"><Loader2 size={14} className="spin-icon" aria-hidden="true" /> Saving…</span>;
  if (state === 'error') return <span className="chip danger"><CloudOff size={13} aria-hidden="true" /> Not saved — check your connection</span>;
  if (state === 'conflict') {
    return (
      <span className="chip danger" title="Another account manager saved this file after you opened it. Their version has been loaded — re-apply your last change.">
        <AlertTriangle size={13} aria-hidden="true" /> Updated by someone else — reloaded
      </span>
    );
  }
  return <span className="save-state"><CheckCircle2 size={14} aria-hidden="true" /> All changes saved</span>;
}
