import { odooConfig, listCards, cardUrl } from '@/lib/odoo';
import { normName, sameName } from '@/lib/odooSync';
import { json, error, requireStaff } from '@/lib/api';

export const runtime = 'nodejs';

/** Search the TR Visa cards (including closed ones) by name or client number: GET ?q= */
export async function GET(req) {
  const { error: err } = await requireStaff();
  if (err) return err;
  if (!odooConfig().configured) return error('Odoo is not connected.', 503);
  const q = new URL(req.url).searchParams.get('q') || '';
  try {
    const cards = await listCards({ all: true });
    const nq = normName(q);
    const hits = cards.filter((c) => !nq || sameName(c.name, q) || normName(c.title).includes(nq)).slice(0, 20);
    return json({ cards: hits.map((c) => ({ taskId: c.taskId, title: c.title, number: c.number, name: c.name, stage: c.stage, createdAt: c.createdAt, url: cardUrl(c.taskId) })) });
  } catch (e) {
    return error(e.message, 502);
  }
}
