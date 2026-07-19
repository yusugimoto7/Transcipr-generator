'use client';

import { useState, useCallback, useRef } from 'react';
import DocumentsPanel from '@/components/panels/DocumentsPanel';
import IntakePanel from '@/components/panels/IntakePanel';
import ReviewPanel from '@/components/panels/ReviewPanel';
import GeneratePanel from '@/components/panels/GeneratePanel';

const TABS = [
  { id: 'documents', label: '1. Documents' },
  { id: 'intake', label: '2. Intake' },
  { id: 'review', label: '3. Review' },
  { id: 'generate', label: '4. Generate' },
];

export default function Workspace({ initialApp, schema, initialChecklist }) {
  const [app, setApp] = useState(initialApp);
  const [tab, setTab] = useState('documents');
  const [saveState, setSaveState] = useState('saved'); // saved | saving | error
  const saveTimer = useRef(null);

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
        <IntakePanel app={app} schema={schema} onFieldChange={onFieldChange} />
      )}
      {tab === 'review' && (
        <ReviewPanel app={app} initialChecklist={initialChecklist} patchLocal={patchLocal} />
      )}
      {tab === 'generate' && <GeneratePanel app={app} patchLocal={patchLocal} />}
    </>
  );
}

function SaveBadge({ state }) {
  if (state === 'saving') return <span className="chip">Saving…</span>;
  if (state === 'error') return <span className="chip danger">Save failed</span>;
  return <span className="chip ok">Saved</span>;
}
