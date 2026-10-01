import { planFinalFiles, unplacedDocuments, documentSuggestions, catalogFor, applySetupChange, startFinalJob, getFinalJob } from '@/lib/finalFiles';
import { finalSetFor } from '@/lib/finalSets';
import { json, requireOwnedApp } from '@/lib/api';
import { updateApplication } from '@/lib/store';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';

/**
 * The final-file set for the IRCC portal: the plan (each slot with what it
 * will contain), documents no file would take, the last build, and a running build.
 */
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  return json({ ...setView(app), built: app.finalFiles || null, job: getFinalJob(app.id) });
}

/** The set as the team edits it: the plan, the catalog of files to add, loose documents. */
function setView(app) {
  const plan = planFinalFiles(app);
  return {
    plan,
    unplaced: unplacedDocuments(app, plan),
    suggestions: documentSuggestions(app, plan),
    catalog: catalogFor(app),
    basis: finalSetFor(app.type)?.basis || null,
    setup: app.finalSetup || null,
  };
}

/**
 * Change the set before building: take a file out, add one, make one by hand,
 * or move a document into / out of a file. Body: one change (lib/finalFiles.js applySetupChange).
 */
export async function PATCH(req, { params }) {
  const { app, user, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  let change;
  try {
    change = await req.json();
  } catch {
    return json({ error: 'Bad request.' }, 400);
  }
  let next;
  try {
    next = await updateApplication(app.id, (a) => {
      a.finalSetup = applySetupChange(a, change);
      return a;
    });
  } catch (e) {
    return json({ error: e.message || 'Could not change the set.' }, 400);
  }
  const what = { remove: 'Took a file out of the final set', add: 'Added a file to the final set', custom: 'Made a new final file', rename: 'Renamed a final file', assign: 'Moved a document between final files', reset: 'Reset the final set' }[change.op];
  if (what) await logActivity(app.id, user, what, change.slot || change.name || change.to ? { detail: change.name || change.slot || change.to } : {});
  return json({ ...setView(next), finalSetup: next.finalSetup });
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
