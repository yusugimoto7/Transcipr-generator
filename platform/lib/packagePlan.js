import { CATEGORY_LABELS } from './docLabels';

/**
 * Which uploaded document goes where in a compiled package (Client
 * Information, Financial Support Proof…), decided once here and used both to
 * build the PDF (lib/compileJob.js) and to show the team what each final file
 * will contain before it is built (lib/finalFiles.js).
 *
 * A package definition (lib/appTypes.js) is a list of sections:
 *   { name, generatedKey }                       a drafted letter
 *   { name, categories: [...] }                  the uploads of those categories
 *   { name, categories, perDoc: 'Title Deed' }   one contents entry per upload,
 *                                                named "Title Deed (An Apartment)"
 *                                                from the document check, else
 *                                                "1st Title Deed", "2nd Title Deed"
 *   { name, children: [ ...the same... ] }       a/b/c sub-sections
 *   { name, catchAll: true }                     whatever is left over
 * Sections and sub-sections that end up empty are not compiled.
 */

// Never compiled into any file: agency paperwork, the firm's questionnaire,
// forms (they go out as their own files) and the photo.
export const NEVER = new Set(['internal', 'questionnaire', 'rep-form', 'photo']);

const ORDINAL = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const OWNER_WORD = { spouse: "My Spouse's", child: "My Child's", parent: "My Parent's", host: "My Host's", sponsor: "My Sponsor's" };

// Contents-page names in the team's wording, where the platform's own labels are not.
const TITLES = {
  'national-id': 'Birth Certificate / National ID Card',
  passport: 'Passport',
  'marriage-cert': 'Marriage Certificate',
  'police-clearance': 'Police Clearance Certificate',
  transcripts: 'Degree and Transcripts',
  certificates: 'Certificate',
  'employment-letter': 'Employment Letter',
  'leave-of-absence': 'Leave of Absence',
  'proof-of-funds': 'Bank Statement',
  'source-of-funds': 'Source of Funds',
  'title-deeds': 'Title Deed',
  'supporter-bank': 'Bank Statement',
  'supporter-income': 'Employment Letter and Pay Slips',
  'supporter-id': 'Passport and ID',
  'spouse-status': 'Permit in Canada',
  'enrolment-letter': 'Enrolment Letter',
  insurance: 'Social Insurance Records',
  military: 'Military Service Card',
  flight: 'Flight Ticket',
  accommodation: 'Accommodation Arrangement',
  'invitation-letter': 'Invitation Letter',
  'refusal-letter': 'Previous Decision',
  language: 'Language Test Result',
  medical: 'Medical Exam',
  cv: 'Curriculum Vitae',
};

/**
 * The title in a file named the team's way: "112 - Bank Statement - Sara.pdf"
 * → "Bank Statement" (the code and the person's name dropped).
 */
