import fs from 'fs/promises';
import sharp from 'sharp';
import { getApplication, updateApplication } from './store';
import { readUpload, generatedTarget, docFile, genFile } from './uploads';
import { queueSync } from './driveStore';
import { getAppType, formsFor, packagesFor, lettersFor } from './appTypes';
import { produceDocs, refreshNextSteps } from './generateDocs';
import { buildPackageFile, ensureGenerated } from './compileJob';
import { letterSpec } from './generators/letters';
import { rasterizePdf } from './raster';
import { NEVER, narrowPackage, planPackage, describePlan } from './packagePlan';
import { finalSetFor, ALWAYS } from './finalSets';
import { CATEGORY_LABELS } from './docLabels';

/**
 * The files the firm uploads to the IRCC portal — one PDF per portal slot —
 * numbered and named the way the team names them in each client's
 * "02 - Final Files" folder: "05 - Client Information - Zahra.pdf".
 *
 * Learned from the firm's 2026 final folders (file names only):
 *   - forms first (main form, Schedule 1, IMM 5645, IMM 5476), then Passport
 *     and Photo, then Client Information, then documents that have their own
 *     slot (Marriage Certificate always stands alone), Submission Letter last;
 *   - which documents get their own slot depends on the application type;
 *   - everything else supporting the file goes inside Client Information.
 */

