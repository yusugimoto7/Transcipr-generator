import { planFinalFiles, startFinalJob, getFinalJob } from '@/lib/finalFiles';
import { json, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';

/** The final-file set for the IRCC portal: the plan, the last build, and a running build. */
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  return json({ plan: planFinalFiles(app), built: app.finalFiles || null, job: getFinalJob(app.id) });
}

/** Build every final file (background job). Body: { cleanPages?, fixRotation? } */
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional */
  }
  const job = startFinalJob(app.id, { cleanPages: body.cleanPages !== false, fixRotation: body.fixRotation !== false });
  return json({ job }, 202);
}
