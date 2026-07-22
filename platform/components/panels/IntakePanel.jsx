'use client';

import { useState } from 'react';

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

export default function IntakePanel({ app, schema, onFieldChange, onFinish }) {
  const [stepIdx, setStepIdx] = useState(0);
  const step = schema.steps[stepIdx];

  const stepComplete = (s) =>
    s.fields.filter((f) => f.required).every((f) => String(app.data?.[f.id] ?? '').trim());

  return (
    <>
      <div className="steps">
        {schema.steps.map((s, i) => (
          <div
            key={s.id}
            className={`step-pill ${i === stepIdx ? 'active' : stepComplete(s) ? 'done' : ''}`}
            onClick={() => setStepIdx(i)}
            role="button"
          >
            {s.title}
          </div>
        ))}
      </div>

      <div className="card">
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
    </>
  );
}
