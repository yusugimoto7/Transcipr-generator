import { getPackages } from '@/lib/compile';
import { startCompileJob, getCompileJobs } from '@/lib/compileJob';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

/**
 * Compile a package as a background job (lib/compileJob.js).
 * POST { pkg, cleanPages?, fixRotation? } starts it and returns at once;
 * GET reports every package's job for this file, with progress and, when
 * finished, the result.
 */
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  if (!getPackages(app.type)[body.pkg]) return error('Unknown package.', 404);

  const job = startCompileJob(app.id, body.pkg, {
    cleanPages: body.cleanPages !== false, // default: remove blank pages
    fixRotation: body.fixRotation !== false, // default: auto-correct sideways/upside-down scans
  });
  return json({ job }, 202);
}

export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  return json({ jobs: getCompileJobs(app.id) });
}
