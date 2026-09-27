import { completeJson } from './ai';
import { readUpload, buildDocBlocks } from './uploads';
import { rasterizePdf } from './raster';
import { buildChecklist } from './checklist';
import { codeCategory, firmCode } from './generators/classify';
import { checkDatePair, parseGregorian, isoDate } from './jalali';

/**
 * Document check (صحت و سقم): is each document accurate, complete and
 * consistent before it goes to IRCC?
 *
 * For every readable document the model reads the whole file and reports the
 * facts it states (names in Persian and Latin, dates in both calendars,
 * numbers), which parts it contains (certified translation, certified copy
 * of the original, the original itself, translator's seal) and any problems:
 * mistranslations, wrong or inconsistent dates, name spellings, typos, vague
 * or contradictory statements, poor legibility. The platform then adds its own
 * checks — every Jalali/Gregorian date pair is recomputed, facts are compared
 * with the intake and, across documents, with the passport (the reference
 * spelling), expiry and age of certificates are checked, and the translation
 * bundle is checked for the three parts the firm asks for.
 *
 * Result per document: status green / yellow / orange / red and findings.
 *   green   nothing found
 *   yellow  minor: typos, formatting, notes
 *   orange  needs attention: a part of the bundle missing, an unclear or vague
 *           statement, an inconsistency in secondary data
 *   red     serious: a name, date or number wrong or different from the
 *           passport/intake, a wrong date conversion, an expired document,
 *           missing translation, key data illegible
 */

const PAGES = 14; // pages sent per document (as images for large scans)
const SKIP = new Set(['internal', 'questionnaire', 'photo']);
const MONTH_MS = 30.44 * 86400000;

export const STATUS_ORDER = ['green', 'yellow', 'orange', 'red'];

export function needsCheck(doc) {
  return doc && !SKIP.has(doc.category) && ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(doc.mime);
}

/* ------------------------------ helpers ------------------------------ */

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z؀-ۿ]+/g, ' ')
    .trim();
const sameName = (a, b) => {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return true; // nothing to compare
  if (x === y) return true;
  const xs = x.split(' ').sort().join(' ');
  const ys = y.split(' ').sort().join(' ');
  return xs === ys; // "Zahra Mousavi" vs "Mousavi Zahra"
};
const sameNumber = (a, b) => {
  const x = String(a || '').replace(/[\s-]/g, '').toUpperCase();
  const y = String(b || '').replace(/[\s-]/g, '').toUpperCase();
  return !x || !y || x === y;
};

/** The checklist item a document belongs to (by its file code, else its category). */
function checklistItem(app, doc) {
  const items = buildChecklist(app.data || {}, app.type);
  const code = firmCode(doc.filename);
  if (code) {
    const hit = items.find((i) => String(i.code) === code) || items.find((i) => String(i.code) === code.split('-')[0]);
    if (hit) return hit;
  }
  return items.find((i) => i.key === doc.category) || null;
}

async function blocksFor(appId, doc) {
  if (doc.mime === 'application/pdf') {
    try {
      const pages = await rasterizePdf(await readUpload(appId, doc.stored), { dpi: 110, lastPage: PAGES });
      if (pages.length) {
        return {
          blocks: pages.map((p) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.buffer.toString('base64') } })),
          pages: pages.length,
        };
      }
    } catch {
      /* fall back to the PDF itself */
    }
  }
  const [, ...rest] = await buildDocBlocks(appId, [doc]);
  return { blocks: rest, pages: null };
}

/* ------------------------------ the check ------------------------------ */

/**
 * Check one document.
 * @param {object} app
 * @param {object} doc
 * @param {object} ctx  applicant: name; reference: facts from the passport (if known)
 * @returns {Promise<object>} verification record to store on the document
 */
