import { guard, json, allUsers } from "../../../../../../lib/editing/auth";
import { archivedCards, restoreCard } from "../../../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The board's archived cards: GET ?q=&offset= (newest archived first, 50 at a time),
// POST { card_id } puts one back on the board (lib/calendar/model.js restoreCard).
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const q = new URL(request.url).searchParams;
    const out = await archivedCards(params.bid, { q: q.get("q") || "", offset: Number(q.get("offset")) || 0 });
    const names = new Map((await allUsers()).map((u) => [u.id, u.name]));
    return json({ ...out, cards: out.cards.map((c) => ({ ...c, archived_by_name: names.get(c.archived_by) || "" })) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const b = await request.json().catch(() => ({}));
    return json({ card: await restoreCard(g.user, params.bid, String(b.card_id || "")) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
