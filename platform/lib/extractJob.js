import { getApplication, updateApplication } from './store';
import { buildDocBlocks, readUpload } from './uploads';
import { extractFromDocuments } from './generators/extract';
import { codeCategory, firmCode } from './generators/classify';
import { rasterizePdf } from './raster';
import { buildChecklist } from './checklist';
import { getAppType } from './appTypes';
import { allFields, APPLICANT_ONLY_STEPS, SAME_PERSON_FIELDS } from './schema';

/**
 * "Read documents & fill intake" as a background job.
 *
 * A client file can hold 100+ scans (a Drive import brings everything). Reading
 * them takes many AI calls — minutes, not seconds — which no single web request
 * survives (Render's proxy times out, and reading every batch at once exhausted
 * the instance's memory). So the POST starts a job and returns at once; the
 * page polls for progress. Batches run two at a time and each large scan is
 * reduced to its first pages as images before it is sent.
 *
 * Jobs live in this process's memory (one Node server). If the server restarts
 * mid-run the page is told the job was interrupted and can start it again.
 */

const CONCURRENCY = Number(process.env.EXTRACT_CONCURRENCY || 2);
const BATCH_FILES = 4;
const BATCH_BYTES = 4 * 1024 * 1024;
// PDFs above this size, or longer than PAGES, are sent as their first pages.
const BIG_PDF_BYTES = 2.5 * 1024 * 1024;
const PAGES = 6;
const CONF_RANK = { high: 3, medium: 2, low: 1 };

const jobs = (globalThis.__extractJobs ||= new Map()); // appId -> job

/** Documents worth reading for the intake. */
function readable(doc) {
  if (doc.category === 'photo') return false; // nothing to extract from a portrait
  if (/^\s*(\d+\s*-\s*)?100\s*[-–_ ]/.test(doc.filename || '')) return false; // the firm's own checklist
  return true;
}

function batchDocs(docs) {
  const batches = [];
  let cur = [];
  let bytes = 0;
  for (const d of docs) {
    const size = Math.min(d.size || 0, BIG_PDF_BYTES); // big PDFs shrink before sending
    if (cur.length && (cur.length >= BATCH_FILES || bytes + size > BATCH_BYTES)) {
      batches.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(d);
    bytes += size;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/** Whose document a checklist party means, for this application type. */
function partyText(party, type) {
  if (party === 'firm') return 'prepared by the firm';
  if (party !== 'principal') return "normally the applicant's own document (check the name — a family folder may hold another member's)";
  const steps = new Set(getAppType(type).steps);
  if (steps.has('spouseInCanada')) return "a document of the applicant's spouse in Canada — it fills the spouse-in-Canada fields, never the applicant's";
  if (steps.has('superVisa') || steps.has('host')) return 'a document of the host in Canada — it fills the host fields';
  if (steps.has('minor')) return "a document of the child's parent in Canada — it fills the parent fields";
  return 'a document of a family member or sponsor, not the applicant';
}

/**
 * "(checklist 132: Spouse's work permit — a document of the spouse in Canada)"
 * for a file named with its checklist code, so the model knows whose it is.
 */
function checklistNote(doc, items, type) {
  const code = firmCode(doc.filename);
  if (!code) return '';
  const item = items.get(code) || items.get(code.split('-')[0]);
  if (!item) return '';
  return ` (checklist ${item.code}: ${item.label} — ${partyText(item.party, type)})`;
}

/** Content blocks for a batch; large PDFs become their first pages as JPEGs. */
async function blocksFor(appId, docs, app) {
  const items = new Map();
  for (const it of buildChecklist(app.data || {}, app.type)) if (!items.has(String(it.code))) items.set(String(it.code), it);
  const blocks = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const note = checklistNote(doc, items, app.type);
    if (doc.mime === 'application/pdf' && (doc.size || 0) > BIG_PDF_BYTES) {
      try {
        const pages = await rasterizePdf(await readUpload(appId, doc.stored), { dpi: 110, lastPage: PAGES });
        if (pages.length) {
          blocks.push({ type: 'text', text: `--- Document ${i + 1}: ${doc.filename} ---${note} (first ${pages.length} page(s) shown as images)` });
          for (const p of pages) {
            blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: p.buffer.toString('base64') } });
          }
          continue;
        }
      } catch {
        /* fall back to sending the PDF itself */
      }
    }
    // buildDocBlocks numbers from 1 within its input; renumber to our position.
    const [header, ...rest] = await buildDocBlocks(appId, [doc]);
    blocks.push({ ...header, text: header.text.replace(/Document 1:/, `Document ${i + 1}:`) + note }, ...rest);
  }
  return blocks;
}

