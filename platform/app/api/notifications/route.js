import { listFor, markRead } from '@/lib/notify';
import { json, error, requireStaff } from '@/lib/api';

/** My notifications (team only): { items, unread }. */
export async function GET(req) {
  const { user, error: err } = await requireStaff();
  if (err) return err;
  const limit = Math.min(300, Number(new URL(req.url).searchParams.get('limit')) || 100);
  return json(await listFor(user.id, { limit }));
}

/** { action: 'read' | 'unread', ids? } — no ids: all of mine. */
export async function POST(req) {
  const { user, error: err } = await requireStaff();
  if (err) return err;
  let body = {};
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  if (!['read', 'unread'].includes(body.action)) return error('Unknown action.');
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
  await markRead(user.id, ids, body.action === 'read');
  return json(await listFor(user.id));
}
