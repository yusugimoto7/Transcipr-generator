import { completeJson, MODEL, secondModel, modelLabel } from './ai';
import { pageText } from './orientationOcr';
import { readUpload, buildDocBlocks } from './uploads';
import { rasterizePdf } from './raster';
import { buildChecklist } from './checklist';
import { codeCategory, firmCode } from './generators/classify';
import { checkDatePair, asciiDigits } from './jalali';
import { dateFindings } from './dateRules';

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
// The parts of a translation bundle, in the order the firm files them.
export const PAGE_PARTS = ['translation', 'certifiedCopy', 'original', 'other'];

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
      const pages = await rasterizePdf(await readUpload(appId, doc), { dpi: 110, lastPage: PAGES });
      if (pages.length) {
        return {
          blocks: pages.map((p) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.buffer.toString('base64') } })),
          pages: pages.length,
          pictures: pages.map((p) => p.buffer),
        };
      }
    } catch {
      /* fall back to the PDF itself */
    }
  }
  const [, ...rest] = await buildDocBlocks(appId, [doc]);
  const pictures = doc.mime !== 'application/pdf' ? [await readUpload(appId, doc)] : [];
  return { blocks: rest, pages: null, pictures };
}

/* ------------------------- two models, one verdict ------------------------- */

const words = (t) =>
  asciiDigits(String(t || ''))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length >= 3);
const similarity = (a, b) => {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / Math.min(A.size, B.size);
};
const sameFinding = (x, y) => (x.kind === y.kind || similarity(x.text, y.text) >= 0.6) && (similarity(x.text, y.text) >= 0.35 || (x.quote && y.quote && similarity(x.quote, y.quote) >= 0.6));

/**
 * Merge two models' findings: a finding both report is confirmed; one only
 * one reports is kept, unconfirmed. Facts, parts and legibility are compared.
 */
function mergeModels(a, b, labels) {
  const findings = [];
  const used = new Set();
  for (const f of a.findings) {
    const j = b.findings.findIndex((g, i) => !used.has(i) && sameFinding(f, g));
    if (j >= 0) {
      used.add(j);
      const g = b.findings[j];
      const sev = ['low', 'medium', 'high'];
      findings.push({ ...f, severity: sev[Math.max(sev.indexOf(f.severity), sev.indexOf(g.severity))], models: labels, confirmed: true });
    } else findings.push({ ...f, models: [labels[0]], confirmed: false });
  }
  b.findings.forEach((g, i) => {
    if (!used.has(i)) findings.push({ ...g, models: [labels[1]], confirmed: false });
  });
  const disagreements = [];
  const fa = a.facts || {};
  const fb = b.facts || {};
  for (const key of ['fullNameLatin', 'dobGregorian', 'passportNumber', 'documentNumber', 'expiryDate', 'issueDate']) {
    if (!fa[key] || !fb[key]) continue;
    const same = key === 'fullNameLatin' ? sameName(fa[key], fb[key]) : sameNumber(fa[key], fb[key]);
    if (!same) disagreements.push(`${key}: "${fa[key]}" (${labels[0]}) vs "${fb[key]}" (${labels[1]})`);
  }
  const partKeys = ['translation', 'certifiedCopy', 'original', 'translatorSeal'];
  const partsDiffer = partKeys.filter((k) => Boolean(a.parts[k]) !== Boolean(b.parts[k]));
  const parts = Object.fromEntries(partKeys.map((k) => [k, Boolean(a.parts[k] || b.parts[k])]));
  parts.notes = [a.parts.notes, b.parts.notes].filter(Boolean).join(' / ');
  const leg = ['good', 'partial', 'poor'];
  const legibility = leg[Math.max(leg.indexOf(a.legibility), leg.indexOf(b.legibility))];
  const seenPairs = new Set();
  const datePairs = [...a.datePairs, ...b.datePairs].filter((p) => {
    const k = `${p?.jalali}|${p?.gregorian}`;
    if (seenPairs.has(k)) return false;
    seenPairs.add(k);
    return true;
  });
  return { findings, facts: fa, factsSecond: fb, disagreements, partsDiffer, parts, legibility, datePairs, documentType: a.documentType || b.documentType, tocTitle: a.tocTitle || b.tocTitle, pageParts: Object.keys(a.pageParts || {}).length ? a.pageParts : b.pageParts || {}, languages: a.languages.length ? a.languages : b.languages };
}

