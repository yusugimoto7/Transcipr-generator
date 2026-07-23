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
  ['deposit', /deposit|tuition[ _-]?receipt|payment[ _-]?confirmation/i],
  ['affidavit-support', /affidavit|support[ _-]?letter|sponsor/i],
  ['source-of-funds', /source[ _-]?of[ _-]?funds|bill[ _-]?of[ _-]?sale|title[ _-]?deed|property|sale[ _-]?deed/i],
  ['proof-of-funds', /bank|statement|fund|balance|saving|loan/i],
  ['cv', /\b(cv|resume|curriculum[ _-]?vitae)\b/i],
  ['national-id', /birth[ _-]?certificate|national[ _-]?id|identity[ _-]?card|شناسنامه|کارت[ _-]?ملی/i],
  ['title-deeds', /title[ _-]?deed|deed|sanad|سند/i],
  ['transcripts', /transcript|diploma|degree|marksheet|ریزنمرات/i],
  ['certificates', /certificate|certification|award|patent/i],
  ['language', /ielts|toefl|pte|celpip|duolingo|tef|tcf|language/i],
  ['job-offer', /job[ _-]?offer|employ|leave[ _-]?of[ _-]?absence|work[ _-]?experience/i],
  ['police-clearance', /police|clearance|character[ _-]?certificate|criminal/i],
  ['military', /military|service[ _-]?card|conscription/i],
  ['flight', /flight|ticket|itinerary|reservation|booking/i],
  ['accommodation', /accommodation|housing|rental|lease|homestay/i],
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
  'source-of-funds',
  'affidavit-support',
  'title-deeds',
  'gic',
  'deposit',
  'photo',
  'transcripts',
  'certificates',
  'cv',
  'national-id',
  'language',
  'sop',
  'job-offer',
  'police-clearance',
  'military',
  'flight',
  'accommodation',
  'medical',
  'family-info',
  'other',
];
