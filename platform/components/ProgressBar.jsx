/**
 * Thin progress bar. `value` is 0–1; leave it null for an indeterminate
 * (sliding) bar while the total isn't known yet.
 */
export default function ProgressBar({ value = null, label }) {
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div style={{ marginTop: 10 }}>
      {label && <div className="small muted">{label}</div>}
      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-label={typeof label === 'string' ? label : 'Progress'}
      >
        <div className={pct == null ? 'progress-fill indeterminate' : 'progress-fill'} style={pct == null ? undefined : { width: `${pct}%` }} />
      </div>
    </div>
  );
}