/** Did the quoted text appear on the page? Only Latin quotes can be checked (OCR of Persian scans is unreliable). */
async function checkQuotes(findings, pictures) {
  const texts = new Map();
  const textOf = async (i) => {
    if (!texts.has(i)) {
      try {
        texts.set(i, words(await pageText(pictures[i])).join(' '));
      } catch {
        texts.set(i, '');
      }
    }
    return texts.get(i);
  };
  for (const f of findings) {
    if (f.by !== 'ai' || !f.quote) continue;
    const latin = words(f.quote).filter((w) => /^[a-z0-9]+$/.test(w));
    if (latin.length < 2 || !pictures.length) continue;
    const candidates = f.page && pictures[f.page - 1] ? [f.page - 1] : pictures.slice(0, 4).map((_, i) => i);
    let best = 0;
    for (const i of candidates) {
      const t = await textOf(i);
      const hit = latin.filter((w) => t.includes(w)).length / latin.length;
      best = Math.max(best, hit);
    }
    f.quoteChecked = true;
    if (best < 0.6) f.unverified = true; // the quoted words are not on the page — treat with suspicion
  }
}

/** How much a finding weighs in the colour: platform and confirmed findings fully; one-model-only or unverified ones one step less. */
function weight(f) {
  if (f.by === 'platform') return f.severity;
  if (f.unverified) return 'low';
  if (f.confirmed === false) return f.severity === 'high' ? 'medium' : 'low';
  return f.severity;
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
  const { blocks, pages, pictures } = await blocksFor(app.id, doc);

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
  "tocTitle": "<its title on the contents page of the submission package, 2-6 English words in the firm's style, e.g. 'Employment Letter', 'Pay Slips', 'Leave of Absence', 'Title Deed (An Apartment)', 'Bank Statement (Savings)', 'Source of Funds (Gold Sales Invoices)', 'Bachelor's Degree', 'Social Insurance Records' — say WHAT it is, never the person's name>",
  "languages": ["fa", "en"],
  "pageParts": { "1": "translation"|"certifiedCopy"|"original"|"other", "2": "..." },  // EVERY page image: which part of the bundle it is (certifiedCopy = a copy of the original bearing the translator's stamp; original = the document itself without that stamp; other = anything else)
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
    "issueDate": "YYYY-MM-DD",       // when THIS document was issued / printed / signed (a bank letter or statement: its date)
    "expiryDate": "YYYY-MM-DD",      // valid until / expires
    "translationDate": "YYYY-MM-DD", // the date on the certified translation (translator's stamp/date)
    "testDate": "YYYY-MM-DD",        // language test: the test date
    "examDate": "YYYY-MM-DD",        // medical: the exam date
    "programStart": "YYYY-MM-DD",    // letter of acceptance / PAL / enrolment: program start
    "travelDate": "YYYY-MM-DD",      // flight booking: departure date
    "validFrom": "YYYY-MM-DD", "validTo": "YYYY-MM-DD",   // insurance / permits: coverage or validity period
    "father": "<Latin>", "mother": "<Latin>", "spouse": "<Latin>",
    "employer": "<if an employment letter>", "position": "...", "salary": "...", "employedFrom": "YYYY-MM-DD", "employedTo": "YYYY-MM-DD|present"
  },
  "datePairs": [ { "jalali": "1352/03/14", "gregorian": "1973-06-04", "context": "date of birth", "page": 1 } ],  // EVERY date that appears in both calendars
  "findings": [
    { "severity": "low"|"medium"|"high", "kind": "translation"|"date"|"name"|"typo"|"discrepancy"|"vague"|"missing-part"|"legibility"|"validity"|"other",
      "text": "<what is wrong and what it should be>", "quote": "<the exact words on the page you are referring to, copied verbatim>", "page": 2 }
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
- Dates (read every one carefully; give all dates in the Gregorian calendar, converting Persian dates):
  the platform itself applies the firm's date rules to the dates you return in "facts" — financial documents
  older than 1 month (20 days = attention), employment letters older than 1 month, translations older than
  6 months, language tests older than 2 years, medical exams older than 1 year, passports with less than a
  year left, expired documents, police certificates older than 6 months, letters older than 3 months, program
  start dates or flights that have passed. Do NOT report those yourself — just return the dates accurately.
  DO report (kind "validity" or "date") other date problems that matter to the application, e.g.:
  a bank statement that does not cover the last 6 months, or whose balance date differs from the letter date;
  pay slips that are not the most recent months; a leave letter whose dates do not cover the trip
  (${d.visitFrom || d.visitTo ? `planned stay ${d.visitFrom || '?'} to ${d.visitTo || '?'}` : 'the planned stay'}); an employment start date or
  job history that contradicts itself; a spouse's or host's permit that ends before the planned stay or program
  ${d.programStart || d.programEnd ? `(program ${d.programStart || '?'} to ${d.programEnd || '?'})` : ''}; a child who will turn 18 or 22 before
  a decision; a marriage or relationship date that contradicts other dates; a document signed before an event
  it describes; an undated letter (medium).
- Legibility: key data unreadable (kind "legibility", high if names/dates/numbers are unreadable).
If nothing is wrong, return an empty findings list. ${pages ? `(${pages} page image(s) follow.)` : ''}`;

  const content = [{ type: 'text', text: instruction }, ...blocks];
  const ask = async (model) => {
    const res = await completeJson({ system, content, maxTokens: 2500, temperature: 0, model });
    return {
      findings: (Array.isArray(res.findings) ? res.findings : [])
        .filter((f) => f && f.text)
        .map((f) => ({
          severity: ['low', 'medium', 'high'].includes(f.severity) ? f.severity : 'medium',
          kind: String(f.kind || 'other'),
          text: String(f.text).slice(0, 600),
          quote: f.quote ? String(f.quote).slice(0, 200) : null,
          page: Number.isFinite(Number(f.page)) ? Number(f.page) : null,
          by: 'ai',
        })),
      facts: res.facts && typeof res.facts === 'object' ? res.facts : {},
      parts: { translation: false, certifiedCopy: false, original: false, translatorSeal: false, ...(res.parts || {}) },
      legibility: ['good', 'partial', 'poor'].includes(res.legibility) ? res.legibility : 'good',
      datePairs: Array.isArray(res.datePairs) ? res.datePairs : [],
      documentType: res.documentType || null,
      tocTitle: typeof res.tocTitle === 'string' && res.tocTitle.trim() ? res.tocTitle.trim().replace(/\.$/, '').slice(0, 60) : null,
      pageParts: Object.fromEntries(
        Object.entries(res.pageParts && typeof res.pageParts === 'object' ? res.pageParts : {})
          .filter(([k, v]) => /^\d+$/.test(k) && PAGE_PARTS.includes(v))
      ),
      languages: Array.isArray(res.languages) ? res.languages : [],
    };
  };

  // Two independent models when a second one is configured: the first must
  // answer; if the second fails, its absence is recorded and shown.
  const second = secondModel();
  const labels = [modelLabel(MODEL), second ? modelLabel(second) : null].filter(Boolean);
  let secondError = null;
  const [first, other] = await Promise.all([
    ask(MODEL),
    second
      ? ask(second).catch((e) => {
          secondError = e.message;
          return null;
        })
      : Promise.resolve(null),
  ]);
  let merged;
  if (other) merged = mergeModels(first, other, labels);
  else merged = { ...first, findings: first.findings.map((f) => ({ ...f, models: [labels[0]] })), disagreements: [], partsDiffer: [] };
  const { findings, facts, parts, legibility } = merged;
  await checkQuotes(findings, pictures);

  // --- The platform's own checks -------------------------------------------
  const add = (severity, kind, text, page = null) => findings.push({ severity, kind, text, page, by: 'platform' });

  for (const line of merged.disagreements) add('medium', 'discrepancy', `The two models read different values — ${line} — check by eye.`);
  if (merged.partsDiffer.length) add('medium', 'missing-part', `The two models disagree on whether the file contains its ${merged.partsDiffer.join(', ')} — check the bundle by eye.`);

  for (const p of merged.datePairs) {
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

  // The firm's date rules (lib/dateRules.js): age of financial documents, translations, tests, expiries…
  for (const f of dateFindings(doc, facts, d, { type: app.type })) findings.push(f);
  if (legibility === 'poor') add('high', 'legibility', 'The scan is too poor to read key data — a clearer scan is needed.');
  else if (legibility === 'partial') add('medium', 'legibility', 'Parts of the scan are hard to read.');

  return {
    status: statusOf(findings),
    documentType: merged.documentType,
    tocTitle: merged.tocTitle || null,
    // Which page is the translation, the certified copy, the original — the
    // package builder files them in that order (lib/packageDocs.js).
    pageParts: pages && merged.pageParts && Object.keys(merged.pageParts).length ? merged.pageParts : null,
    languages: merged.languages,
    parts,
    legibility,
    facts,
    ...(merged.factsSecond ? { factsSecond: merged.factsSecond } : {}),
    findings,
    models: labels,
    ...(secondError ? { secondModelError: secondError } : {}),
    checkedAt: new Date().toISOString(),
  };
}

export function statusOf(findings) {
  const w = findings.map(weight);
  if (w.includes('high')) return 'red';
  if (w.includes('medium')) return 'orange';
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
