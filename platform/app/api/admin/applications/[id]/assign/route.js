import { updateApplication, getApplication, getUserById, effectiveRole } from '@/lib/store';
import { json, error, requireAdmin } from '@/lib/api';
import { notify, fileLabel } from '@/lib/notify';
import { logActivity } from '@/lib/activity';

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
  const newcomers = ids.filter((id) => !(app.assignedTo || []).includes(id));
  const gone = (app.assignedTo || []).filter((id) => !ids.includes(id));
  const nameOf = async (id) => { const u = await getUserById(id); return u?.name || u?.email || id; };
  if (newcomers.length) await logActivity(app.id, admin, 'Gave access to the file', { items: await Promise.all(newcomers.map(nameOf)) });
  if (gone.length) await logActivity(app.id, admin, 'Removed access to the file', { items: await Promise.all(gone.map(nameOf)) });
  if (newcomers.length) {
    await notify(newcomers, { kind: 'assigned', text: `${admin.name || admin.email} gave you ${fileLabel(updated)}`, appId: app.id, link: `/application/${app.id}`, by: { id: admin.id, name: admin.name || admin.email } }).catch(() => {});
  }
  return json({ assignedTo: updated.assignedTo });
}
