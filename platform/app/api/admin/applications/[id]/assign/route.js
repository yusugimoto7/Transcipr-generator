import { updateApplication, getApplication, getUserById, effectiveRole } from '@/lib/store';
import { json, error, requireAdmin } from '@/lib/api';

/** Body: { assignedTo: [userId...] } — replaces the file's manager list. */
export async function POST(req, { params }) {
  const { user: admin, error: err } = await requireAdmin();
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const app = await getApplication(params.id);
  if (!app) return error('Application not found.', 404);
  const ids = [...new Set((Array.isArray(body.assignedTo) ? body.assignedTo : []).map(String))];
  for (const id of ids) {
    const u = await getUserById(id);
    if (!u || !['manager', 'admin'].includes(effectiveRole(u))) return error(`Not a staff account: ${id}`);
  }
  const updated = await updateApplication(app.id, (a) => {
    a.assignedTo = ids;
    return a;
  }, { by: admin.id });
  return json({ assignedTo: updated.assignedTo });
}
