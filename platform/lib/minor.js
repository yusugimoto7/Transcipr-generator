/**
 * A minor applicant travelling without both parents. Pure (no imports) so the
 * type registry, the intake schema and the browser can all read it.
 *
 * IMM 5646 (custodianship declaration) goes in every file where the applicant
 * is under 18 and applies alone or with only one parent.
 */

export const BOTH_PARENTS = 'Accompanied by both parents';
export const ONE_PARENT = "With one parent — custody documents and the other parent's consent";
export const NO_PARENT = 'Without a parent — custodian in Canada (IMM 5646)';

/** Whole years from a YYYY-MM-DD birth date to today, or null. */
export function ageYears(dob, today = new Date()) {
  const m = String(dob || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  let age = today.getFullYear() - Number(m[1]);
  const md = (today.getMonth() + 1) * 100 + today.getDate();
  if (md < Number(m[2]) * 100 + Number(m[3])) age--;
  return age;
}

/** Under 18 (by date of birth). Unknown birth date → false. */
export const isMinor = (d = {}) => {
  const age = ageYears(d.dob);
  return age !== null && age < 18;
};

/**
 * Does this file need IMM 5646? The applicant is under 18 (or, birth date
 * not entered yet, the file is a child's) and is not travelling with both
 * parents.
 */
export function needsCustodianship(d = {}, type = '') {
  const age = ageYears(d.dob);
  if (age !== null && age >= 18) return false;
  if (age === null && !/child|minor/.test(type) && !d.minorArrangement) return false;
  if (d.minorArrangement === BOTH_PARENTS) return false;
  if (!d.minorArrangement && d.travelsWith === 'Both parents') return false;
  return true;
}
