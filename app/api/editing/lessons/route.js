import { guard, json } from "../../../../lib/editing/auth";
import { listLessons } from "../../../../lib/editing/lessons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Rule changes proposed from corrections. Admin only: they quote every member's corrections.
export async function GET(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    return json({ lessons: await listLessons() });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
