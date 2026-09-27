/**
 * Date formatting shared by the interface. One locale everywhere, so the
 * server-rendered page and the browser agree, and "18 Apr 1992" can't be
 * misread the way 04/18 vs 18/04 can.
 */
const LOCALE = 'en-GB';

/** A calendar date such as a date of birth ("1992-04-18"): never shifted by time zone. */
export function fmtDay(value) {
  if (!value) return '';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? 'UTC' : undefined });
}

/** A moment (an upload, a check) with its time. */
export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "5 min ago", "3 h ago", "2 d ago", then the date. */
export function fmtAgo(iso) {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  if (mins < 60 * 24 * 7) return `${Math.round(mins / 1440)} d ago`;
  return fmtDay(iso);
}
