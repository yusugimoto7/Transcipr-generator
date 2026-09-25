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
    if (item.when && !item.when(data)) continue;
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
  const codes = new Set();
  const cats = new Set();
  for (const d of docs) {
    const c = firmCode(d.filename);
    if (c) {
      codes.add(c);
      codes.add(c.split('-')[0] === c ? c : c); // exact sub-code
    }
    if (d.category) cats.add(d.category);
  }
  const keyCount = firm.reduce((m, i) => m.set(i.key, (m.get(i.key) || 0) + 1), new Map());
  const subCodes = new Set(items.filter((i) => i.code.includes('-')).map((i) => i.code));

  return items.map((i) => {
    let provided = false;
    if (/^\d/.test(i.code)) {
      if (codes.has(i.code)) provided = true;
      // A plain code is also satisfied by "107-2"-style files when no item owns that sub-code.
      if (!provided && !i.code.includes('-')) {
        provided = [...codes].some((c) => c.startsWith(`${i.code}-`) && !subCodes.has(c));
      }
    } else if (i.key === 'rep-form') {
      provided = docs.some((d) => new RegExp(i.code.replace('imm', 'imm ?'), 'i').test(d.filename));
    }
    if (!provided && i.party === 'ircc') provided = Boolean(i.key) && cats.has(i.key);
    else if (!provided && keyCount.get(i.key) === 1) provided = cats.has(i.key);
    return { ...i, provided, uploaded: provided };
  });
}

/** Items the client still has to send (not the firm's, not merely conditional IRCC items). */
export function missingItems(status) {
  return status.filter((c) => !c.provided && c.party !== 'firm' && !c.optional);
}
