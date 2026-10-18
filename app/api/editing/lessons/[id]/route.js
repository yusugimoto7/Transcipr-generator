import { guard, json } from "../../../../../lib/editing/auth";
import { decideLesson } from "../../../../../lib/editing/lessons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { action: "approve" | "reject", note }. An approval commits the rule change, as shown, to
// the rough-cut rules in english-sugimotovisa.
export async function POST(request, { params }) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    const body = await request.json().catch(() => ({}));
    await decideLesson(g.user, params.id, String(body.action || ""), body.note);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
