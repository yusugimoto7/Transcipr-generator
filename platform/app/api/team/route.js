import { listUsers, effectiveRole } from '@/lib/store';
import { json, requireStaff } from '@/lib/api';

/** The team (active admins and account managers), for @mentions. */
export async function GET() {
  const { error: err } = await requireStaff();
  if (err) return err;
  const team = (await listUsers())
    .filter((u) => u.active !== false && ['admin', 'manager'].includes(effectiveRole(u)))
    .map((u) => ({ id: u.id, name: u.name || u.email, email: u.email, role: effectiveRole(u) }));
  return json({ team });
}
