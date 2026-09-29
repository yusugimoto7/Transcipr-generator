import { planFinalFiles, unplacedDocuments, startFinalJob, getFinalJob } from '@/lib/finalFiles';
import { json, requireOwnedApp } from '@/lib/api';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';

/**
 * The final-file set for the IRCC portal: the plan (each slot with what it
 * will contain), documents no file would take, the last build, and a running build.
 */
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  const plan = planFinalFiles(app);
  return json({ plan, unplaced: unplacedDocuments(app, plan), built: app.finalFiles || null, job: getFinalJob(app.id) });
}

/** Build every final file, or one slot (background job). Body: { cleanPages?, fixRotation?, slot? } */
export async function POST(req, { params }) {
  const { app, user, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional */
  }
  const only = typeof body.slot === 'string' && body.slot ? body.slot : null;
  if (only && !planFinalFiles(app).some((e) => e.slot === only)) return json({ error: 'No such file in this set.' }, 400);
  const job = startFinalJob(app.id, { cleanPages: body.cleanPages !== false, fixRotation: body.fixRotation !== false, only });
  const name = only ? planFinalFiles(app).find((e) => e.slot === only)?.name : null;
  await logActivity(app.id, user, only ? `Rebuilt one final file` : app.finalFiles?.builtAt ? 'Rebuilt the final files' : 'Built the final files', only ? { detail: name } : {});
  return json({ job }, 202);
}