export async function verifyDocument(app, doc, { applicant = '', reference = null } = {}) {
  const item = checklistItem(app, doc);
  const tr = Boolean(item?.tr);
  const d = app.data || {};
  const owner = doc.owner || 'applicant';
  const { blocks, pages } = await blocksFor(app.id, doc);

  const system = `You are a meticulous document checker at a Canadian immigration consultancy. Before a
client's document goes to IRCC you check it for accuracy, completeness and consistency. Most
documents are Iranian (Persian) with a certified English translation; a complete translation
bundle has (1) the certified English translation, (2) a copy of the original bearing the
translator's "true copy" stamp, and (3) the original document. You read Persian and English.
Report only what you can see; never invent. Be specific: quote the wrong text and say what it
should be, with the page.`;

  const instruction = `Document: "${doc.filename}"${item ? ` — checklist ${item.code}: ${item.label}` : ''}${
    doc.category ? ` (type: ${doc.category})` : ''
  }. Whose: ${owner === 'applicant' ? `the applicant${applicant ? ` ${applicant}` : ''}` : `the applicant's ${owner}`}.
${tr ? 'A certified translation bundle IS expected for this document (translation + certified copy + original).' : 'A translation bundle is NOT required for this document unless it is in a language other than English/French.'}
${reference ? `Reference spelling and data from the passport: ${JSON.stringify(reference)}.` : ''}
${d.givenName || d.familyName ? `Intake says the applicant is ${[d.givenName, d.familyName].filter(Boolean).join(' ')}${d.dob ? `, born ${d.dob}` : ''}${d.passportNumber ? `, passport ${d.passportNumber}` : ''}.` : ''}

Check the document and return JSON:
{
  "documentType": "<what it is, e.g. Birth certificate (shenasnameh) with certified translation>",
  "languages": ["fa", "en"],
  "parts": {
    "translation": true|false,      // certified English translation present
    "certifiedCopy": true|false,    // copy of the original with the translator's true-copy stamp
    "original": true|false,         // the original document (or a plain scan of it)
    "translatorSeal": true|false,   // translator's seal/stamp and signature on the translation
    "notes": "<anything about completeness, e.g. 'translation covers pages 1-2 only'>"
  },
  "legibility": "good"|"partial"|"poor",
  "facts": {                        // ONLY what this document states; omit unknown keys
    "fullNameLatin": "<name as written in the English translation>",
    "fullNamePersian": "<name in Persian>",
    "dobGregorian": "YYYY-MM-DD", "dobJalali": "YYYY/MM/DD",
    "documentNumber": "<certificate / ID / permit number>",
    "passportNumber": "<if a passport>",
    "issueDate": "YYYY-MM-DD", "expiryDate": "YYYY-MM-DD",
    "father": "<Latin>", "mother": "<Latin>", "spouse": "<Latin>",
    "employer": "<if an employment letter>", "position": "...", "salary": "...", "employedFrom": "YYYY-MM-DD", "employedTo": "YYYY-MM-DD|present"
  },
  "datePairs": [ { "jalali": "1352/03/14", "gregorian": "1973-06-04", "context": "date of birth", "page": 1 } ],  // EVERY date that appears in both calendars
  "findings": [
    { "severity": "low"|"medium"|"high", "kind": "translation"|"date"|"name"|"typo"|"discrepancy"|"vague"|"missing-part"|"legibility"|"validity"|"other",
      "text": "<what is wrong, quoting the text, and what it should be>", "page": 2 }
  ]
}

What to look for:
- Translation vs original: every name, date, number, place and relationship in the English must match the Persian; report omissions, additions and mistranslations (kind "translation", severity high when a fact is wrong, medium when a detail is missing).
- Names: the Latin spelling must be consistent within the document and with the passport reference above (kind "name", high).
- Dates: list every Jalali/Gregorian pair in datePairs (the platform recomputes them). Report dates that contradict each other within the document (kind "date").
- Typos and grammar in the English that do not change facts (kind "typo", low).
- Vague or missing essentials — e.g. an employment letter without dates, position, salary or letterhead; a bank letter without balance or dates; an unsigned or undated letter (kind "vague", medium).
- Contradictions within the document (kind "discrepancy").
- Missing parts of an expected translation bundle (kind "missing-part": translation missing = high; certified copy or original missing = medium). Do not report missing parts when a bundle is not expected.
- Validity: expired document, certificate issued long ago (kind "validity"; state the dates — the platform judges).
- Legibility: key data unreadable (kind "legibility", high if names/dates/numbers are unreadable).
If nothing is wrong, return an empty findings list. ${pages ? `(${pages} page image(s) follow.)` : ''}`;

  const res = await completeJson({ system, content: [{ type: 'text', text: instruction }, ...blocks], maxTokens: 2500, temperature: 0 });

  const findings = (Array.isArray(res.findings) ? res.findings : [])
    .filter((f) => f && f.text)
    .map((f) => ({
      severity: ['low', 'medium', 'high'].includes(f.severity) ? f.severity : 'medium',
      kind: String(f.kind || 'other'),
      text: String(f.text).slice(0, 600),
      page: Number.isFinite(Number(f.page)) ? Number(f.page) : null,
      by: 'ai',
    }));
  const facts = res.facts && typeof res.facts === 'object' ? res.facts : {};
  const parts = { translation: false, certifiedCopy: false, original: false, translatorSeal: false, ...(res.parts || {}) };
  const legibility = ['good', 'partial', 'poor'].includes(res.legibility) ? res.legibility : 'good';

  // --- The platform's own checks -------------------------------------------
  const add = (severity, kind, text, page = null) => findings.push({ severity, kind, text, page, by: 'platform' });

  for (const p of Array.isArray(res.datePairs) ? res.datePairs : []) {
    const r = checkDatePair(p?.jalali, p?.gregorian);
    if (r && !r.ok) {
      add('high', 'date', `${p.context ? `${p.context}: ` : ''}the Persian date ${p.jalali} is ${r.expected} in the Gregorian calendar, but the translation says ${r.got}.`, p.page ?? null);
    }
  }

  if (tr) {
    if (!parts.translation) add('high', 'missing-part', 'No certified English translation in this file — the firm requires the translation, the certified copy of the original and the original in one PDF.');
    else {
      if (!parts.certifiedCopy) add('medium', 'missing-part', "The certified copy of the original (with the translator's true-copy stamp) is missing from this file.");
      if (!parts.original) add('medium', 'missing-part', 'The original document is missing from this file.');
      if (!parts.translatorSeal) add('medium', 'missing-part', "The translator's seal or signature is not visible on the translation.");
    }
  }

  if (owner === 'applicant') {
    const intakeName = [d.givenName, d.familyName].filter(Boolean).join(' ');
    if (facts.fullNameLatin && intakeName && !sameName(facts.fullNameLatin, intakeName)) {
      add('high', 'name', `The name is written "${facts.fullNameLatin}" here but "${intakeName}" in the intake.`);
    }
    if (facts.dobGregorian && d.dob && facts.dobGregorian !== d.dob) {
      add('high', 'date', `Date of birth is ${facts.dobGregorian} here but ${d.dob} in the intake.`);
    }
    if (facts.passportNumber && d.passportNumber && !sameNumber(facts.passportNumber, d.passportNumber)) {
      add('high', 'discrepancy', `Passport number ${facts.passportNumber} here, ${d.passportNumber} in the intake.`);
    }
  }
  if (reference) {
    if (facts.fullNameLatin && reference.fullNameLatin && !sameName(facts.fullNameLatin, reference.fullNameLatin)) {
      add('high', 'name', `The name is spelled "${facts.fullNameLatin}" here but "${reference.fullNameLatin}" on the passport — spellings must match the passport exactly.`);
    }
    if (facts.dobGregorian && reference.dobGregorian && facts.dobGregorian !== reference.dobGregorian) {
      add('high', 'date', `Date of birth ${facts.dobGregorian} here, ${reference.dobGregorian} on the passport.`);
    }
  }

  const today = Date.now();
  const exp = facts.expiryDate ? parseGregorian(facts.expiryDate) : null;
  if (exp) {
    const t = Date.UTC(exp.gy, exp.gm - 1, exp.gd);
    if (t < today) add('high', 'validity', `Expired on ${isoDate(exp)}.`);
    else if (doc.category === 'passport' && t < today + 12 * MONTH_MS) add('medium', 'validity', `Passport expires on ${isoDate(exp)} — less than a year; IRCC issues the visa only up to the passport's expiry, and the checklist asks for a new passport.`);
  }
  const iss = facts.issueDate ? parseGregorian(facts.issueDate) : null;
  if (iss && doc.category === 'police-clearance' && Date.UTC(iss.gy, iss.gm - 1, iss.gd) < today - 6 * MONTH_MS) {
    add('medium', 'validity', `Police clearance issued on ${isoDate(iss)} — older than 6 months.`);
  }
  if (legibility === 'poor') add('high', 'legibility', 'The scan is too poor to read key data — a clearer scan is needed.');
  else if (legibility === 'partial') add('medium', 'legibility', 'Parts of the scan are hard to read.');

  return {
    status: statusOf(findings),
    documentType: res.documentType || null,
    languages: Array.isArray(res.languages) ? res.languages : [],
    parts,
    legibility,
    facts,
    findings,
    checkedAt: new Date().toISOString(),
  };
}

