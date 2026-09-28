import { listAllApplications, updateApplication, getUserById, userLevel, seesAllFiles, canAccess } from '@/lib/store';
import { notify, fileLabel } from '@/lib/notify';
import { json, error, requireAdmin } from '@/lib/api';
import { logActivity } from '@/lib/activity';

/**
 * Which files an account manager can open and edit (admins and super admins
 * open every file). Body: { userId, add: [appId…], remove: [appId…] }.
 * The manager is told about files newly given to them.
 */
export async function POST(req) {
  const { user: actor, error: err } = await requireAdmin();
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const target = await getUserById(String(body.userId || ''));
  if (!target) return error('User not found.', 404);
  if (seesAllFiles(target)) return error('This person already sees every file.');
  if (userLevel(target) === 'admin' && userLevel(actor) !== 'superadmin') return error('Only a super admin can change an admin’s files.', 403);
  if (target.active === false) return error('This account is deactivated.');
  const add = new Set((Array.isArray(body.add) ? body.add : []).map(String));
  const remove = new Set((Array.isArray(body.remove) ? body.remove : []).map(String));
  // Only files the person giving access can see themselves.
  const apps = (await listAllApplications()).filter((a) => canAccess(actor, a));
  const given = [];
  let removed = 0;
  for (const a of apps) {
    const has = (a.assignedTo || []).includes(target.id);
    if (add.has(a.id) && !has) {
      await updateApplication(a.id, (x) => {
        x.assignedTo = [...new Set([...(x.assignedTo || []), target.id])];
        return x;
      }, { by: actor.id, quiet: true });
      given.push(a);
      await logActivity(a.id, actor, 'Gave access to the file', { items: [target.name || target.email] });
    } else if (remove.has(a.id) && has) {
      await updateApplication(a.id, (x) => {
        x.assignedTo = (x.assignedTo || []).filter((id) => id !== target.id);
        return x;
      }, { by: actor.id, quiet: true });
      removed++;
      await logActivity(a.id, actor, 'Removed access to the file', { items: [target.name || target.email] });
    }
  }
  if (given.length) {
    const by = { id: actor.id, name: actor.name || actor.email };
    const text = given.length === 1 ? `${by.name} gave you ${fileLabel(given[0])}` : `${by.name} gave you ${given.length} files: ${given.slice(0, 3).map(fileLabel).join(', ')}${given.length > 3 ? '…' : ''}`;
    await notify([target.id], { kind: 'assigned', text, appId: given.length === 1 ? given[0].id : null, link: given.length === 1 ? `/application/${given[0].id}` : '/dashboard', by }).catch(() => {});
  }
  const files = (await listAllApplications()).filter((a) => (a.assignedTo || []).includes(target.id)).map((a) => a.id);
  return json({ added: given.length, removed, files });
}
