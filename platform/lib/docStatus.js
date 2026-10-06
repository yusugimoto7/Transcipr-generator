/**
 * The colour a document's check shows in the lists, counts and badges.
 *
 * The team can mark a document's Attention / Serious findings as "Already
 * checked — OK to move forward" (verification.cleared). It then shows green,
 * as long as its findings are the ones the team looked at: a later check that
 * finds something new brings the alert back. The findings themselves are never
 * removed. Pure: used on the server and in the browser.
 */

/** A fingerprint of the findings, to tell whether they changed since the team checked them. */
export function findingsKey(v) {
  return (v?.findings || []).map((f) => `${f.severity}|${f.text}`).sort().join('\n');
}

/** Marked as checked by the team, and nothing new found since. */
export function isCleared(v) {
  return Boolean(v?.status && v.status !== 'green' && v.cleared && v.cleared.key === findingsKey(v));
}

/** green · yellow · orange · red, or null when not checked. */
export function shownStatus(v) {
  if (!v?.status) return null;
  return isCleared(v) ? 'green' : v.status;
}
