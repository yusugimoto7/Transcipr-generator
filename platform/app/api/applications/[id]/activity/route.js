import { activityFor } from '@/lib/activity';
import { json, error, requireAppAccess } from '@/lib/api';

/** The team's activity on this file, newest first (team only). */
export async function GET(_req, { params }) {
  const { app, role, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  if (role !== 'admin' && role !== 'manager') return error('Team only.', 403);
  return json({ activity: await activityFor(app.id) });
}