/**
 * Who the file is for, as far as the platform knows: set by staff on the
 * Documents tab, else the name in the intake, else the Drive folder's name
 * (the firm names client folders "S26160 - First Last"), else the file title.
 */
export function applicantHint(app) {
  if (app.readFor) return app.readFor;
  const d = app.data || {};
  const name = `${d.givenName || ''} ${d.familyName || ''}`.trim();
  if (name) return name;
  // Strip a leading client number: "S26160 - Zahra Mousavi" → "Zahra Mousavi".
  const clean = (x) => String(x || '').replace(/^\s*[A-Z]?\d{3,}\s*([-–_]\s*|$)/i, '').trim();
  const folder = clean(app.driveSource?.rootName);
  if (folder) return folder;
  const title = clean(app.title);
  return title && title !== getAppType(app.type).title ? title : '';
}

/** Public view of a job for the page. */
function view(job) {
  if (!job) return null;
  const { status, applicant, total, done, failed, docCount, startedAt, finishedAt, error, result } = job;
  return { status, applicant, total, done, failed, docCount, startedAt, finishedAt, error, ...(status === 'done' ? { result } : {}) };
}

export function getExtractJob(appId) {
  return view(jobs.get(appId));
}

/**
 * Start reading the file's documents (unless a job is already running).
 * @param {object} opts  all: re-read documents already read before
 */
export async function startExtractJob(appId, { all = false, applicant } = {}) {
  const running = jobs.get(appId);
  if (running?.status === 'running') return view(running);

  let app = await getApplication(appId);
  // Remember who the file is for, so the next read (and the page) use it.
  if (typeof applicant === 'string' && applicant.trim() && applicant.trim() !== app.readFor) {
    app = await updateApplication(appId, (a) => {
      a.readFor = applicant.trim().slice(0, 120);
      return a;
    });
  }
  const candidates = (app.documents || []).filter(readable);
  const docs = all ? candidates : candidates.filter((d) => !d.extractedAt);
  const toRead = docs.length ? docs : candidates; // nothing new: read everything again
  if (!toRead.length) {
    const e = new Error('Upload at least one document first.');
    e.status = 400;
    throw e;
  }

  const batches = batchDocs(toRead);
  const job = {
    status: 'running',
    applicant: applicantHint(app),
    total: batches.length,
    done: 0,
    failed: 0,
    docCount: toRead.length,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    result: null,
  };
  jobs.set(appId, job);
  run(appId, app, batches, job).catch((e) => {
    job.status = 'failed';
    job.error = e.message || 'Reading failed.';
    job.finishedAt = new Date().toISOString();
  });
  return view(job);
}

const STOP = new Set(['of', 'the', 'a', 'an', 'and', 'in', 'or', 'with', 'degree', 'school']);
// Degree abbreviations and transliterated Persian levels, as option words.
const ALIAS = {
  bsc: 'bachelor', ba: 'bachelor', bs: 'bachelor', beng: 'bachelor', licence: 'bachelor', lisans: 'bachelor', karshenasi: 'bachelor',
  msc: 'master', ma: 'master', ms: 'master', meng: 'master', mba: 'master', arshad: 'master',
  kardani: 'associate', dphil: 'phd', md: 'medicine', dds: 'dentistry', pharmd: 'pharmacy',
};
const words = (x) =>
  String(x)
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w))
    .map((w) => ALIAS[w] || w);

/**
 * Match a model answer to a select field's options: exact (any case) first,
 * then the option sharing the most meaningful words ("Bachelor of Science" →
 * "Bachelor's degree"). An answer that matches nothing is kept as written.
 */
export function toOption(value, options) {
  const v = String(value).trim();
  const exact = options.find((o) => o.toLowerCase() === v.toLowerCase());
  if (exact) return exact;
  const vw = new Set(words(v));
  let best = null;
  let bestScore = 0;
  let tie = false;
  for (const o of options) {
    const score = words(o).filter((w) => vw.has(w)).length;
    if (score > bestScore) {
      best = o;
      bestScore = score;
      tie = false;
    } else if (score && score === bestScore) {
      tie = true;
    }
  }
  return best && !tie ? best : value;
}

