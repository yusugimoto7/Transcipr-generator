import { getAppType } from './appTypes';
import { firmCode } from './generators/classify';

/**
 * The service's document checklist for an application, filtered by the
 * intake (e.g. no marriage certificate for a single applicant). Items carry
 * the service's own document code, the condition text, whether a certified
 * translation is needed, and whose document it is.
 */
export function buildChecklist(data = {}, type = 'study-permit') {
  const out = [];
  const seen = new Set();
  for (const item of getAppType(type).checklist) {
    if (item.when && !item.when(data, type)) continue;
    const id = `${item.code}|${item.label}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      key: item.key,
      code: item.code,
      label: item.label,
      hint: item.hint || '',
      cond: item.cond || '',
      tr: Boolean(item.tr),
      party: item.party || 'applicant',
    });
  }
  return out;
}

/**
 * Checklist with a `provided` flag per item.
 *
 * An item is provided when a document carries its code in the file name
 * (the team's naming rule: "101-Birth Certificate") — so "107 LOA" and
 * "107-1 PAL" are separate boxes. Documents without a code count by their
 * category, but only for items whose category is unique in the checklist,
 * so one upload can't tick several different boxes. Items the firm prepares
 * are reported as such rather than as missing.
 */
export function checklistStatus(app) {
  const firm = buildChecklist(app?.data || {}, app?.type);
  // Documents IRCC's current checklists ask for that the firm's list lacks
  // (lib/irccChecklists.js, saved on the file when its Documents tab loads).
  const ircc = (app?.ircc?.extra || []).filter((i) => !firm.some((f) => f.key && f.key === i.key));
  const items = [...firm, ...ircc];
  const docs = app?.documents || [];
  const cats = new Set();
  const codeOf = new Map(); // doc id -> its code
  for (const d of docs) {
    const c = firmCode(d.filename);
    if (c) codeOf.set(d.id, c);
    if (d.category) cats.add(d.category);
  }
  const keyCount = firm.reduce((m, i) => m.set(i.key, (m.get(i.key) || 0) + 1), new Map());
  const subCodes = new Set(items.filter((i) => i.code.includes('-')).map((i) => i.code));

  return items.map((i) => {
    // The files that satisfy this item, by the same rules as `provided`.
    let matched = [];
    if (/^\d/.test(i.code)) {
      matched = docs.filter((d) => codeOf.get(d.id) === i.code);
      // A plain code is also satisfied by "107-2"-style files when no item owns that sub-code.
      if (!matched.length && !i.code.includes('-')) {
        matched = docs.filter((d) => {
          const c = codeOf.get(d.id);
          return c && c.startsWith(`${i.code}-`) && !subCodes.has(c);
        });
      }
    } else if (i.key === 'rep-form') {
      matched = docs.filter((d) => new RegExp(i.code.replace('imm', 'imm ?'), 'i').test(d.filename));
    }
    if (!matched.length && i.party === 'ircc' && i.key) matched = docs.filter((d) => d.category === i.key);
    else if (!matched.length && i.party !== 'ircc' && keyCount.get(i.key) === 1) matched = docs.filter((d) => d.category === i.key);
    let provided = matched.length > 0;
    // Category-only evidence (no code on the file) still counts, as before.
    if (!provided && i.party === 'ircc') provided = Boolean(i.key) && cats.has(i.key);
    else if (!provided && keyCount.get(i.key) === 1) provided = cats.has(i.key);
    return { ...i, provided, uploaded: provided, docIds: matched.map((d) => d.id) };
  });
}

/** Items the client still has to send (not the firm's, not merely conditional IRCC items). */
export function missingItems(status) {
  return status.filter((c) => !c.provided && c.party !== 'firm' && !c.optional);
}
