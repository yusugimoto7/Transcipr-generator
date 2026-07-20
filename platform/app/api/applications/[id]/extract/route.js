import { updateApplication } from '@/lib/store';
import { buildDocBlocks } from '@/lib/uploads';
import { extractFromDocuments } from '@/lib/generators/extract';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CONF_RANK = { high: 3, medium: 2, low: 1 };

// Group docs into batches so we never send one enormous request to Claude.
// New batch when it would exceed ~4 files or ~4 MB of raw upload bytes.
function batchDocs(docs) {
  const MAX_FILES = 4;
  const MAX_BYTES = 4 * 1024 * 1024;
  const batches = [];
  let cur = [];
  let bytes = 0;
  for (const d of docs) {
    if (cur.length && (cur.length >= MAX_FILES || bytes + (d.size || 0) > MAX_BYTES)) {
      batches.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(d);
    bytes += d.size || 0;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/**
 * Read the application's uploaded documents with Claude and return suggested
 * field values. Large sets are processed in parallel batches and merged.
 * Does NOT overwrite the applicant's data unless { apply: true } is passed
 * (and then only fills fields that are currently empty).
 */
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  const docs = app.documents || [];
  if (!docs.length) return error('Upload at least one document first.');

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional */
  }

  const batches = batchDocs(docs);

  // Run each batch independently; a failed batch doesn't sink the whole run.
  const settled = await Promise.all(
    batches.map(async (batchDocsList) => {
      try {
        const blocks = await buildDocBlocks(app.id, batchDocsList);
        const res = await extractFromDocuments(blocks, app.data || {}, app.type);
        return { batchDocsList, res };
      } catch (e) {
        return { batchDocsList, error: e.message };
      }
    })
  );

  const merged = { fields: {}, confidence: {}, notes: [] };
  const docCategoryById = {}; // docId -> category
  const failures = [];

  for (const s of settled) {
    if (s.error) {
      failures.push(s.error);
      continue;
    }
    const { res, batchDocsList } = s;
    // Merge fields, preferring the higher-confidence value on conflicts.
    for (const [k, v] of Object.entries(res.fields || {})) {
      if (v == null || v === '') continue;
      const newRank = CONF_RANK[res.confidence?.[k]] || 0;
      const curRank = CONF_RANK[merged.confidence[k]] || 0;
      if (!(k in merged.fields) || newRank > curRank) {
        merged.fields[k] = v;
        if (res.confidence?.[k]) merged.confidence[k] = res.confidence[k];
      }
    }
    if (Array.isArray(res.notes)) merged.notes.push(...res.notes);
    // Category keys are 1-based within the batch — map back to real doc ids.
    for (const [idx, key] of Object.entries(res.documentCategories || {})) {
      const doc = batchDocsList[Number(idx) - 1];
      if (doc && key) docCategoryById[doc.id] = key;
    }
  }

  // Every batch failed — surface the error.
  if (failures.length === batches.length) {
    return error(`Extraction failed: ${failures[0]}`, 502);
  }

  // Persist AI-detected document categories.
  let documents = app.documents;
  if (Object.keys(docCategoryById).length) {
    const updatedApp = await updateApplication(app.id, (a) => {
      for (const d of a.documents || []) {
        if (docCategoryById[d.id]) d.category = docCategoryById[d.id];
      }
      return a;
    });
    documents = updatedApp?.documents || documents;
  }

  if (body.apply) {
    await updateApplication(app.id, (a) => {
      for (const [k, v] of Object.entries(merged.fields)) {
        if (v == null || v === '') continue;
        if (!String(a.data[k] ?? '').trim()) a.data[k] = v; // fill only empty fields
      }
      return a;
    });
  }

  if (failures.length) {
    merged.notes.push(
      `${failures.length} of ${batches.length} document batches could not be read and were skipped.`
    );
  }

  return json({ ...merged, documents });
}
