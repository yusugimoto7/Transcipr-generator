import { guard, json } from "../../../../../../../../lib/editing/auth";
import { addComment } from "../../../../../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e) {
  return json({ error: String(e.message || e) }, e.status || 500);
}

export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const body = await request.json().catch(() => ({}));
    return json({ comment: await addComment(g.user, params.cid, body.text) });
  } catch (e) {
    return fail(e);
  }
}
