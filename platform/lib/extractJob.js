import { getApplication, updateApplication } from './store';
import { buildDocBlocks, readUpload } from './uploads';
import { extractFromDocuments } from './generators/extract';
import { codeCategory } from './generators/classify';
import { rasterizePdf } from './raster';

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

/** Content blocks for a batch; large PDFs become their first pages as JPEGs. */
async function blocksFor(appId, docs) {
  const blocks = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (doc.mime === 'application/pdf' && (doc.size || 0) > BIG_PDF_BYTES) {
      try {
        const pages = await rasterizePdf(await readUpload(appId, doc.stored), { dpi: 110, lastPage: PAGES });
        if (pages.length) {
          blocks.push({ type: 'text', text: `--- Document ${i + 1}: ${doc.filename} --- (first ${pages.length} page(s) shown as images)` });
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
    blocks.push({ ...header, text: header.text.replace(/Document 1:/, `Document ${i + 1}:`) }, ...rest);
  }
  return blocks;
}

/** Public view of a job for the page. */
function view(job) {
  if (!job) return null;
  const { status, total, done, failed, docCount, startedAt, finishedAt, error, result } = job;
  return { status, total, done, failed, docCount, startedAt, finishedAt, error, ...(status === 'done' ? { result } : {}) };
}

export function getExtractJob(appId) {
  return view(jobs.get(appId));
}

/**
 * Start reading the file's documents (unless a job is already running).
 * @param {object} opts  all: re-read documents already read before
 */
export async function startExtractJob(appId, { all = false } = {}) {
  const running = jobs.get(appId);
  if (running?.status === 'running') return view(running);

  const app = await getApplication(appId);
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

async function run(appId, app, batches, job) {
  const merged = { fields: {}, confidence: {}, sources: {}, notes: [] };
  const categoryById = {};
  const readIds = new Set();
  const failures = [];

  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      try {
        const blocks = await blocksFor(appId, batch);
        const res = await extractFromDocuments(blocks, app.data || {}, app.type);
        for (const [k, v] of Object.entries(res.fields || {})) {
          if (v == null || v === '') continue;
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

  if (failures.length === batches.length) {
    throw new Error(`Reading failed: ${failures[0]}`);
  }

  // Save categories and mark what was read, so the next run only reads new files.
  const now = new Date().toISOString();
  const updated = await updateApplication(appId, (a) => {
    for (const d of a.documents || []) {
      if (readIds.has(d.id)) d.extractedAt = now;
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
