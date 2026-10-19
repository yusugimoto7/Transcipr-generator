import { guard, json } from "../../../../../../lib/editing/auth";
import { listAction } from "../../../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The menu on a list's header: rename | color | move | copy | sort | move_all | archive_published |
// archive_all | archive_list. Who may do which is decided in listAction.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const out = await listAction(g.user, params.bid, await request.json().catch(() => ({})));
    return json({ ok: true, archived: out.archived });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
