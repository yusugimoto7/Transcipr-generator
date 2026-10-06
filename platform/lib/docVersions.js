/**
 * The same document sent more than once.
 *
 * Every copy is kept, on the file and on Drive. A copy that has a name the
 * file already uses gets " - 2", " - 3" … at the end of its name. A newer
 * copy of the same document replaces the earlier one (doc.replaces = earlier
 * id): the newest is the one the document list shows, the reading uses and
 * the final files are built from.
 *
 * "The same document" — never just the same name, since several different
 * documents share one (three bank statements, a current and a previous
 * passport):
 *   - the very same file sent again (same content), or
 *   - for identity documents (passport, ID, certificates, permits, letters of
 *     acceptance, test results …): the same passport / document number, read
 *     by the document check, for the same person.
 * The team can switch any document between "newer copy" and "separate
 * document" by hand (doc.separateFrom keeps the platform from linking them
 * again). Pure: used on the server and in the browser.
 */

// Documents a number identifies: a later copy with the same number is the same document.
const ID_CATEGORIES = new Set([
  'passport', 'national-id', 'marriage-cert', 'military', 'police-clearance', 'language', 'loa', 'pal',
  'spouse-status', 'status-in-canada', 'supporter-id', 'medical', 'completion-letter', 'enrolment-letter', 'job-offer',
]);

const when = (d) => String(d.uploadedAt || d.mailDate || '');

/** Ids of the documents a newer copy replaces. */
export function supersededIds(docs = []) {
  const ids = new Set(docs.map((d) => d.id));
  return new Set(docs.filter((d) => d.replaces && ids.has(d.replaces)).map((d) => d.replaces));
}

/** The documents in use: every document that no newer copy replaces. */
export function currentDocs(docs = []) {
  const old = supersededIds(docs);
  return docs.filter((d) => !old.has(d.id));
}

/** The file as the planners should see it: only the documents in use. */
export function liveApp(app) {
  return app && Array.isArray(app.documents) ? { ...app, documents: currentDocs(app.documents) } : app;
}

/** The copies of a document, oldest first (the chain of `replaces`). */
export function copiesOf(docs = [], doc) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const newer = new Map(docs.filter((d) => d.replaces).map((d) => [d.replaces, d]));
  let first = doc;
  const seen = new Set([doc.id]);
  while (first.replaces && byId.has(first.replaces) && !seen.has(first.replaces)) {
    first = byId.get(first.replaces);
    seen.add(first.id);
  }
  const out = [first];
  while (newer.has(out[out.length - 1].id) && out.length < 50) out.push(newer.get(out[out.length - 1].id));
  return out;
}

/** The number that identifies an identity document, as read by the check. */
export function identityOf(doc) {
  if (!ID_CATEGORIES.has(doc?.category)) return null;
  const f = doc.verification?.facts || {};
  const n = String(f.passportNumber || f.documentNumber || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n.length >= 5 ? n : null;
}

const separate = (a, b) => (a.separateFrom || []).includes(b.id) || (b.separateFrom || []).includes(a.id);

/** An earlier document in use that `doc` is a newer copy of, or null. */
export function earlierCopy(docs, doc) {
  const old = supersededIds(docs);
  const id = identityOf(doc);
  const candidates = docs
    .filter((x) => x.id !== doc.id && !old.has(x.id) && x.replaces !== doc.id && when(x) <= when(doc) && !separate(x, doc))
    .filter((x) => (doc.sha1 && x.sha1 === doc.sha1) || (id && x.category === doc.category && (x.owner || 'applicant') === (doc.owner || 'applicant') && identityOf(x) === id));
  return candidates.sort((a, b) => when(b).localeCompare(when(a)))[0] || null;
}

/**
 * Link newer copies to the documents they replace (mutates `docs`): each
 * document not yet linked, oldest first. Returns the ids it linked.
 */
export function linkCopies(docs = []) {
  const linked = [];
  for (const d of [...docs].sort((a, b) => when(a).localeCompare(when(b)))) {
    if (d.replaces || supersededIds(docs).has(d.id)) continue;
    const prev = earlierCopy(docs, d);
    if (prev) {
      d.replaces = prev.id;
      linked.push(d.id);
    }
  }
  return linked;
}

/** "103 - Passport - Sara.pdf" when free, else "103 - Passport - Sara - 2.pdf", "- 3" … */
export function numberedName(docs = [], name, selfId = null) {
  const taken = new Set(docs.filter((d) => d.id !== selfId).map((d) => String(d.filename || '').toLowerCase()));
  if (!taken.has(String(name).toLowerCase())) return name;
  const m = String(name).match(/^(.*?)(\.[a-z0-9]{2,5})?$/i);
  const base = m[1].replace(/\s-\s\d{1,3}$/, '');
  const ext = m[2] || '';
  for (let n = 2; n < 1000; n++) {
    const next = `${base} - ${n}${ext}`;
    if (!taken.has(next.toLowerCase())) return next;
  }
  return name;
}
