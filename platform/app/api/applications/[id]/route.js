import { updateApplication, deleteApplication } from '@/lib/store';
import { allFields } from '@/lib/schema';
import { json, error, requireOwnedApp } from '@/lib/api';

export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  return json({ application: app });
}

// Update intake data and/or title/status.
export async function PATCH(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }

  const validIds = new Set(allFields(app.type).map((f) => f.id));

  const updated = await updateApplication(app.id, (a) => {
    if (body.data && typeof body.data === 'object') {
      for (const [k, v] of Object.entries(body.data)) {
        if (validIds.has(k)) a.data[k] = v;
      }
    }
    if (typeof body.title === 'string' && body.title.trim()) a.title = body.title.trim();
    if (typeof body.status === 'string') a.status = body.status;
    return a;
  });
  return json({ application: updated });
}

export async function DELETE(_req, { params }) {
  const { error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  await deleteApplication(params.id);
  return json({ ok: true });
}
