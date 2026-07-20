/**
 * Document classification into checklist categories.
 *
 * Fast path: filename heuristics at upload time (instant, no API cost).
 * Accurate path: Claude assigns categories while reading the documents during
 * extraction (see extract.js) — those override the heuristics.
 */

const RULES = [
  ['passport', /passport|پاسپورت/i],
  ['loa', /\b(loa|acceptance|offer[ _-]?letter|admission)\b/i],
  ['pal', /\b(pal|tal|attestation)\b/i],
  ['gic', /\bgic\b/i],
  ['proof-of-funds', /bank|statement|fund|balance|saving|deposit|loan/i],
  ['transcripts', /transcript|diploma|degree|certificat|marksheet|ریزنمرات/i],
  ['language', /ielts|toefl|pte|celpip|duolingo|tef|tcf|language/i],
  ['tuition-receipt', /tuition|receipt|payment/i],
  ['photo', /photo|عکس/i],
  ['medical', /medical|panel[ _-]?physician/i],
  ['sop', /\b(sop|statement[ _-]?of[ _-]?purpose|study[ _-]?plan)\b/i],
];

/** Guess a checklist category from a filename. Returns a key or null. */
export function classifyByFilename(filename) {
  const name = String(filename || '');
  for (const [key, re] of RULES) {
    if (re.test(name)) return key;
  }
  return null;
}

/** Valid category keys the AI may assign (checklist keys + other). */
export const CATEGORY_KEYS = [
  'passport',
  'loa',
  'pal',
  'proof-of-funds',
  'gic',
  'photo',
  'transcripts',
  'language',
  'sop',
  'tuition-receipt',
  'medical',
  'family-info',
  'other',
];
