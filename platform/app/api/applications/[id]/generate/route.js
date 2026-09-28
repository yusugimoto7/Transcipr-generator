import { catalogue, produceDocs, refreshNextSteps } from '@/lib/generateDocs';
import { json, error, requireOwnedApp } from '@/lib/api';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';
export const maxDuration = 180;

/**
 * (Re)generate specific documents — used to redraft a single letter.
 * Everything at once happens in "Build final files" (lib/finalFiles.js).
 * Body: { docs: [keys] } — defaults to every letter and data sheet.
 */
export async function POST(req, { params }) {
  const { app, user, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional */
  }
  const titles = catalogue(app);
  const requested = Array.isArray(body.docs) && body.docs.length
    ? body.docs.filter((k) => titles[k])
    : Object.keys(titles).filter((k) => !k.endsWith('-filled'));

  const { app: afterDocs, produced, errors } = await produceDocs(app, requested);
  if (!produced.length) {
    return error(`Generation failed: ${errors.map((e) => `${e.key}: ${e.message}`).join('; ')}`, 502);
  }
  let updated = afterDocs;
  let note = null;
  try {
    ({ app: updated, note } = await refreshNextSteps(afterDocs));
  } catch (e) {
    errors.push({ key: 'next-steps', message: e.message });
  }
  await logActivity(app.id, user, 'Generated working files', { items: (produced || []).map((p) => p.filename || p.title || String(p)).slice(0, 20) });
  return json({ generated: updated.generated, produced, errors, note });
}
