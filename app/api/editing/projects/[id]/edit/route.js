import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, handEdit, editorBase, requestSourcePreview } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?run=<id>: what the hand editor opens on (the original footage's light copy and the version's cut
// as clips in the original's seconds). POST { action: "source" } asks the worker for that copy; any other
// POST is the editor's cut list, which becomes the next version (lib/editing/projects.js handEdit).
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    return json(await editorBase(project, new URL(request.url).searchParams.get("run")));
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const body = await request.json().catch(() => ({}));
    if (body.action === "source") return json({ source_preview: await requestSourcePreview(project) });
    return json({ run: await handEdit(g.user, project, body) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