/** Portal slots: how each final file is made. */
const SLOT = {
  passport: { name: 'Passport', categories: ['passport'] },
  photo: { name: 'Photo', photo: true },
  'client-info': { name: 'Client Information', pkg: 'client-info' },
  financial: { name: 'Financial Support', pkg: 'financial-proof', categories: ['proof-of-funds', 'supporter-bank', 'supporter-income', 'supporter-deeds', 'title-deeds', 'deposit', 'gic', 'affidavit-support', 'source-of-funds'] },
  inviter: { name: "Inviter's Documents", pkg: 'inviter-docs', categories: ['invitation-letter', 'host-docs', 'supporter-id', 'inviter-docs', 'supporter-income', 'supporter-bank', 'supporter-deeds'] },
  business: { name: 'Business Documents', pkg: 'business-docs', categories: ['business-docs', 'business-financials', 'business-contracts', 'business-employees', 'business-premises', 'business-plan'] },
  marriage: { name: 'Marriage Certificate', categories: ['marriage-cert'] },
  'birth-nid': { name: 'Birth Certificate & National ID Card', categories: ['national-id'] },
  police: { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
  education: { name: 'Education and Certificates', categories: ['transcripts', 'certificates'] },
  transcript: { name: 'Recent Education Transcript', categories: ['transcripts'] },
  completion: { name: 'Completion of Studies Letter', categories: ['completion-letter'] },
  cv: { name: 'CV', categories: ['cv'] },
  language: { name: 'Language Test Result', categories: ['language'] },
  loa: { name: 'Letter of Acceptance', categories: ['loa', 'enrolment-letter'] },
  pal: { name: 'PAL', categories: ['pal'], generatedKey: 'pal-exemption', generatedName: 'PAL Exemption' },
  deposit: { name: 'Tuition Payment Confirmation', categories: ['deposit', 'gic'] },
  // The study permit portal has separate slots for tuition and the GIC.
  tuition: { name: 'Proof of Tuition Payment', categories: ['deposit'] },
  gic: { name: 'GIC', categories: ['gic'] },
  relationship: { name: 'Proof of Relationship', categories: ['relationship-proof'] },
  'family-status': { name: 'Family Member Proof of Status', pkg: 'family-status', categories: ['spouse-status'] },
  // A spouse abroad: the spouse in Canada's permit and passport / visa together.
  'spouse-status': { name: 'Family Proof of Status', categories: ['spouse-status', 'supporter-id'] },
  enrolment: { name: "Proof of Student's Enrolment", categories: ['enrolment-letter'] },
  medical: { name: 'Medical Exam', categories: ['medical'] },
  insurance: { name: 'Health Insurance', categories: ['medical-insurance'] },
  employment: { name: 'Employment Documents', categories: ['employment-letter', 'leave-of-absence'] },
  custody: { name: 'Custody Document', categories: ['custody-doc'] },
  consent: { name: 'Consent for Travel', categories: ['consent-letter'] },
  // The portal has one slot for both: "Custody Documents, including a Parental Consent Letter".
  'custody-consent': { name: 'Custody and Parental Consent', categories: ['custody-doc', 'consent-letter'] },
  lmia: { name: 'LMIA or Offer of Employment', categories: ['lmia'] },
  'job-offer': { name: 'Offer of Employment', categories: ['job-offer'] },
  contract: { name: 'Employment Contract', categories: ['employment-contract'] },
  'job-requirements': { name: 'Proof of Meeting the Job Requirements', categories: ['certificates'] },
  degrees: { name: 'Education', categories: ['transcripts'] },
  invitation: { name: 'Invitation Letter', categories: ['invitation-letter'] },
  submission: { name: 'Submission Letter', generatedKey: 'submission-letter' },
  // A reconsideration goes through the IRCC webform: the request letter, the consent (IMM 5744) and the decision.
  reconsideration: { name: 'Reconsideration Request', generatedKey: 'reconsideration-letter' },
  refusal: { name: 'Refusal Letter and GCMS Notes', categories: ['refusal-letter'] },
};

/**
 * The IRCC portal's upload slot for each final file, per portal application
 * flow (research/ircc-portal/, captured 2026-09-30). The portal takes one file
 * per slot, 4 MB at most. `null`: that flow has no slot of its own for it.
 */
const POOL = {
  'Study — outside Canada': 'sp-out',
  'Work — outside Canada': 'wp-out',
  'Visit — outside Canada': 'trv',
  'Visit — inside Canada': 'trv',
  'Work — inside Canada': 'wp-ext',
  'Study — inside Canada': 'sp-ext',
};
const portalPool = (t) => (t.key === 'visitor-record' ? 'vr' : t.key === 'reconsideration' ? null : POOL[t.group] || null);
const ALL = (name) => ({ '*': name });
const PORTAL = {
  passport: ALL('Passport'),
  photo: ALL('Digital photo'),
  'client-info': ALL('Client Information'),
  financial: ALL('Proof of Means of Financial Support'),
  inviter: { '*': null },
  business: { trv: 'Business Registration', '*': null },
  marriage: ALL('Marriage License/Certificate'),
  'birth-nid': { trv: 'Birth Registration/Certificate', '*': null },
  police: { 'sp-out': 'Police certificate', 'wp-out': 'Police certificate', trv: 'Police certificate', '*': null },
  education: { 'wp-out': 'Education (diplomas/degrees)', 'sp-out': 'Recent Education Transcript', 'wp-ext': 'Recent Education Transcript', '*': null },
  transcript: ALL('Recent Education Transcript'),
  completion: ALL('Completion of Studies Letter'),
  cv: ALL('CV/résumé'),
  language: { 'sp-out': 'Proof of IELTS language test results (or Proof of TEF language test results)', '*': 'Proof of Language Proficiency' },
  loa: ALL('Letter of Acceptance or Letter of Enrollment / Registration'),
  pal: ALL('Provincial or Territorial Attestation Letter (PAL or TAL)'),
  deposit: ALL('Proof of tuition payment'),
  tuition: ALL('Proof of tuition payment'),
  gic: ALL('Proof of Guaranteed Investment Certificate (GIC)'),
  relationship: { 'sp-out': null, 'wp-out': null, '*': 'Proof of Relationship' },
  'family-status': { 'wp-ext': 'Family Member Proof of Status', 'sp-ext': 'Family Member Proof of Status', vr: 'Family Member Proof of Status', '*': null },
  'spouse-status': { 'wp-ext': 'Family Member Proof of Status', 'sp-ext': 'Family Member Proof of Status', vr: 'Family Member Proof of Status', '*': null },
  enrolment: ALL('Registration letter from a designated learning institution (DLI) / attestation letter detailing enrolment'),
  medical: ALL('Proof of upfront medical exam'),
  insurance: ALL('Medical Insurance Coverage'),
  employment: { 'wp-out': 'Letter from Current Employer', '*': 'Employment Letter' },
  custody: ALL('Custody Documents, including a Parental Consent Letter'),
  consent: ALL('Custody Documents, including a Parental Consent Letter'),
  'custody-consent': ALL('Custody Documents, including a Parental Consent Letter'),
  invitation: { trv: null, '*': 'Invitation Letter' },
  submission: ALL("Representative's Submission Letter"),
  reconsideration: ALL('IRCC webform — request for reconsideration (attach)'),
  refusal: ALL('IRCC webform — the refusal letter and officer notes (attach)'),
  lmia: { 'wp-out': 'Labour Market Impact Assessment (LMIA) from ESDC — or IMM5802 Offer of Employment (LMIA-exempt)', '*': 'Labour Market Impact Assessments (LMIA) from ESDC or Proof of Submission — or IMM5802 Offer of Employment' },
  'job-offer': ALL('Offer of Employment'),
  contract: ALL('Employment Contract'),
  'job-requirements': ALL('Proof that you Meet the Requirements of the Job Being Offered'),
  degrees: { 'wp-out': 'Education (diplomas/degrees)', '*': 'Recent Education Transcript' },
};
// Where a file with no slot of its own can go instead.
const NO_SLOT_HINT = {
  inviter: 'Split it into Notice of Assessment, T4 or T1, Inviter\'s Employment Letter and Letter of Support — or upload it in Client Information',
  invitation: 'The visitor visa flow has no Invitation Letter slot — put it in Client Information',
};
const FORM_PORTAL = { imm5476: 'Use of Representative (IMM5476)', imm5257b: 'Schedule 1 (IMM 5257) — optional slot', imm5645: 'Family Information (IMM5645) — optional slot' };

/** The portal slot a final file is uploaded to: { name } or { name: null, hint }. */
function portalSlot(slotKey, t, app) {
  const pool = portalPool(t);
  if (!pool) return null;
  if (slotKey.startsWith('form:')) {
    const key = slotKey.slice(5);
    return { name: FORM_PORTAL[key] || (key === 'imm5713' ? null : 'Application Form(s)') };
  }
  const m = PORTAL[slotKey];
  if (!m) return null;
  let name = pool in m ? m[pool] : m['*'];
  if (slotKey === 'pal' && (app.data?.palExempt === true || app.data?.palExempt === 'yes')) name = 'Proof of Provincial or Territorial Attestation Letter (PAL or TAL) Exception';
  return name ? { name } : { name: null, hint: NO_SLOT_HINT[slotKey] || 'No slot of its own in this portal application — upload it in Client Information' };
}

// Final-file order per application type, as in the firm's 2026 final folders.
// "forms" expands to the type's IRCC forms (main, Schedule 1, 5645, 5476 …).
// Custody and consent share one portal slot, so they go out as one file.
const STUDY_MINOR = ['forms', 'loa', 'pal', 'passport', 'photo', 'client-info', 'financial', 'custody-consent', 'police', 'submission'];
const TRV = ['forms', 'passport', 'photo', 'client-info', 'financial', 'relationship', 'marriage', 'police', 'inviter', 'submission'];
const TRV_CHILD = ['forms', 'passport', 'photo', 'client-info', 'financial', 'custody-consent', 'relationship', 'inviter', 'submission'];
const OWP_INSIDE = ['forms', 'passport', 'photo', 'client-info', 'marriage', 'medical', 'submission'];
const LISTS = {
  'study-permit': ['forms', 'passport', 'photo', 'client-info', 'financial', 'loa', 'pal', 'police', 'language', 'tuition', 'gic', 'education', 'submission'],
  'study-permit-minor': STUDY_MINOR,
  'study-permit-child-of-worker': [...STUDY_MINOR.slice(0, -1), 'inviter', 'submission'],
  'study-permit-inside': ['forms', 'passport', 'client-info', 'financial', 'photo', 'loa', 'pal', 'marriage', 'submission'],
  'study-permit-inside-child': ['forms', 'passport', 'client-info', 'financial', 'photo', 'loa', 'pal', 'custody-consent', 'submission'],
  // Spouse abroad (open work permit), as in the firm's "Zahra - SOWP" folder:
  // Client Information holds the letters, work, financial and ties documents;
  // the spouse's status, the applicant's identity, marriage, police and
  // education documents each have their own file.
  'owp-outside': ['forms', 'passport', 'photo', 'client-info', 'spouse-status', 'enrolment', 'birth-nid', 'marriage', 'police', 'education', 'submission'],
  'owp-worker-spouse': ['forms', 'passport', 'photo', 'client-info', 'spouse-status', 'birth-nid', 'marriage', 'police', 'education', 'submission'],
  'imp-c11': ['forms', 'passport', 'photo', 'client-info', 'business', 'financial', 'cv', 'education', 'police', 'marriage', 'submission'],
  // Employer-specific permits: each job document has its own portal slot.
  'wp-employer-outside': ['forms', 'passport', 'photo', 'client-info', 'lmia', 'job-offer', 'contract', 'job-requirements', 'employment', 'degrees', 'cv', 'language', 'financial', 'police', 'marriage', 'medical', 'submission'],
  'wp-extension': ['forms', 'passport', 'photo', 'client-info', 'lmia', 'job-offer', 'contract', 'job-requirements', 'cv', 'language', 'marriage', 'medical', 'submission'],
  'iranian-owp': OWP_INSIDE,
  // The spouse in Canada's documents have their own slot in the extension flow.
  'sowp-inside': ['forms', 'passport', 'photo', 'client-info', 'family-status', 'marriage', 'medical', 'submission'],
  // PGWP applicants must now prove their language level.
  pgwp: ['forms', 'client-info', 'passport', 'photo', 'completion', 'transcript', 'language', 'marriage', 'submission'],
  'trv-outside': TRV,
  'trv-spouse': TRV,
  'trv-business': ['forms', 'passport', 'photo', 'client-info', 'business', 'financial', 'marriage', 'police', 'submission'],
  'trv-child': TRV_CHILD,
  'trv-child-of-student': TRV_CHILD,
  'trv-inside': ['forms', 'client-info', 'passport', 'photo', 'marriage', 'submission'],
  'super-visa': ['forms', 'passport', 'photo', 'employment', 'police', 'insurance', 'birth-nid', 'marriage', 'client-info', 'financial', 'relationship', 'inviter', 'submission', 'medical'],
  'visitor-record': ['forms', 'client-info', 'passport', 'photo', 'marriage', 'financial', 'relationship', 'invitation', 'submission'],
  reconsideration: ['reconsideration', 'forms', 'refusal'],
};

const firstName = (app) => String(app.data?.givenName || '').trim().split(/\s+/)[0] || '';
const pad = (n) => String(n).padStart(2, '0');
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').trim();

/** Uploaded signed copy of a form (e.g. "02 - imm5476e Signed.pdf"), if any. */
function signedUpload(app, formKey) {
  const num = formKey.replace(/^imm/i, '');
  const re = new RegExp(`imm\\s*${num}`, 'i');
  return (app.documents || []).find((d) => d.category === 'rep-form' && re.test(d.filename) && d.mime === 'application/pdf') || null;
}

/* --------------------------- the team's choices --------------------------- */

/**
 * The team's changes to an application's set (app.finalSetup):
 *   removed  optional files taken out of the type's standard set
 *   added    files added from the catalog
 *   custom   files made by hand: [{ id, name }] — slot "custom:<id>"
 *   assign   { documentId: slot | 'none' } — a document moved into a file, or left out
 */
export function setupOf(app) {
  const s = app.finalSetup || {};
  return { removed: s.removed || [], added: s.added || [], custom: s.custom || [], assign: s.assign || {}, updatedAt: s.updatedAt || null };
}

const DEFAULT_LIST = ['forms', 'passport', 'photo', 'client-info', 'submission'];

/**
 * The slots of the set, in order, before anything is planned:
 * [{ slot, fixed, seen?, of?, added?, custom? }]. The type's standard set
 * (lib/finalSets.js — learned from the latest applications) or, for types with
 * no history, the planner's own list; minus what the team took out, plus what
 * it added (before the submission letter).
 */
export function setSlots(app) {
  const t = getAppType(app.type);
  const setup = setupOf(app);
  const learned = finalSetFor(t.key);
  let base = learned ? learned.slots.map((s) => ({ ...s })) : (LISTS[t.key] || DEFAULT_LIST).map((slot) => ({ slot, fixed: ALWAYS.has(slot) }));
  base = base.filter((s) => s.fixed || !setup.removed.includes(s.slot));
  const have = new Set(base.map((s) => s.slot));
  const extra = [
    ...setup.added.filter((k) => SLOT[k] && !have.has(k)).map((slot) => ({ slot, fixed: false, added: true })),
    ...setup.custom.map((c) => ({ slot: `custom:${c.id}`, fixed: false, added: true, custom: c })),
  ];
  const at = base.findIndex((s) => s.slot === 'submission');
  if (at < 0) return [...base, ...extra];
  return [...base.slice(0, at), ...extra, ...base.slice(at)];
}

/** Definition of a slot, including files made by hand. */
function slotDef(app, slot) {
  if (slot.startsWith('custom:')) {
    const c = setupOf(app).custom.find((x) => `custom:${x.id}` === slot);
    return c ? { name: c.name, custom: true } : null;
  }
  return SLOT[slot] || null;
}

/** The categories a slot takes on its own (its package's sections included). */
function slotCategories(slot, pkgs) {
  const def = SLOT[slot];
  const out = new Set(def?.categories || []);
  const walk = (n) => {
    (n.categories || []).forEach((c) => out.add(c));
    (n.children || []).forEach(walk);
  };
  if (def?.pkg && pkgs[def.pkg]) pkgs[def.pkg].sections.forEach(walk);
  return out;
}

/** Documents moved into `slot` (force) and those moved elsewhere or left out (exclude). */
function moves(app, slot, inSet) {
  const force = [];
  const exclude = new Set();
  for (const [id, to] of Object.entries(setupOf(app).assign)) {
    if (to !== 'none' && !inSet.has(to)) continue; // its file was taken out: placed as usual
    if (to === slot) force.push(id);
    else exclude.add(id);
  }
  return { force, exclude };
}

/** The package definition a slot compiles, or a one-section one for a plain document slot. */
function slotPackage(app, def, pkgs, claimed) {
  // A file made by hand: just the documents put in it, one contents entry each.
  if (def.custom) return { title: def.name, extraName: def.name, flat: true, sections: [] };
  if (def.pkg && pkgs[def.pkg]) return def.pkg === 'client-info' ? narrowPackage(pkgs[def.pkg], claimed) : pkgs[def.pkg];
  const sections = [];
  if (def.generatedKey && app.data?.palExempt && letterSpec(app, def.generatedKey)) sections.push({ name: def.generatedName || def.name, generatedKey: def.generatedKey });
  // One entry per document, named from its check — so a file that holds
  // several documents gets a title page before each (lib/compile.js).
  sections.push({ name: def.name, categories: def.categories, perDoc: true });
  return { title: def.name, sections };
}

/**
 * The final-file plan for an application: ordered slots with what each one
 * would contain right now — `contents` lists the sections and files a package
 * takes, so the team sees where every document goes before building.
 * @returns {Array<{ n, slot, name, filename, kind, ready, note, contents, ... }>}
 */
export function planFinalFiles(app) {
  const t = getAppType(app.type);
  const list = setSlots(app);
  const inSet = new Set(list.map((s) => s.slot));
  const pkgs = packagesFor(app.type);
  const docs = app.documents || [];
  const gen = new Map((app.generated || []).map((g) => [g.key, g]));
  const who = firstName(app);
  const hasCat = (cats) => docs.some((d) => cats.includes(d.category));
  const hasLetter = (key) => gen.has(key) || Boolean(letterSpec(app, key));

  const entries = [];
  for (const item of list) {
    const slotKey = item.slot;
    const meta = { fixed: item.fixed, ...(item.seen ? { seen: item.seen, of: item.of } : {}), ...(item.added ? { added: true } : {}) };
    if (slotKey === 'forms') {
      for (const f of formsFor(app)) {
        // IRCC's own file names: imm1295e, imm5645e — Schedule 1 is imm5257_1e.
        const code = f.key === 'imm5257b' ? 'imm5257_1' : f.key;
        const upload = signedUpload(app, f.key);
        const filled = gen.get(`${f.key}-filled`);
        entries.push({
          ...meta,
          fixed: true,
          slot: `form:${f.key}`,
          kind: 'form',
          formKey: f.key,
          name: upload ? `${code}e Signed` : `${code}e`,
          label: f.label,
          source: upload ? { upload: upload.id } : filled ? { generated: filled.key } : null,
          ready: Boolean(upload || filled),
          note: upload ? 'signed copy uploaded' : filled ? 'pre-filled official form' : 'pre-filled when you build (or upload the signed copy)',
        });
      }
      continue;
    }
    const def = slotDef(app, slotKey);
    if (!def) continue;
    if (def.pkg && !pkgs[def.pkg] && !def.categories) continue; // the type has no such package
    const kind = def.custom ? 'package' : def.photo ? 'photo' : def.pkg && pkgs[def.pkg] ? 'package' : def.generatedKey && !def.categories ? 'letter' : 'documents';
    entries.push({ ...meta, slot: slotKey, kind, name: def.name, ...(def.custom ? { custom: true } : {}), ready: false, note: '', contents: null });
  }

  // What each slot takes. Client Information is planned last: it holds
  // whatever no other file claims.
  const claimed = claimedCategories(entries, app);
  for (const e of entries) {
    const def = slotDef(app, e.slot);
    if (e.kind === 'form') continue;
    if (e.kind === 'photo') {
      const photo = docs.find((d) => d.category === 'photo');
      e.ready = Boolean(photo);
      e.note = e.ready ? '' : 'upload the digital photo';
      e.contents = photo ? [{ name: def.name, letter: false, files: [photo.filename], children: [] }] : [];
    } else if (e.kind === 'letter') {
      e.ready = hasLetter(def.generatedKey);
      e.note = gen.has(def.generatedKey) ? '' : 'drafted when built';
      e.contents = e.ready ? [{ name: def.name, letter: true, files: [], children: [] }] : [];
    } else {
      const pkgDef = slotPackage(app, def, pkgs, claimed);
      const plan = planPackage(app, pkgDef, { ...(e.slot === 'client-info' ? { claimed } : { owned: new Set() }), ...moves(app, e.slot, inSet) });
      e.contents = describePlan(plan, { hasLetter });
      e.ready = e.contents.length > 0;
      if (!e.ready) e.note = e.custom ? 'add the documents it should hold' : e.kind === 'package' ? 'nothing to put in it yet' : 'no documents of this type yet';
    }
  }

  // Number only the files that will exist; empty optional slots are listed unnumbered.
  let n = 0;
  return entries.map((e) => {
    // Forms and the photo are always part of the set (missing ones are flagged);
    // an optional slot with nothing to put in it is listed without a number.
    const optionalEmpty = !e.ready && !['form', 'photo'].includes(e.kind);
    const num = optionalEmpty ? null : ++n;
    const ext = e.kind === 'photo' ? 'jpg' : 'pdf';
    const portal = portalSlot(e.slot, t, app);
    return { ...e, n: num, filename: num ? `${pad(num)} - ${safe(e.name)}${who ? ` - ${safe(who)}` : ''}.${ext}` : null, ...(portal ? { portal } : {}) };
  });
}

/**
 * Uploaded documents that no final file would take (so the team can give them
 * a checklist code or category before building). Agency paperwork, forms and
 * the photo are never listed.
 */
export function unplacedDocuments(app, plan = planFinalFiles(app)) {
  const placed = new Set();
  for (const e of plan) for (const s of e.contents || []) for (const f of [s, ...s.children]) (f.ids || []).forEach((id) => placed.add(id));
  return (app.documents || []).filter((d) => !NEVER.has(d.category) && !placed.has(d.id)).map((d) => ({ id: d.id, filename: d.filename, category: d.category || null }));
}

const CATCH_ALL = /^(Other Supporting Documents|Additional Documents)$/;

/**
 * Where each loose document could go: documents left out of every file, and
 * those that only landed in a catch-all section ("Other Supporting
 * Documents"). For each, the files of the set whose type it is, then portal
 * files not in the set yet that take it, then Client Information.
 * @returns {Array<{ id, filename, category, label, where, options: [{ slot, name, action: 'move'|'add', portal? }] }>}
 */
export function documentSuggestions(app, plan = planFinalFiles(app)) {
  const t = getAppType(app.type);
  const pkgs = packagesFor(app.type);
  const where = new Map(); // doc id -> { slot, section }
  for (const e of plan) {
    for (const s of e.contents || []) {
      for (const id of s.ids || []) where.set(id, { slot: e.slot, section: s.name });
      for (const c of s.children) for (const id of c.ids || []) where.set(id, { slot: e.slot, section: c.name, parent: s.name });
    }
  }
  const inSet = plan.filter((e) => e.kind !== 'form').map((e) => e.slot);
  const out = [];
  for (const d of app.documents || []) {
    if (NEVER.has(d.category)) continue;
    const w = where.get(d.id);
    const loose = !w || (w.slot === 'client-info' && (CATCH_ALL.test(w.section) || CATCH_ALL.test(w.parent || '')));
    if (!loose) continue;
    const options = [];
    if (d.category) {
      for (const slot of inSet) if (slot !== w?.slot && SLOT[slot] && slotCategories(slot, pkgs).has(d.category)) options.push({ slot, name: SLOT[slot].name, action: 'move' });
      const takes = Object.keys(SLOT).filter((slot) => !inSet.includes(slot) && (SLOT[slot].categories || []).includes(d.category));
      for (const slot of oneOfEach(app, takes, new Set(inSet))) {
        const portal = portalSlot(slot, t, app);
        if (portal && !portal.name) continue; // no slot of its own in this portal flow
        options.push({ slot, name: SLOT[slot].name, action: 'add', ...(portal?.name ? { portal: portal.name } : {}) });
      }
    }
    // Files the team made by hand can take anything.
    for (const e of plan) if (e.custom && e.slot !== w?.slot) options.push({ slot: e.slot, name: e.name, action: 'move' });
    if (w?.slot !== 'client-info' && inSet.includes('client-info')) options.push({ slot: 'client-info', name: 'Client Information', action: 'move' });
    out.push({ id: d.id, filename: d.filename, category: d.category || null, label: CATEGORY_LABELS[d.category] || null, where: w ? w.slot : null, options });
  }
  return out;
}

// Files that are the same thing under different names (one portal slot, or the
// same documents): only one of each group is offered, the first that fits.
const SIMILAR = [
  ['custody-consent', 'consent', 'custody'],
  ['family-status', 'spouse-status'],
  ['education', 'transcript', 'degrees'],
  ['tuition', 'deposit'],
  ['lmia', 'job-offer'],
  ['loa', 'enrolment'],
  ['inviter', 'invitation'],
];

// Files only a work or a study application has.
const ONLY_FOR = {
  lmia: /^Work/, 'job-offer': /^Work/, contract: /^Work/, 'job-requirements': /^Work/, degrees: /^Work/,
  pal: /^Study/, gic: /^Study/, tuition: /^Study/, deposit: /^Study/,
};

/** Groups of interchangeable slots for this application, preferred member first. */
function similarGroups(app) {
  const t = getAppType(app.type);
  const groups = SIMILAR.map((g) => (g[0] === 'family-status' && t.where !== 'inside' ? ['spouse-status', 'family-status'] : g));
  // Files uploaded to the same portal slot in this flow are one file too.
  const grouped = new Set(groups.flat());
  const byPortal = new Map();
  for (const k of Object.keys(SLOT)) {
    if (grouped.has(k)) continue;
    const name = portalSlot(k, t, app)?.name;
    if (!name) continue;
    if (!byPortal.has(name)) byPortal.set(name, []);
    byPortal.get(name).push(k);
  }
  return [...groups, ...[...byPortal.values()].filter((g) => g.length > 1)];
}

/**
 * Of the slots that could be offered, one per group of similar files — none
 * when the set already holds one of the group.
 */
function oneOfEach(app, slots, inSet, learned = new Map()) {
  const groups = similarGroups(app);
  const groupOf = new Map();
  groups.forEach((g, i) => g.forEach((k) => groupOf.set(k, i)));
  const out = [];
  const done = new Set();
  for (const k of slots) {
    const gi = groupOf.get(k);
    if (gi === undefined) {
      out.push(k);
      continue;
    }
    if (done.has(gi)) continue;
    done.add(gi);
    const g = groups[gi];
    if (g.some((m) => inSet.has(m))) continue;
    const pick = [...g].filter((m) => slots.includes(m)).sort((a, b) => (learned.get(b)?.seen || 0) - (learned.get(a)?.seen || 0) || g.indexOf(a) - g.indexOf(b))[0];
    if (pick) out.push(pick);
  }
  return out;
}

/**
 * Files that can be added to the set: every portal file not in it (one of
 * each group of similar files), with its portal slot in this application's
 * portal flow, and how often the latest applications of this type had it.
 */
export function catalogFor(app) {
  const t = getAppType(app.type);
  const pkgs = packagesFor(app.type);
  const inSet = new Set(setSlots(app).map((s) => s.slot));
  const learned = new Map((finalSetFor(t.key)?.slots || []).map((s) => [s.slot, s]));
  const offer = Object.entries(SLOT)
    .filter(([k, def]) => !inSet.has(k) && !(def.pkg && !pkgs[def.pkg] && !def.categories))
    .filter(([k]) => !ONLY_FOR[k] || ONLY_FOR[k].test(t.group || '') || learned.has(k))
    .map(([k]) => k);
  return oneOfEach(app, offer, inSet, learned)
    .map((k) => {
      const portal = portalSlot(k, t, app);
      const l = learned.get(k);
      return { slot: k, name: SLOT[k].name, ...(portal?.name ? { portal: portal.name } : {}), ...(l ? { seen: l.seen, of: l.of } : {}) };
    })
    .sort((a, b) => (b.seen || 0) - (a.seen || 0) || Boolean(b.portal) - Boolean(a.portal) || a.name.localeCompare(b.name));
}

/**
 * Apply one change to the set and return the new app.finalSetup.
 *   { op: 'remove', slot }        take an optional file out (fixed ones stay)
 *   { op: 'add', slot }           add a file from the catalog
 *   { op: 'custom', name }        add a file made by hand
 *   { op: 'rename', slot, name }  rename a file made by hand
 *   { op: 'assign', doc, to }     put a document in a file (`to` a slot), leave
 *                                 it out ('none'), or back to automatic (null)
 *   { op: 'reset' }               back to the type's standard set
 * Throws with a message the team can read when the change is not allowed.
 */
export function applySetupChange(app, change) {
  const setup = setupOf(app);
  const list = setSlots(app);
  const clean = (name) => String(name || '').replace(/[\\:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  switch (change?.op) {
    case 'remove': {
      const item = list.find((s) => s.slot === change.slot);
      if (!item) throw new Error('That file is not in the set.');
      if (item.fixed) throw new Error('This file is always part of the set for this application type.');
      if (item.custom) {
        setup.custom = setup.custom.filter((c) => c.id !== item.custom.id);
      } else if (setup.added.includes(item.slot)) setup.added = setup.added.filter((k) => k !== item.slot);
      else setup.removed = [...new Set([...setup.removed, item.slot])];
      setup.assign = Object.fromEntries(Object.entries(setup.assign).filter(([, to]) => to !== item.slot));
      break;
    }
    case 'add': {
      if (!SLOT[change.slot]) throw new Error('Unknown file.');
      if (list.some((s) => s.slot === change.slot)) throw new Error('That file is already in the set.');
      if (setup.removed.includes(change.slot)) setup.removed = setup.removed.filter((k) => k !== change.slot);
      else setup.added = [...setup.added, change.slot];
      break;
    }
    case 'custom': {
      const name = clean(change.name);
      if (!name) throw new Error('Give the file a name.');
      const id = Math.random().toString(36).slice(2, 8);
      setup.custom = [...setup.custom, { id, name }];
      break;
    }
    case 'rename': {
      const name = clean(change.name);
      const c = setup.custom.find((x) => `custom:${x.id}` === change.slot);
      if (!c) throw new Error('Only files made by hand can be renamed.');
      if (!name) throw new Error('Give the file a name.');
      c.name = name;
      break;
    }
    case 'assign': {
      const doc = (app.documents || []).find((d) => d.id === change.doc);
      if (!doc) throw new Error('No such document.');
      if (NEVER.has(doc.category)) throw new Error('Forms, the photo and internal files are never compiled into a file.');
      const to = change.to;
      if (to == null) {
        const { [doc.id]: _drop, ...rest } = setup.assign;
        setup.assign = rest;
      } else {
        const target = list.find((s) => s.slot === to);
        if (to !== 'none' && (!target || !slotDef(app, to) || SLOT[to]?.photo || (SLOT[to]?.generatedKey && !SLOT[to]?.categories))) throw new Error('Documents can only be put in a file of the set that holds documents.');
        setup.assign = { ...setup.assign, [doc.id]: to };
      }
      break;
    }
    case 'reset':
      return { removed: [], added: [], custom: [], assign: {}, updatedAt: new Date().toISOString() };
    default:
      throw new Error('Unknown change.');
  }
  return { ...setup, updatedAt: new Date().toISOString() };
}

/** The IRCC portal's upload limit per file. */
export const PORTAL_MAX_BYTES = 4 * 1024 * 1024;

/** Categories that go out as their own files (so Client Information leaves them out). */
function claimedCategories(plan, app) {
  const pkgs = packagesFor(app.type);
  const claimed = new Set(['photo', 'rep-form', 'internal', 'questionnaire']);
  for (const e of plan) {
    if (e.slot === 'client-info' || e.kind === 'form') continue;
    const def = SLOT[e.slot];
    if (!def) continue; // forms, files made by hand
    (def.categories || []).forEach((c) => claimed.add(c));
    const walk = (s) => {
      (s.categories || []).forEach((c) => claimed.add(c));
      (s.children || []).forEach(walk);
    };
    if (def.pkg && pkgs[def.pkg]) pkgs[def.pkg].sections.forEach(walk);
  }
  return claimed;
}

/* ------------------------------ building ------------------------------ */

const jobs = (globalThis.__finalJobs ||= new Map()); // appId -> job

function view(job) {
  if (!job) return null;
  const { status, only, done, total, current, inner, startedAt, finishedAt, error, result } = job;
  return { status, only, done, total, current, inner, startedAt, finishedAt, error, ...(status === 'done' ? { result } : {}) };
}

export function getFinalJob(appId) {
  return view(jobs.get(appId));
}

/** Build every final file (in the background) — or just one slot (`only`). */
export function startFinalJob(appId, { cleanPages = true, fixRotation = true, only = null } = {}) {
  const running = jobs.get(appId);
  if (running?.status === 'running') return view(running);
  const job = { status: 'running', only, done: 0, total: 0, current: 'planning', inner: null, startedAt: new Date().toISOString(), finishedAt: null, error: null, result: null };
  jobs.set(appId, job);
  build(appId, { cleanPages, fixRotation, only }, job)
    .then((result) => {
      job.result = result;
      job.status = 'done';
    })
    .catch((e) => {
      job.status = 'failed';
      job.error = e.message || 'Building the final files failed.';
    })
    .finally(() => {
      job.current = null;
      job.inner = null;
      job.finishedAt = new Date().toISOString();
    });
  return view(job);
}

/** What one slot needs prepared before it can be built (letters, data sheet, pre-filled form). */
function prepFor(app, entries, have) {
  const keys = [];
  for (const e of entries) {
    if (e.kind === 'form') {
      keys.push(e.formKey);
      if (!signedUpload(app, e.formKey)) keys.push(`${e.formKey}-filled`);
    } else if (e.kind === 'letter') {
      const k = SLOT[e.slot].generatedKey;
      if (!have.has(k)) keys.push(k);
    }
    // Packages draft the letters they hold themselves (lib/compileJob.js).
  }
  return [...new Set(keys)];
}

async function build(appId, { cleanPages, fixRotation, only = null }, job) {
  let app = await getApplication(appId);
  const problems = [];
  const wanted = (e) => e.n && (!only || e.slot === only);

  // 1. Prepare everything the files are made from, in the same run:
  //    letters not drafted yet (drafted or edited ones are kept — redraft them
  //    individually), data sheets refreshed from the latest intake, and each
  //    official form pre-filled unless a signed copy was uploaded.
  //    For one file: only what that file needs.
  const have = new Set((app.generated || []).filter((g) => g.stored).map((g) => g.key));
  const prep = only
    ? prepFor(app, planFinalFiles(app).filter(wanted), have)
    : [
        ...lettersFor(app).map((l) => l.key).filter((k) => !have.has(k)),
        ...formsFor(app).map((f) => f.key),
        ...formsFor(app).filter((f) => !signedUpload(app, f.key)).map((f) => `${f.key}-filled`),
      ];
  const planned = planFinalFiles(app).filter(wanted).length;
  if (only && !planned) throw new Error('There is nothing to put in that file yet.');
  job.total = planned + 1; // + preparing
  job.current = 'Preparing letters and forms';
  job.inner = { done: 0, total: prep.length };
  const prepared = await produceDocs(app, prep, {
    onProgress: (i, n, title) => Object.assign(job.inner, { done: i - 1, total: n, current: title }),
  });
  app = prepared.app;
  // A form that couldn't be pre-filled is reported with its final file below.
  const fillErrors = new Map(prepared.errors.filter((e) => e.key.endsWith('-filled')).map((e) => [e.key.replace(/-filled$/, ''), e.message]));
  for (const e of prepared.errors.filter((x) => !x.key.endsWith('-filled'))) problems.push({ slot: null, filename: e.key, name: e.key, reason: e.message });
  job.done = 1;

  // 2. The numbered files.
  const plan = planFinalFiles(app).filter(wanted);
  const claimed = claimedCategories(planFinalFiles(app).filter((e) => e.n), app);
  const inSet = new Set(setSlots(app).map((s) => s.slot));
  const pkgs = packagesFor(app.type);
  job.total = plan.length + 1;

  const built = [];
  const stats = { rotatedPages: 0, droppedPages: 0, mirroredPages: 0, skippedFiles: [], uncertainPages: [], reorderedFiles: [] };
  const addStats = (s) => {
    if (!s) return;
    stats.rotatedPages += s.rotatedPages || 0;
    stats.droppedPages += s.droppedPages || 0;
    stats.mirroredPages += s.mirroredPages || 0;
    stats.skippedFiles.push(...(s.skippedFiles || []));
    stats.uncertainPages.push(...(s.uncertainPages || []));
    stats.reorderedFiles.push(...(s.reorderedFiles || []));
  };
  const record = async (key, meta) => {
    app = await updateApplication(app.id, (a) => {
      const m = new Map((a.generated || []).map((g) => [g.key, g]));
      m.set(key, meta);
      a.generated = [...m.values()];
      return a;
    });
  };

  for (const e of plan) {
    job.current = e.filename;
    job.inner = {};
    const key = `final-${pad(e.n)}`;
    try {
      if (e.kind === 'form') {
        // Official forms go out untouched (their barcodes and XFA must survive).
        if (!e.source) {
          throw new Error(
            `${fillErrors.get(e.formKey) || 'could not be pre-filled'} — fill the official form from its data sheet (Working files), or upload the signed copy`
          );
        }
        const src = e.source.upload
          ? await docFile(app.id, (app.documents || []).find((d) => d.id === e.source.upload))
          : await genFile(app, (app.generated || []).find((g) => g.key === e.source.generated));
        const target = await generatedTarget(app.id, { key, filename: e.filename });
        await fs.copyFile(src, target.file);
        const meta = await target.meta();
        await record(key, meta);
        built.push({ ...e, key, size: meta.size });
      } else if (e.kind === 'photo') {
        const doc = (app.documents || []).find((d) => d.category === 'photo');
        if (!doc) throw new Error(e.note);
        let img = await readUpload(app.id, doc);
        if (doc.mime === 'application/pdf') img = (await rasterizePdf(img, { dpi: 300, lastPage: 1 }))[0]?.buffer;
        const target = await generatedTarget(app.id, { key, filename: e.filename, mime: 'image/jpeg' });
        await sharp(img).rotate().jpeg({ quality: 92 }).toFile(target.file);
        const meta = await target.meta();
        await record(key, meta);
        built.push({ ...e, key, size: meta.size });
      } else if (e.kind === 'letter') {
        app = await ensureGenerated(app, SLOT[e.slot].generatedKey);
        const g = (app.generated || []).find((x) => x.key === SLOT[e.slot].generatedKey);
        if (!g?.stored) throw new Error('the letter could not be drafted');
        const target = await generatedTarget(app.id, { key, filename: e.filename });
        await fs.copyFile(await genFile(app, g), target.file);
        const meta = await target.meta();
        await record(key, meta);
        built.push({ ...e, key, size: meta.size });
      } else {
        // A package with a table of contents (Client Information, Financial
        // Support, Inviter's Documents), or a plain file of one document type.
        // Client Information leaves out everything that has its own portal slot.
        const def = slotDef(app, e.slot);
        const pkgDef = slotPackage(app, def, pkgs, claimed);
        const plain = e.kind !== 'package';
        const opts = { ...(e.slot === 'client-info' ? { claimed } : { owned: new Set() }), ...moves(app, e.slot, inSet) };
        const out = await buildPackageFile(app, pkgDef, { cleanPages, fixRotation, job: job.inner, plain, key, filename: e.filename, ...opts });
        app = out.app;
        addStats(out.stats);
        built.push({ ...e, key, size: out.meta.size, pages: out.stats.pages });
      }
    } catch (err) {
      problems.push({ slot: e.slot, filename: e.filename, name: e.name, reason: err.message });
    }
    job.done++;
  }

  // Record the set (one rebuilt file replaces its earlier version; the rest
  // stay) and drop final files left over from an earlier build that no longer
  // exist. Problems are kept with the set, so the reason a file was not built
  // stays visible after the page is reloaded.
  const fresh = built.map(({ n, slot, name, filename, key, size, pages }) => ({ n, slot, name, filename, key, size, pages }));
  const freshKeys = new Set(fresh.map((f) => f.key));
  app = await updateApplication(app.id, (a) => {
    const prev = only ? (a.finalFiles?.files || []).filter((f) => f.slot !== only && !freshKeys.has(f.key)) : [];
    const files = [...prev, ...fresh].sort((x, y) => x.n - y.n);
    const keep = new Set(files.map((f) => f.key));
    const prevProblems = only ? (a.finalFiles?.problems || []).filter((p) => p.slot !== only) : [];
    a.generated = (a.generated || []).filter((g) => !g.key.startsWith('final-') || keep.has(g.key));
    a.finalFiles = { builtAt: only && a.finalFiles?.builtAt ? a.finalFiles.builtAt : new Date().toISOString(), files, problems: [...prevProblems, ...problems] };
    return a;
  });

  // 3. What is still missing, and what to do next (after a full build).
  let note = null;
  if (!only) {
    try {
      ({ app, note } = await refreshNextSteps(app));
    } catch (e) {
      console.error(`[finalFiles] next-steps note failed: ${e.message}`);
    }
  }

  queueSync(app.id); // copy the final and working files to the client's Drive folder
  return { files: app.finalFiles.files, built: fresh.map((f) => f.filename), only, problems, generated: app.generated, note, ...stats, skippedFiles: [...new Set(stats.skippedFiles)] };
}
