import { updateApplication } from '@/lib/store';
import { reviewApplication } from '@/lib/generators/review';
import { buildChecklist } from '@/lib/checklist';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let review;
  try {
    review = await reviewApplication(app);
  } catch (e) {
    return error(`Review failed: ${e.message}`, 502);
  }

  await updateApplication(app.id, (a) => {
    a.review = review;
    return a;
  });

  return json({ review, checklist: buildChecklist(app.data || {}) });
}

// Return the personalized checklist and last review without re-running AI.
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  const checklist = buildChecklist(app.data || {}).map((c) => ({
    ...c,
    uploaded: (app.documents || []).some((d) => d.category === c.key),
  }));
  return json({ checklist, review: app.review || null });
}