function titleFromFilename(filename) {
  const m = String(filename || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .match(/^\s*1[0-3]\d(?:-\d+)?\s*[-–_]\s*(.+?)\s*$/);
  if (!m) return '';
  const parts = m[1].split(/\s+[-–]\s+/);
  const title = (parts.length > 1 ? parts.slice(0, -1).join(' - ') : parts[0]).trim();
  return /[A-Za-z]{3}/.test(title) ? title : '';
}

/**
 * The contents-page name of one document: the check's short title, else the
 * section's name for one document ("Title Deed"), else the file's own name.
 */
function docTitle(doc, base) {
  const fromCheck = String(doc.verification?.tocTitle || '').trim();
  let title = fromCheck || base || titleFromFilename(doc.filename) || TITLES[doc.category] || CATEGORY_LABELS[doc.category] || 'Document';
  const owner = OWNER_WORD[doc.owner];
  if (owner && !/\b(spouse|child|parent|host|sponsor|husband|wife|father|mother)\b/i.test(title)) title = `${owner} ${title}`;
  return title;
}

/** One entry per document; the same name twice becomes "1st …", "2nd …". */
function perDocEntries(node, docs) {
  const base = typeof node.perDoc === 'string' ? node.perDoc : null;
  const entries = docs.map((d) => ({ name: docTitle(d, base), docs: [d] }));
  const count = new Map();
  for (const e of entries) count.set(e.name, (count.get(e.name) || 0) + 1);
  const seen = new Map();
  for (const e of entries) {
    if (count.get(e.name) < 2) continue;
    const n = (seen.get(e.name) || 0) + 1;
    seen.set(e.name, n);
    e.name = `${ORDINAL(n)} ${e.name}`;
  }
  return entries;
}

/**
 * A package definition without the categories that go out as their own final
 * files (`claimed`), with nodes that have nothing left dropped.
 */
export function narrowPackage(def, claimed) {
  const narrow = (node) => {
    const out = { ...node };
    if (node.categories) out.categories = node.categories.filter((c) => !claimed.has(c));
    if (node.children) out.children = node.children.map(narrow).filter(keep);
    return out;
  };
  const keep = (n) => n.generatedKey || n.catchAll || n.categories?.length || n.children?.length;
  return { ...def, sections: def.sections.map(narrow).filter(keep) };
}

/**
 * Plan a package: every section with the documents it takes.
 *
 * opts.owned    categories a catch-all may take (the package's own), or
 * opts.claimed  categories that belong to OTHER files — the catch-all then
 *               takes every remaining document except those (final-file set)
 * opts.exclude  ids of documents the team moved to another file or left out
 * opts.force    ids of documents the team put in this file: each goes to the
 *               section of its type when there is one, else to the catch-all
 *               (or a closing "Additional Documents" section), one entry each
 * @returns {Array<{ name, generatedKey?, docs, children: Array<{ name, generatedKey?, docs }> }>}
 */
export function planPackage(app, def, { owned = null, claimed = null, exclude = null, force = null } = {}) {
  const forced = new Set(force || []);
  const all = (app.documents || []).filter((d) => forced.has(d.id) || !exclude?.has(d.id));
  const used = new Set();
  const pick = (node) => {
    if (node.generatedKey) return [];
    let docs = [];
    if (node.catchAll) {
      docs = all.filter((d) => {
        if (used.has(d.id) || NEVER.has(d.category)) return false;
        if (claimed) return !claimed.has(d.category);
        return !d.category || (owned && owned.has(d.category));
      });
    } else if (node.categories?.length) {
      const wanted = new Set(node.categories);
      docs = all.filter((d) => wanted.has(d.category) && !used.has(d.id) && (!claimed || !claimed.has(d.category) || forced.has(d.id)));
    }
    docs.forEach((d) => used.add(d.id));
    return docs;
  };
  const sponsor = String(app.data?.sponsorName || '').trim();

  // Documents put here by hand whose type has no section of its own.
  const sectionCats = new Set();
  const walk = (n) => {
    (n.categories || []).forEach((c) => sectionCats.add(c));
    (n.children || []).forEach(walk);
  };
  def.sections.forEach(walk);
  const extra = all.filter((d) => forced.has(d.id) && !sectionCats.has(d.category));
  const catchAll = def.sections.find((s) => s.catchAll);
  const sections = catchAll || !extra.length ? def.sections : [...def.sections, { name: def.extraName || 'Additional Documents', perDoc: true, forcedOnly: true }];

  const planned = sections.map((sec) => {
    if (sec.forcedOnly) {
      extra.forEach((d) => used.add(d.id));
      return { name: sec.name, generatedKey: null, docs: [], children: perDocEntries(sec, extra) };
    }
    let own = pick(sec);
    let children = [];
    if (sec.perDoc) {
      children = perDocEntries(sec, own);
      own = [];
    }
    for (const c of sec.children || []) {
      const docs = pick(c);
      if (c.perDoc) children.push(...perDocEntries(c, docs));
      else children.push({ name: c.name, generatedKey: c.generatedKey || null, docs });
    }
    const name = sec.supporter && sponsor ? `${sec.name} (${sponsor})` : sec.name;
    return { name, generatedKey: sec.generatedKey || null, docs: own, children };
  });

  // A file made by hand (def.flat): one contents entry per document.
  if (def.flat) {
    const i = sections.findIndex((x) => x.forcedOnly);
    if (i >= 0) planned.splice(i, 1, ...planned[i].children.map((c) => ({ name: c.name, generatedKey: null, docs: c.docs, children: [] })));
  }
  // A catch-all section takes the hand-placed documents the sections above did not.
  if (catchAll) {
    const left = extra.filter((d) => !used.has(d.id));
    const i = sections.indexOf(catchAll);
    if (left.length && i >= 0) planned[i].docs = [...planned[i].docs, ...left];
  }
  return planned;
}

/** Ids of every document a plan places. */
export function plannedDocIds(plan) {
  const ids = new Set();
  for (const s of plan) {
    s.docs.forEach((d) => ids.add(d.id));
    for (const c of s.children) c.docs.forEach((d) => ids.add(d.id));
  }
  return ids;
}

/**
 * The plan as the team sees it before building: sections that will appear,
 * each with the letter it holds or the files it takes. Empty ones are left out.
 */
export function describePlan(plan, { hasLetter = () => false } = {}) {
  const node = (n) => {
    const files = n.docs.map((d) => d.filename);
    const letter = n.generatedKey ? hasLetter(n.generatedKey) : false;
    return { name: n.name, letter, files, ids: n.docs.map((d) => d.id) };
  };
  const out = [];
  for (const s of plan) {
    const me = node(s);
    const children = s.children.map(node).filter((c) => c.letter || c.files.length);
    if (!me.letter && !me.files.length && !children.length) continue;
    out.push({ ...me, children });
  }
  return out;
}
