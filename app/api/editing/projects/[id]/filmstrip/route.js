import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, previewOf } from "../../../../../../lib/editing/projects";
import { filmstrip } from "../../../../../../lib/editing/filmstrip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The hand editor's filmstrip (lib/editing/filmstrip.js) for what it plays: ?run=source for the light
// copy of the original, ?run=<id> for a version's preview. ?meta=1 gives the grid's layout, otherwise
// the picture itself.
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const q = new URL(request.url).searchParams;
    const project = await loadProject(g.user, params.id);
    const id = await previewOf(project, q.get("run"));
    const { buf, meta } = await filmstrip(id);
    if (q.get("meta") === "1") return json(meta);
    return new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
