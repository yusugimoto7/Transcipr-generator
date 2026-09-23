import { getAppType } from './appTypes';

/**
 * Personalized document checklist for an application, from the type registry.
 * Items carry the firm's document code (101 birth certificate, 103 passport…)
 * so staff can match uploads to their Drive naming scheme.
 */
export function buildChecklist(data = {}, type = 'study-permit') {
  const seen = new Set();
  const out = [];
  for (const item of getAppType(type).checklist) {
    if (item.when && !item.when(data)) continue;
    if (seen.has(item.key + item.label)) continue;
    seen.add(item.key + item.label);
    out.push({ key: item.key, code: item.code, label: item.label, hint: item.hint });
  }
  return out;
}
