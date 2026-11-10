import { guard, json } from "../../../../../../lib/editing/auth";
import { addLabel } from "../../../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { name, color } — a new label on the board, by anyone signed in (lib/calendar/model.js addLabel).
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const body = await request.json().catch(() => ({}));
    return json({ label: await addLabel(g.user, params.bid, body) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
