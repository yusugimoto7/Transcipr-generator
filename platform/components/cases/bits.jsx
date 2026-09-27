'use client';

import { STAGE_TEXT } from '@/lib/progress';

export const STAGE_CHIP = { documents: '', intake: 'info', letter: 'info', final: 'warn', ready: 'ok' };

/** "3 / 12" with a thin bar. */
export function Meter({ v, label }) {
  if (!v) return <span className="faint">—</span>;
  const [a, b] = 'provided' in v ? [v.provided, v.required] : [v.done, v.total];
  return (
    <div style={{ minWidth: 80 }}>
      {label && <div className="tiny faint">{label}</div>}
      <div className="small strong">{a}<span className="faint"> / {b}</span></div>
      <div className="meter"><i style={{ width: `${b ? Math.round((a / b) * 100) : 0}%` }} /></div>
    </div>
  );
}

/** The worst document-check result: serious, attention, or none. */
export function CheckCell({ c }) {
  if (!c) return <span className="faint">—</span>;
  if (c.red) return <span className="chip danger"><span className="dot red" aria-hidden="true" /> {c.red} serious</span>;
  if (c.orange) return <span className="chip warn"><span className="dot orange" aria-hidden="true" /> {c.orange} attention</span>;
  return <span className="faint small">No problems</span>;
}

export function StageChip({ f }) {
  return <span className={`chip ${STAGE_CHIP[f.stage] || ''}`}>{f.finalStale && f.stage !== 'documents' ? 'Rebuild files' : STAGE_TEXT[f.stage]}</span>;
}

/** Sum the check results of several files. */
export function sumChecks(files) {
  return files.reduce((acc, f) => ({ red: acc.red + (f.check?.red || 0), orange: acc.orange + (f.check?.orange || 0), toSign: acc.toSign + (f.check?.toSign || 0) }), { red: 0, orange: 0, toSign: 0 });
}
