import { guard, json } from "../../../../../../../lib/editing/auth";
import { editCard, getBoard, comments, checkId, approvalValid } from "../../../../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e) {
  return json({ error: String(e.message || e) }, e.status || 500);
}

export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const b = await getBoard(params.bid);
    const card = b.cards.find((c) => c.id === checkId(params.cid));
    if (!card) return json({ error: "this card was archived or removed" }, 404);
    return json({ card: { ...card, approved: approvalValid(card) }, comments: await comments(card.id) });
  } catch (e) {
    return fail(e);
  }
}

// Any change a team member makes, including a move (list_id + pos) or a new date.
export async function PATCH(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const card = await editCard(g.user, params.bid, params.cid, await request.json().catch(() => ({})));
    return json({ card: { ...card, approved: approvalValid(card) } });
  } catch (e) {
    return fail(e);
  }
}
