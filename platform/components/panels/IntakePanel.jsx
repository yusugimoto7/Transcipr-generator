'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Check, AlertCircle } from 'lucide-react';
import { intakeStatus, isFilled } from '@/lib/progress';

function Field({ field, value, onChange, missing = false }) {
  const common = {
    id: field.id,
    value: value ?? '',
    onChange: (e) => onChange(field.id, e.target.value),
    'aria-required': field.required || undefined,
    'aria-invalid': missing || undefined,
    'aria-describedby': missing ? `${field.id}-miss` : undefined,
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
      <div className="seg" role="radiogroup" aria-labelledby={`${field.id}-l`}>
        {[['no', 'No', false], ['yes', 'Yes', true]].map(([k, l, v]) => (
          <button key={k} type="button" role="radio" aria-checked={value === v} aria-pressed={value === v} onClick={() => onChange(field.id, value === v ? '' : v)}>
            {l}
          </button>
        ))}
      </div>
    );
  } else {
    const type = { date: 'date', number: 'number', email: 'email', tel: 'tel' }[field.type] || 'text';
    control = <input type={type} {...common} placeholder={field.placeholder || ''} />;
  }
  return (
    <div className={`field${missing ? ' missing' : ''}`}>
      <label htmlFor={field.type === 'bool' ? undefined : field.id} id={`${field.id}-l`}>
        {field.label}
        {field.required && <span className="req" aria-label="required">*</span>}
      </label>
      {control}
      {missing && <div className="miss-note" id={`${field.id}-miss`}><AlertCircle size={12} aria-hidden="true" /> Required — still missing</div>}
      {field.note && <div className="note">{field.note}</div>}
    </div>
  );
}

/**
 * The intake, one section at a time: numbered sections with their status on
 * the left (a drop-down on small screens), the form, and Back / Next kept in
 * view at the bottom. Answers save as you type.
 */
