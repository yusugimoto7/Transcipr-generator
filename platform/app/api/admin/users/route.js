import { listUsers, createUser, updateUser, getUserById, adminEmails, userLevel } from '@/lib/store';
import { hashPassword } from '@/lib/auth';
import { json, error, requireAdmin } from '@/lib/api';

/**
 * Team accounts. Who may do what:
 *   super admin  create, change and deactivate anyone (admins and super admins too);
 *   admin        create and manage account managers (and client logins) — not admins.
 * The ADMIN_EMAIL account(s) can never be demoted or deactivated.
 */
const STAFF = ['superadmin', 'admin', 'manager'];
const canManage = (actorLevel, targetLevel) => actorLevel === 'superadmin' || !['superadmin', 'admin'].includes(targetLevel);
const canGrant = (actorLevel, level) => actorLevel === 'superadmin' || level === 'manager' || level === 'applicant';

export async function GET() {
  const { user, error: err } = await requireAdmin();
  if (err) return err;
  const me = userLevel(user);
  const users = (await listUsers()).map((u) => ({ ...u, canManage: canManage(me, u.level) && !(u.fixed && u.id !== user.id && me !== 'superadmin') }));
  return json({ users, me: { id: user.id, level: me } });
}

/** Create a staff account. Body: { email, name, password, role: 'manager'|'admin'|'superadmin' } */
export async function POST(req) {
  const { user: actor, error: err } = await requireAdmin();
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = STAFF.includes(body.role) ? body.role : 'manager';
  if (!canGrant(userLevel(actor), role)) return error('Only a super admin can create admins.', 403);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Enter a valid email address.');
  if (password.length < 8) return error('Password must be at least 8 characters.');
  try {
    const u = await createUser({ email, name: String(body.name || '').trim(), passwordHash: await hashPassword(password), role, createdBy: actor.id });
    return json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, level: userLevel(u), active: u.active } }, 201);
  } catch (e) {
    if (e.code === 'EMAIL_TAKEN') return error(e.message, 409);
    return error('Could not create account.', 500);
  }
}

/** Update a user. Body: { id, role?, active?, name?, password? } */
export async function PATCH(req) {
  const { user: actor, error: err } = await requireAdmin();
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const target = await getUserById(body.id);
  if (!target) return error('User not found.', 404);
  const me = userLevel(actor);
  const theirs = userLevel(target);
  if (!canManage(me, theirs)) return error('Only a super admin can change an admin’s account.', 403);
  if (body.role && !canGrant(me, body.role)) return error('Only a super admin can make someone an admin.', 403);
  // The configured super admin can never be locked out or demoted.
  if (adminEmails().includes(target.email) && (body.active === false || (body.role && body.role !== 'superadmin'))) {
    return error('The configured super admin (ADMIN_EMAIL) cannot be deactivated or demoted.', 400);
  }
  if (target.id === actor.id && body.active === false) return error('You cannot deactivate yourself.', 400);
  if (target.id === actor.id && body.role && body.role !== theirs) return error('You cannot change your own role.', 400);
  const patch = {};
  if (body.role) patch.role = body.role;
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.autoNewFiles === 'boolean') patch.autoNewFiles = body.autoNewFiles;
  if (typeof body.allFiles === 'boolean') {
    if (me !== 'superadmin') return error('Only a super admin can change which files an admin sees.', 403);
    if (theirs !== 'admin') return error('“All files” is set for admins only.');
    patch.allFiles = body.allFiles;
  }
  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) return error('Password must be at least 8 characters.');
    patch.passwordHash = await hashPassword(body.password);
  }
  const u = await updateUser(target.id, patch);
  return json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, level: userLevel(u), active: u.active } });
}
