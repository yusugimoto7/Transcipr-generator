import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, handEdit } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The hand editor's cut list becomes the next version (lib/editing/projects.js handEdit).
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const body = await request.json().catch(() => ({}));
    return json({ run: await handEdit(g.user, project, body) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
