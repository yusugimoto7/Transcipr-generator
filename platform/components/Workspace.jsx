'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import DocumentsPanel from '@/components/panels/DocumentsPanel';
import IntakePanel from '@/components/panels/IntakePanel';
import SopBuilderPanel from '@/components/panels/SopBuilderPanel';
import ReviewPanel from '@/components/panels/ReviewPanel';
import GeneratePanel from '@/components/panels/GeneratePanel';

const TABS = [
  { id: 'documents', label: '1. Documents' },
  { id: 'intake', label: '2. Intake' },
  { id: 'sop', label: '3. Study Plan' },
  { id: 'review', label: '4. Review' },
  { id: 'generate', label: '5. Generate' },
];

const TAB_IDS = TABS.map((t) => t.id);

/** Read "#tab" or "#tab:substep" from the URL. */
function readHash() {
  if (typeof window === 'undefined') return {};
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  const [tab, sub] = raw.split(':');
  return TAB_IDS.includes(tab) ? { tab, sub: sub || null } : {};
}

export default function Workspace({ initialApp, schema, initialChecklist }) {
  const [app, setApp] = useState(initialApp);
  const [tab, setTabState] = useState('documents');
  const [intakeStep, setIntakeStepState] = useState(null);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const saveTimer = useRef(null);

  // Restore the position from the URL on load, and follow browser back/forward.
  useEffect(() => {
    const sync = () => {
      const { tab: t, sub } = readHash();
      if (t) {
        setTabState(t);
        setIntakeStepState(sub);
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

  /** Change tab (and optional sub-step) and record it in the URL. */
  const setTab = useCallback((next, sub = null) => {
    setTabState(next);
    setIntakeStepState(sub);
    if (typeof window !== 'undefined') {
      const hash = `#${next}${sub ? `:${sub}` : ''}`;
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }, []);

  /** Remember the intake sub-step without adding a history entry per field. */
  const setIntakeStep = useCallback((stepId) => {
    setIntakeStepState(stepId);
    if (typeof window !== 'undefined') {
      const hash = `#intake${stepId ? `:${stepId}` : ''}`;
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }, []);

  // Merge a partial update into local app state.
  const patchLocal = useCallback((partial) => {
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
            body: JSON.stringify({ data }),
          });
          if (!res.ok) throw new Error();
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

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h1 style={{ marginBottom: 2 }}>{app.title}</h1>
        <SaveBadge state={saveState} />
      </div>
      <p className="muted small" style={{ marginBottom: 18 }}>
        {schema.title} · single applicant · <a href="/dashboard">← all applications</a>
      </p>

      <div className="steps">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`step-pill ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
            role="button"
          >
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'documents' && (
        <DocumentsPanel app={app} patchLocal={patchLocal} onExtracted={onFieldChange} goIntake={() => setTab('intake')} />
      )}
      {tab === 'intake' && (
        <IntakePanel
          app={app}
          schema={schema}
          onFieldChange={onFieldChange}
          onFinish={() => setTab('review')}
          activeStepId={intakeStep}
          onStepChange={setIntakeStep}
        />
      )}
      {tab === 'sop' && <SopBuilderPanel app={app} patchLocal={patchLocal} />}
      {tab === 'review' && (
        <ReviewPanel app={app} initialChecklist={initialChecklist} patchLocal={patchLocal} />
      )}
      {tab === 'generate' && (
        <GeneratePanel app={app} patchLocal={patchLocal} onGoIntake={() => setTab('intake')} />
      )}
    </>
  );
}

function SaveBadge({ state }) {
  if (state === 'saving') return <span className="chip">Saving…</span>;
  if (state === 'error') return <span className="chip danger">Save failed</span>;
  return <span className="chip ok">Saved</span>;
}
