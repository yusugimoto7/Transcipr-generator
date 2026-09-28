import { normNumber } from './cases';

/**
 * Which files are safe to clear out of the platform: nobody has put anything
 * in them, and they are not a live client. Used by Admin → Files → Unused.
 */

/** Anything a person or the platform has put in the file. */
export function hasContent(app) {
  if ((app.documents || []).length) return true;
  if ((app.generated || []).length) return true;
  if (app.sop?.text?.trim()) return true;
  if (app.review) return true;
  if (app.finalFiles?.builtAt) return true;
  return Object.values(app.data || {}).some((v) => (Array.isArray(v) ? v.length : v != null && String(v).trim() !== ''));
}

export const isTemplateName = (s) => /\btemplate\b/i.test(String(s || ''));

/**
 * Why this file counts as unused, or null to keep it. An empty file is unused
 * when it is archived, is a template, or has neither a client number nor an
 * Odoo card. Empty files of live clients (waiting for documents) are kept.
 */
export function unusedReason(app) {
  if (hasContent(app)) return null;
  if (app.archived) return 'Archived, nothing in it';
  if (isTemplateName(app.title) || isTemplateName(app.odoo?.title)) return 'Template';
  if (!normNumber(app.clientNumber) && !app.odoo?.taskId) return 'No client number, nothing in it';
  return null;
}
