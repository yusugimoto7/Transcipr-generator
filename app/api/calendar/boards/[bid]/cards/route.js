import { guard, json } from "../../../../../../lib/editing/auth";
import { addCard } from "../../../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e) {
  return json({ error: String(e.message || e) }, e.status || 500);
}

export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    return json({ card: await addCard(g.user, params.bid, await request.json().catch(() => ({}))) });
  } catch (e) {
    return fail(e);
  }
}