async function run(appId, app, batches, job) {
  const merged = { fields: {}, confidence: {}, sources: {}, notes: [] };
  const categoryById = {};
  const ownerById = {};
  const readIds = new Set();
  const failures = [];
  const fieldDefs = new Map(allFields(app.type).map((f) => [f.id, f]));
  const dropped = new Set();

  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const blocks = await blocksFor(appId, batch, app);
        const res = await extractFromDocuments(blocks, app.data || {}, app.type, { applicant: job.applicant });
        const ownerOf = (filename) => {
          const idx = batch.findIndex((d) => d.filename === filename);
          return idx < 0 ? null : res.documentOwners?.[idx + 1] || null;
        };
        for (const [idx, owner] of Object.entries(res.documentOwners || {})) {
          const doc = batch[Number(idx) - 1];
          if (doc && owner) ownerById[doc.id] = owner;
        }
        for (let [k, v] of Object.entries(res.fields || {})) {
          if (v == null || v === '') continue;
          const def = fieldDefs.get(k);
          if (!def) continue; // not a field of this application type
          // The applicant's identity and education only come from their own
          // documents — a child's passport must not become the applicant's.
          const owner = ownerOf(res.sources?.[k]);
          if (APPLICANT_ONLY_STEPS.has(def.step) && owner && owner !== 'applicant') {
            dropped.add(`${def.label} (from ${res.sources[k]}, a document of the ${owner})`);
            continue;
          }
          if (def.options && typeof v === 'string') v = toOption(v, def.options);
          const newRank = CONF_RANK[res.confidence?.[k]] || 0;
          const curRank = CONF_RANK[merged.confidence[k]] || 0;
          if (!(k in merged.fields) || newRank > curRank) {
            merged.fields[k] = v;
            if (res.confidence?.[k]) merged.confidence[k] = res.confidence[k];
            if (res.sources?.[k]) merged.sources[k] = res.sources[k];
          }
        }
        if (Array.isArray(res.notes)) merged.notes.push(...res.notes);
        for (const [idx, key] of Object.entries(res.documentCategories || {})) {
          const doc = batch[Number(idx) - 1];
          if (doc && key) categoryById[doc.id] = key;
        }
        batch.forEach((d) => readIds.add(d.id));
      } catch (e) {
        failures.push(e.message);
        job.failed++;
      }
      job.done++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));

  // One person named in two sections (the spouse in Family members and in
  // "Your spouse in Canada"): whichever was read fills the other.
  const steps = new Set(getAppType(app.type).steps);
  for (const rule of SAME_PERSON_FIELDS) {
    if (!steps.has(rule.whenStep)) continue;
    const found = rule.fields.find((f) => merged.fields[f]);
    if (!found) continue;
    for (const f of rule.fields) {
      if (merged.fields[f]) continue;
      merged.fields[f] = merged.fields[found];
      if (merged.confidence[found]) merged.confidence[f] = merged.confidence[found];
      if (merged.sources[found]) merged.sources[f] = merged.sources[found];
    }
  }
  if (dropped.size) {
    merged.notes.push(`Not used for the applicant because the document belongs to someone else: ${[...dropped].slice(0, 8).join('; ')}.`);
  }

  if (failures.length === batches.length) {
    throw new Error(`Reading failed: ${failures[0]}`);
  }

  // Save categories and mark what was read, so the next run only reads new files.
  const now = new Date().toISOString();
  const updated = await updateApplication(appId, (a) => {
    for (const d of a.documents || []) {
      if (readIds.has(d.id)) d.extractedAt = now;
      if (ownerById[d.id]) d.owner = ownerById[d.id];
      const ai = categoryById[d.id];
      if (!ai) continue;
      // A file named with its checklist code keeps that category — unless the
      // model saw agency paperwork, which must never reach a package.
      const coded = codeCategory(d.filename, a.type);
      d.category = coded && ai !== 'internal' ? coded : ai;
    }
    return a;
  });

  if (failures.length) {
    merged.notes.push(`${failures.length} of ${batches.length} document batches could not be read (${failures[0]}). Run it again to retry them.`);
  }
  job.result = { ...merged, documents: updated?.documents || [], version: updated?.version };
  job.status = 'done';
  job.finishedAt = new Date().toISOString();
}
