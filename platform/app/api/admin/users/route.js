import { listUsers, createUser, updateUser, getUserById, adminEmails } from '@/lib/store';
import { hashPassword } from '@/lib/auth';
import { json, error, requireAdmin } from '@/lib/api';

export async function GET() {
  const { error: err } = await requireAdmin();
  if (err) return err;
  return json({ users: await listUsers() });
}

/** Create a staff account. Body: { email, name, password, role: 'manager'|'admin' } */
export async function POST(req) {
  const { user: admin, error: err } = await requireAdmin();
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'manager';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return error('Enter a valid email address.');
  if (password.length < 8) return error('Password must be at least 8 characters.');
  try {
    const u = await createUser({ email, name: String(body.name || '').trim(), passwordHash: await hashPassword(password), role, createdBy: admin.id });
    return json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active } }, 201);
  } catch (e) {
    if (e.code === 'EMAIL_TAKEN') return error(e.message, 409);
    return error('Could not create account.', 500);
  }
}

/** Update a user. Body: { id, role?, active?, name?, password? } */
export async function PATCH(req) {
  const { user: admin, error: err } = await requireAdmin();
  if (err) return err;
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const target = await getUserById(body.id);
  if (!target) return error('User not found.', 404);
  // The configured admin can never be locked out or demoted.
  if (adminEmails().includes(target.email) && (body.active === false || (body.role && body.role !== 'admin'))) {
    return error('The configured admin account cannot be deactivated or demoted.', 400);
  }
  if (target.id === admin.id && body.active === false) return error('You cannot deactivate yourself.', 400);
  const patch = {};
  if (body.role) patch.role = body.role;
  if (typeof body.active === 'boolean') patch.active = body.active;
  if (typeof body.name === 'string') patch.name = body.name;
  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) return error('Password must be at least 8 characters.');
    patch.passwordHash = await hashPassword(body.password);
  }
  const u = await updateUser(target.id, patch);
  return json({ user: { id: u.id, email: u.email, name: u.name, role: u.role, active: u.active } });
}
