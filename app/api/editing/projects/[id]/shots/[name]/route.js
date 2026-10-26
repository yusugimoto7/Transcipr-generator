import { guard, json } from "../../../../../../../lib/editing/auth";
import { getShot } from "../../../../../../../lib/editing/store";
import { loadProject, shotOf } from "../../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A correction's screenshot, for whoever may see its project (loadProject).
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const buf = await getShot(await shotOf(project, params.name));
    if (!buf) return json({ error: "not found" }, 404);
    return new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
