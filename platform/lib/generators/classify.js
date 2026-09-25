import { codeMapFor } from '../appTypes';

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
  // Agency paperwork and templates must never be compiled into an IRCC package,
  // so this rule outranks everything (e.g. "CV template with a sample.docx"
  // must land here, not in 'cv').
  ['internal', /intake|template|فرم[ _-]?اطلاعات/i],
  ['passport', /passport|پاسپورت/i],
  ['invitation-letter', /invitation/i],
  ['host-docs', /\bhost\b|inviter/i],
  ['spouse-status', /spouse.?s?[ _-]?(work|study|open work)[ _-]?permit|husband.?s?[ _-]?permit|wife.?s?[ _-]?permit/i],
  ['status-in-canada', /\b(work|study)[ _-]?permit\b|visitor[ _-]?record/i],
  ['last-entry', /last[ _-]?entry|entry[ _-]?stamp|travel[ _-]?history/i],
  ['completion-letter', /completion[ _-]?(of[ _-]?studies|letter)|graduation[ _-]?letter/i],
  ['consent-letter', /consent/i],
  ['custody-doc', /custod|guardian|imm ?5646/i],
  ['refusal-letter', /refus|gcms|atip|previous[ _-]?application/i],
  ['marriage-cert', /marriage|عقد|ازدواج/i],
  ['insurance', /insurance|بیمه/i],
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

// The firm prefixes client documents with a document code ("103 - Passport",
// "124.1-مشخصات فردی", "1- 112 - Completed Version…"). Used when the name has
// no recognisable keyword (often Persian names). Only codes the firm uses
// consistently across files are mapped; ambiguous ones (123 sponsor mix,
// 129 last-entry vs ticket, 139) are left to the keyword rules and the AI.
const FIRM_CODES = {
  100: 'internal', // checklist
  101: 'national-id', // birth certificate
  102: 'national-id', // national ID card
  103: 'passport',
  104: 'photo',
  105: 'transcripts', // degree / study certificate
  106: 'transcripts', // transcripts / grade reports
  107: 'loa',
  109: 'deposit', // tuition payment
  110: 'language',
  111: 'questionnaire', // SOP / POT questionnaire — the firm writes the letter from it
  112: 'proof-of-funds',
  113: 'employment-letter',
  114: 'insurance',
  115: 'police-clearance',
  116: 'marriage-cert',
  117: 'certificates',
  118: 'ties-docs', // family / residence registration
  119: 'certificates', // licences
  120: 'title-deeds',
  121: 'flight',
  122: 'accommodation',
  124: 'internal', // personal profile form
  127: 'cv',
  128: 'internal', // background information form
  130: 'military',
  131: 'refusal-letter', // previous application / refusal / ATIP
  132: 'spouse-status',
  133: 'supporter-id',
  134: 'inviter-docs',
  135: 'inviter-docs',
  136: 'inviter-docs',
  137: 'inviter-docs',
  138: 'accommodation',
};

/**
 * The firm's document code in a filename, as a string: "1- 112 - Bank" →
 * "112", "107-1-PAL" → "107-1", "119-3 - Employees" → "119-3",
 * "124.1-Profile" → "124". Null when there is none. Digits glued to other
 * digits (file numbers like S231124, imm1294e) never match.
 */
export function firmCode(filename) {
  const m = String(filename || '').match(/(?:^|[^\d])(1[0-3]\d)(?:-(\d{1,2})(?=\s*[-–_ ]))?(?:\.\d+)?\s*[-–_ ]/);
  if (!m) return null;
  return m[2] ? `${m[1]}-${m[2]}` : m[1];
}

/**
 * The category the service's own code table gives a filename, or null. This is
 * the firm's naming convention, so it outranks the AI's reading of the file.
 */
export function codeCategory(filename, type) {
  const code = firmCode(filename);
  if (!code || !type) return null;
  const own = codeMapFor(type);
  return own[code] || own[code.split('-')[0]] || null;
}

// Codes that always mean "the OTHER person's document" (spouse / inviter).
// A keyword like "work permit" can't tell whose it is; the code can.
const OTHER_PERSON_CODES = new Set([132, 133, 134, 135, 136, 137]);

/**
 * Guess a category from a filename. With the application `type`, the
 * service's own code table decides first — the firm requires every file name
 * to carry its checklist code, and codes mean different things per service.
 */
export function classifyByFilename(filename, type) {
  const name = String(filename || '');
  const code = firmCode(name);
  // The SOP / POT questionnaire is what the firm writes the letter from.
  if (/questionnaire|پرسشنامه/i.test(name)) return 'questionnaire';
  const internal = RULES[0][1].test(name);
  if (!internal && /imm ?5621/i.test(name)) return 'refusal-letter';
  if (!internal && /\bimm ?\d{4}/i.test(name)) return 'rep-form';
  if (code && type && !internal) {
    const own = codeMapFor(type);
    if (own[code]) return own[code];
    const base = code.split('-')[0];
    if (base !== code && own[base]) return own[base];
  }
  const baseNum = code ? Number(code.split('-')[0]) : null;
  if (baseNum && OTHER_PERSON_CODES.has(baseNum) && !internal) return FIRM_CODES[baseNum];
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
  if (baseNum && FIRM_CODES[baseNum]) return FIRM_CODES[baseNum];
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
  'marriage-cert',
  'spouse-status',
  'inviter-docs',
  'host-docs',
  'invitation-letter',
  'status-in-canada',
  'last-entry',
  'completion-letter',
  'consent-letter',
  'custody-doc',
  'refusal-letter',
  'insurance',
  'travel-history',
  'enrolment-letter',
  'residence-abroad',
  'relationship-proof',
  'medical-insurance',
  'scholarship',
  'co-op-letter',
  'research-proposal',
  'business-docs',
  'business-financials',
  'business-contracts',
  'business-employees',
  'business-premises',
  'business-plan',
  'questionnaire',
  'rep-form',
  'internal',
  'other',
];
