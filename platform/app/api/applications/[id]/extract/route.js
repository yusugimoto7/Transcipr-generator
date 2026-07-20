import { updateApplication } from '@/lib/store';
import { buildDocBlocks } from '@/lib/uploads';
import { extractFromDocuments } from '@/lib/generators/extract';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * Read the application's uploaded documents with Claude and return suggested
 * field values. Does NOT overwrite the applicant's data automatically — the UI
 * presents suggestions for confirmation. Pass { apply: true } to merge only the
 * fields that are currently empty.
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

  let blocks;
  try {
    blocks = await buildDocBlocks(app.id, docs);
  } catch (e) {
    return error('Could not read uploaded files.', 500);
  }

  let result;
  try {
    result = await extractFromDocuments(blocks, app.data || {}, app.type);
  } catch (e) {
    return error(`Extraction failed: ${e.message}`, 502);
  }

  // Apply AI document classification (keyed by 1-based position in `docs`).
  const cats = result.documentCategories || {};
  let documents = app.documents;
  if (Object.keys(cats).length) {
    const updatedApp = await updateApplication(app.id, (a) => {
      for (const [idx, key] of Object.entries(cats)) {
        const doc = docs[Number(idx) - 1];
        if (!doc || !key) continue;
        const target = (a.documents || []).find((d) => d.id === doc.id);
        if (target) target.category = key;
      }
      return a;
    });
    documents = updatedApp?.documents || documents;
  }

  if (body.apply) {
    await updateApplication(app.id, (a) => {
      for (const [k, v] of Object.entries(result.fields || {})) {
        if (v == null || v === '') continue;
        if (!String(a.data[k] ?? '').trim()) a.data[k] = v; // fill only empty fields
      }
      return a;
    });
  }

  return json({ ...result, documents });
}
