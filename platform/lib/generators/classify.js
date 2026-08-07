/**
 * Document classification into checklist / package categories.
 *
 * Fast path: filename heuristics at upload time (instant, no API cost).
 * Accurate path: the model assigns categories while reading the documents during
 * extraction (see extract.js) — those override the heuristics.
 */

// Does the filename indicate the document belongs to the supporter/sponsor
// rather than the applicant? Used to split bank/deed/ID docs by owner.
const SUPPORTER = /(father|mother|spouse|husband|wife|sponsor|supporter|پدر|مادر|همسر)/i;

const RULES = [
  ['passport', /passport|پاسپورت/i],
  ['loa', /\b(loa|acceptance|admission)\b/i],
  ['pal', /\b(pal|tal|attestation)\b/i],
  ['gic', /\bgic\b/i],
  ['deposit', /deposit|tuition[ _-]?receipt|payment[ _-]?confirmation/i],
  ['affidavit-support', /affidavit/i],
  ['supporter-income', /pay[ _-]?slip|salary[ _-]?slip|فیش[ _-]?حقوقی/i],
  ['source-of-funds', /source[ _-]?of[ _-]?(funds|money)|bill[ _-]?of[ _-]?sale|contract[ _-]?of[ _-]?sale|sale[ _-]?deed/i],
  ['cv', /\b(cv|resume|curriculum[ _-]?vitae)\b/i],
  ['leave-of-absence', /leave[ _-]?of[ _-]?absence/i],
  ['internship', /internship/i],
  ['employment-letter', /employment[ _-]?(letter|verification)|work[ _-]?experience|گواهی[ _-]?اشتغال/i],
  ['job-offer', /job[ _-]?offer/i],
  ['ties-docs', /\bties\b/i],
  ['language', /ielts|toefl|pte|celpip|duolingo|tef|tcf|language/i],
  ['police-clearance', /police|clearance|character[ _-]?certificate|criminal/i],
  ['military', /military|service[ _-]?card|conscription/i],
  ['flight', /flight|ticket|itinerary|reservation|booking/i],
  ['accommodation', /accommodation|housing|rental|lease|homestay/i],
  ['photo', /photo|عکس/i],
  ['medical', /medical|panel[ _-]?physician/i],
  ['sop', /\b(sop|statement[ _-]?of[ _-]?purpose|study[ _-]?plan)\b/i],
];

// Categories that differ by owner: [pattern, supporter category, applicant category]
const OWNER_SPLIT = [
  [/bank|statement|balance|saving/i, 'supporter-bank', 'proof-of-funds'],
  [/title[ _-]?deed|deed|sanad|سند/i, 'supporter-deeds', 'title-deeds'],
  [/birth[ _-]?certificate|national[ _-]?id|identity[ _-]?card|شناسنامه|کارت[ _-]?ملی/i, 'supporter-id', 'national-id'],
];

const TAIL_RULES = [
  ['proof-of-funds', /fund|loan/i],
  ['transcripts', /transcript|diploma|degree|marksheet|ریزنمرات/i],
  ['certificates', /certificate|certification|award|patent/i],
];

/** Guess a category from a filename. Returns a key or null. */
export function classifyByFilename(filename) {
  const name = String(filename || '');
  for (const [key, re] of RULES) {
    if (re.test(name)) return key;
  }
  const isSupporter = SUPPORTER.test(name);
  for (const [re, supporterKey, ownKey] of OWNER_SPLIT) {
    if (re.test(name)) return isSupporter ? supporterKey : ownKey;
  }
  for (const [key, re] of TAIL_RULES) {
    if (re.test(name)) return key;
  }
  return null;
}

/** Valid category keys the AI may assign (checklist/package keys + other). */
export const CATEGORY_KEYS = [
  'passport',
  'loa',
  'pal',
  'proof-of-funds',
  'source-of-funds',
  'affidavit-support',
  'title-deeds',
  'supporter-bank',
  'supporter-income',
  'supporter-deeds',
  'supporter-id',
  'gic',
  'deposit',
  'photo',
  'transcripts',
  'certificates',
  'cv',
  'national-id',
  'language',
  'sop',
  'employment-letter',
  'job-offer',
  'leave-of-absence',
  'internship',
  'ties-docs',
  'police-clearance',
  'military',
  'flight',
  'accommodation',
  'medical',
  'family-info',
  'other',
];