export default function IntakePanel({ app, schema, sections, onFieldChange, onFinish, activeStepId, onStepChange }) {
  const fromUrl = schema.steps.findIndex((s) => s.id === activeStepId);
  const [stepIdx, setStepIdxState] = useState(fromUrl >= 0 ? fromUrl : 0);

  useEffect(() => {
    const i = schema.steps.findIndex((s) => s.id === activeStepId);
    if (i >= 0 && i !== stepIdx) setStepIdxState(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStepId]);

  const setStepIdx = (i) => {
    setStepIdxState(i);
    onStepChange?.(schema.steps[i]?.id || null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const statuses = sections || intakeStatus(app, schema);
  const doneCount = statuses.filter((x) => x.state === 'done').length;
  const step = schema.steps[stepIdx];
  const st = statuses[stepIdx];
  const last = stepIdx === schema.steps.length - 1;
  const next = schema.steps[stepIdx + 1];
  // Required answers still empty: in this section, and across the whole intake.
  const missingHere = step.fields.filter((f) => f.required && !isFilled(app.data, f));
  const missingAll = schema.steps
    .map((s, i) => ({ i, step: s, fields: s.fields.filter((f) => f.required && !isFilled(app.data, f)) }))
    .filter((x) => x.fields.length);
  const missingCount = missingAll.reduce((n, x) => n + x.fields.length, 0);
  const focusField = (id) => setTimeout(() => {
    const el = typeof document !== 'undefined' && document.getElementById(id);
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); }
  }, 150);
  const goToField = (i, id) => {
    if (i !== stepIdx) {
      setStepIdxState(i);
      onStepChange?.(schema.steps[i]?.id || null);
    }
    focusField(id);
  };

  return (
    <div className="intake-layout">
      <nav className="stepper" aria-label="Intake sections">
        <div className="stepper-head">
          <span>Progress</span>
          <strong>{doneCount} of {schema.steps.length} complete</strong>
        </div>
        <div className="progress" style={{ marginBottom: 12 }}>
          <div className="progress-fill ok" style={{ width: `${Math.round((doneCount / schema.steps.length) * 100)}%` }} />
        </div>
        <ol>
          {schema.steps.map((s, i) => {
            const x = statuses[i];
            const current = i === stepIdx;
            return (
              <li key={s.id} className={`stepper-item ${x.state}${current ? ' current' : ''}`}>
                <button type="button" onClick={() => setStepIdx(i)} aria-current={current ? 'step' : undefined}>
                  <span className="stepper-dot" aria-hidden="true">{x.state === 'done' && !current ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
                  <span className="stepper-text">
                    <span className="stepper-title">{s.title}</span>
                    <span className="stepper-sub">{x.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="stack">
        {missingCount > 0 && (
          <details className="missing-all">
            <summary>
              <AlertCircle size={15} aria-hidden="true" /> <strong>{missingCount} required answer{missingCount === 1 ? '' : 's'} missing</strong>
              <span className="muted"> in {missingAll.length} section{missingAll.length === 1 ? '' : 's'} — needed for the IRCC forms</span>
            </summary>
            <div className="missing-groups">
              {missingAll.map((x) => (
                <div key={x.step.id}>
                  <span className="small faint">{x.i + 1}. {x.step.title}</span>
                  <div className="cluster" style={{ gap: 6 }}>
                    {x.fields.map((f) => (
                      <button key={f.id} type="button" className="miss-chip" onClick={() => goToField(x.i, f.id)}>{f.label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className="step-picker">
          <label htmlFor="step-pick" className="sr-only">Section</label>
          <select id="step-pick" value={stepIdx} onChange={(e) => setStepIdx(Number(e.target.value))}>
            {schema.steps.map((s, i) => (
              <option key={s.id} value={i}>
                {i + 1}. {s.title} — {statuses[i].state === 'done' ? '✓ complete' : statuses[i].text.toLowerCase()}
              </option>
            ))}
          </select>
          <span className="small faint nowrap">{doneCount}/{schema.steps.length}</span>
        </div>

        <section className="card intake-card" aria-labelledby="step-h">
          <div className="ic-head">
            <div className="spread">
              <div className="stepper-eyebrow">Step {stepIdx + 1} of {schema.steps.length}</div>
              <span className={`chip ${st.state === 'done' ? 'ok' : st.state === 'partial' ? 'warn' : ''}`}>{st.text}</span>
            </div>
            <h2 id="step-h" style={{ margin: '4px 0 4px', fontSize: 19 }}>{step.title}</h2>
            {step.help && <p className="muted small" style={{ margin: 0 }}>{step.help}</p>}
            {missingHere.length > 0 && (
              <div className="missing-here">
                <span className="small"><AlertCircle size={13} aria-hidden="true" /> Still needed here:</span>
                {missingHere.map((f) => (
                  <button key={f.id} type="button" className="miss-chip" onClick={() => focusField(f.id)}>{f.label}</button>
                ))}
              </div>
            )}
          </div>

          <div className="ic-body">
            <div className="grid2">
              {step.fields.map((f) => (
                <div key={f.id} style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
                  <Field field={f} value={app.data?.[f.id]} onChange={onFieldChange} missing={f.required && !isFilled(app.data, f)} />
                </div>
              ))}
            </div>
            <p className="tiny faint" style={{ margin: '0 0 10px' }}><span className="req">*</span> needed for the IRCC forms. Answers save automatically.</p>
          </div>

          <div className="intake-foot">
            <button type="button" className="btn-secondary" disabled={stepIdx === 0} onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            {!last ? (
              <button type="button" className="btn-navy" onClick={() => setStepIdx(stepIdx + 1)}>
                <span>Next<span className="next-label">: {next.title}</span></span> <ArrowRight size={16} aria-hidden="true" />
              </button>
            ) : (
              <button type="button" onClick={onFinish}>
                Finish intake <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
