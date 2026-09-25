'use client';

import { useState, useEffect } from 'react';

function Field({ field, value, onChange }) {
  const common = {
    id: field.id,
    value: value ?? '',
    onChange: (e) => onChange(field.id, e.target.value),
  };
  let control;
  if (field.type === 'textarea') {
    control = <textarea {...common} placeholder={field.placeholder || ''} />;
  } else if (field.type === 'select') {
    control = (
      <select {...common}>
        <option value="">Select…</option>
        {field.options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
        {/* Keep a value saved before this became a list (or typed by hand) visible. */}
        {value && !field.options.includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  } else if (field.type === 'bool') {
    control = (
      <select
        id={field.id}
        value={value === true ? 'yes' : value === false ? 'no' : ''}
        onChange={(e) => onChange(field.id, e.target.value === '' ? '' : e.target.value === 'yes')}
      >
        <option value="">Select…</option>
        <option value="no">No</option>
        <option value="yes">Yes</option>
      </select>
    );
  } else {
    const type =
      field.type === 'date' ? 'date'
      : field.type === 'number' ? 'number'
      : field.type === 'email' ? 'email'
      : field.type === 'tel' ? 'tel'
      : 'text';
    control = <input type={type} {...common} placeholder={field.placeholder || ''} />;
  }
  return (
    <div className="field">
      <label htmlFor={field.id}>
        {field.label} {field.required && <span style={{ color: 'var(--brand)' }}>*</span>}
      </label>
      {control}
      {field.note && <div className="note">{field.note}</div>}
    </div>
  );
}

export default function IntakePanel({ app, schema, onFieldChange, onFinish, activeStepId, onStepChange }) {
  const fromUrl = schema.steps.findIndex((s) => s.id === activeStepId);
  const [stepIdx, setStepIdxState] = useState(fromUrl >= 0 ? fromUrl : 0);

  // Follow the URL when it changes (refresh, back/forward).
  useEffect(() => {
    const i = schema.steps.findIndex((s) => s.id === activeStepId);
    if (i >= 0 && i !== stepIdx) setStepIdxState(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepId]);

  const setStepIdx = (next) => {
    const i = typeof next === 'function' ? next(stepIdx) : next;
    setStepIdxState(i);
    onStepChange?.(schema.steps[i]?.id || null);
  };

  const step = schema.steps[stepIdx];

  const filled = (f) => {
    const v = app.data?.[f.id];
    return typeof v === 'boolean' || String(v ?? '').trim() !== '';
  };
  // done: every required field answered (a section with none required counts
  // once anything in it is filled); partial: started but required fields left.
  const status = (s) => {
    const req = s.fields.filter((f) => f.required);
    const left = req.filter((f) => !filled(f)).length;
    const any = s.fields.some(filled);
    if (req.length ? left === 0 : any) return { state: 'done', text: 'Complete' };
    if (any) return { state: 'partial', text: `${left} required left` };
    return { state: 'todo', text: req.length ? `${req.length} required` : 'Optional' };
  };
  const statuses = schema.steps.map(status);
  const doneCount = statuses.filter((x) => x.state === 'done').length;

  return (
    <div className="intake-layout">
      <nav className="stepper" aria-label="Intake sections">
        <div className="stepper-head">
          <span>Intake progress</span>
          <strong>{doneCount} of {schema.steps.length} complete</strong>
        </div>
        <div className="progress" style={{ marginBottom: 14 }}>
          <div className="progress-fill" style={{ width: `${Math.round((doneCount / schema.steps.length) * 100)}%`, background: 'var(--ok)' }} />
        </div>
        <ol>
          {schema.steps.map((s, i) => {
            const st = statuses[i];
            const current = i === stepIdx;
            return (
              <li key={s.id} className={`stepper-item ${st.state}${current ? ' current' : ''}`}>
                <button type="button" onClick={() => setStepIdx(i)} aria-current={current ? 'step' : undefined}>
                  <span className="stepper-dot" aria-hidden="true">{st.state === 'done' && !current ? '✓' : i + 1}</span>
                  <span className="stepper-text">
                    <span className="stepper-title">{s.title}</span>
                    <span className="stepper-sub">{st.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="card intake-card">
        <div className="stepper-eyebrow">Step {stepIdx + 1} of {schema.steps.length}</div>
        <h2>{step.title}</h2>
        {step.help && <p className="muted small" style={{ marginTop: -6 }}>{step.help}</p>}

        <div className="grid2" style={{ marginTop: 14 }}>
          {step.fields.map((f) => (
            <div key={f.id} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
              <Field field={f} value={app.data?.[f.id]} onChange={onFieldChange} />
            </div>
          ))}
        </div>

        <div className="btn-row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
          <button
            className="btn-secondary"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
          >
            ← Back
          </button>
          {stepIdx < schema.steps.length - 1 ? (
            <button onClick={() => setStepIdx((i) => Math.min(schema.steps.length - 1, i + 1))}>
              Next: {schema.steps[stepIdx + 1].title} →
            </button>
          ) : (
            <button onClick={onFinish}>End of intake — go to Review →</button>
          )}
        </div>
      </div>
    </div>
  );
}
