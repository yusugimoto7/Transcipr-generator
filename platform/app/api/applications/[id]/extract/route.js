import { startExtractJob, getExtractJob } from '@/lib/extractJob';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * Read the application's documents with the model and suggest intake values.
 * Runs as a background job (see lib/extractJob.js): POST starts it and returns
 * at once, GET reports progress and, when done, the result. Nothing is written
 * to the intake here — the page fills empty fields and shows a comparison.
 *
 * POST body: { all? } — re-read documents that were already read.
 */
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional */
  }
  try {
    const job = await startExtractJob(app.id, { all: Boolean(body.all) });
    return json({ job }, 202);
  } catch (e) {
    return error(e.message || 'Could not start reading.', e.status || 500);
  }
}

export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  return json({ job: getExtractJob(app.id) });
}
