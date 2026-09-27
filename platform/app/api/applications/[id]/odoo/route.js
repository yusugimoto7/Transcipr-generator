import { linkToCard } from '@/lib/odooSync';
import { json, error, requireAppAccess } from '@/lib/api';

export const runtime = 'nodejs';

/** Link this file (and its family) to an Odoo card chosen by the team. Body: { taskId } */
export async function POST(req, { params }) {
  const { app, role, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  if (role !== 'admin' && role !== 'manager') return error('Only the team can link files to Odoo.', 403);
  const body = await req.json().catch(() => ({}));
  if (!body.taskId) return error('taskId is required.');
  try {
    const card = await linkToCard(app.id, body.taskId);
    return json({ card: { taskId: card.taskId, number: card.number, name: card.name, title: card.title } });
  } catch (e) {
    return error(e.message, 400);
  }
}