export function statusOf(findings) {
  if (findings.some((f) => f.severity === 'high')) return 'red';
  if (findings.some((f) => f.severity === 'medium')) return 'orange';
  if (findings.length) return 'yellow';
  return 'green';
}

/**
 * Cross-document consistency: within each person's documents the passport is
 * the reference; a document whose Latin name or date of birth differs gets a
 * finding. Mutates the verification records in place; returns the count added.
 */
export function crossCheck(docs) {
  let added = 0;
  const groups = new Map();
  for (const d of docs) {
    if (!d.verification?.facts) continue;
    const owner = d.owner || 'applicant';
    if (!groups.has(owner)) groups.set(owner, []);
    groups.get(owner).push(d);
  }
  for (const [, list] of groups) {
    const passport = list.find((d) => d.category === 'passport' && d.verification.facts.fullNameLatin);
    const ref = passport?.verification.facts;
    if (!ref) continue;
    for (const d of list) {
      if (d === passport) continue;
      const v = d.verification;
      const f = v.facts;
      const has = (kind, text) => v.findings.some((x) => x.kind === kind && x.text === text);
      if (f.fullNameLatin && ref.fullNameLatin && !sameName(f.fullNameLatin, ref.fullNameLatin)) {
        const text = `The name is spelled "${f.fullNameLatin}" here but "${ref.fullNameLatin}" on the passport (${passport.filename}) — spellings must match the passport exactly.`;
        if (!has('name', text)) {
          v.findings.push({ severity: 'high', kind: 'name', text, page: null, by: 'platform' });
          added++;
        }
      }
      if (f.dobGregorian && ref.dobGregorian && f.dobGregorian !== ref.dobGregorian) {
        const text = `Date of birth ${f.dobGregorian} here, ${ref.dobGregorian} on the passport (${passport.filename}).`;
        if (!has('date', text)) {
          v.findings.push({ severity: 'high', kind: 'date', text, page: null, by: 'platform' });
          added++;
        }
      }
      v.status = statusOf(v.findings);
    }
  }
  return added;
}

/** Summary counts for a file: { green, yellow, orange, red, unchecked }. */
export function verificationSummary(docs) {
  const out = { green: 0, yellow: 0, orange: 0, red: 0, unchecked: 0 };
  for (const d of docs || []) {
    if (!needsCheck(d)) continue;
    if (d.verification?.status) out[d.verification.status]++;
    else out.unchecked++;
  }
  return out;
}
