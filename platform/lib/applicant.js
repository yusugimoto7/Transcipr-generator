/**
 * Small helpers shared by the document generators, distilled from the firm's
 * real submission packages.
 */

/** Compose a single-line mailing address from the structured intake fields. */
export function composeAddress(d = {}) {
  const parts = [
    d.mailingPobox && `P.O. Box ${d.mailingPobox}`,
    d.mailingUnit && `Unit ${d.mailingUnit}`,
    [d.mailingStreetNo, d.mailingStreet].filter(Boolean).join(' '),
    d.mailingCity,
    d.mailingProvince,
    d.mailingPostal,
    d.mailingCountry,
  ].filter((p) => p && String(p).trim());
  return parts.join(', ');
}

/** Compose a full phone number (country code + number). */
export function composePhone(d = {}) {
  const cc = String(d.phoneCountryCode || '').replace(/^\+/, '').trim();
  const num = String(d.phoneNumber || '').trim();
  if (!num) return '';
  return cc ? `+${cc} ${num}` : num;
}

/** Derive correct pronouns/honorific from the applicant's sex to avoid the
 *  copy-paste misgendering seen in hand-written letters. */
export function pronouns(data = {}) {
  const s = String(data.sex || '').toLowerCase();
  if (s.startsWith('f')) return { subj: 'she', obj: 'her', pos: 'her', honorific: 'Ms.' };
  if (s.startsWith('m')) return { subj: 'he', obj: 'him', pos: 'his', honorific: 'Mr.' };
  return { subj: 'they', obj: 'them', pos: 'their', honorific: '' };
}

/** Reusable boilerplate arguments that recur across the firm's letters.
 *  These are guidance strings for the model, not verbatim text to paste. */
export const BOILERPLATE = {
  sanctionsTransfer:
    'If the applicant is from a country whose banks face international sanctions (e.g. Iran), ' +
    'include one sentence explaining that funds are transferred through licensed exchange ' +
    'offices because direct international bank transfers are not available.',
  temporaryIntent:
    'Reinforce temporary intent using any of: an approved leave of absence from an employer, ' +
    'a confirmed job offer or promotion awaiting the applicant on return, family/dependents at ' +
    'home, property/assets, and the absence of any status or ties in Canada.',
  sourceOfFunds:
    'Where large funds appear, briefly explain their source (e.g. property or vehicle sale, ' +
    'salary, business income) so the officer can see the money is legitimate and traceable.',
};

/** First-year cost benchmark used in the financial summary (single applicant,
 *  outside Quebec). Living-cost figure is the IRCC 2024 requirement. */
export const COST_BENCHMARK = {
  livingPerYear: 20635,
  travelEstimate: 2000,
};
