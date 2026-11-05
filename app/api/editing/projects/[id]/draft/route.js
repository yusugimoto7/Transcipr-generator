import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, getDraft, saveDraft, saveDraftImage, draftImage } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The hand editor's saved edit (lib/editing/projects.js getDraft / saveDraft).
//   GET ?run=<id>       the edit, or { draft: null }
//   GET ?img=<key>      one of its pictures
//   PUT  { base_run_id, basis, segs, ovs, images }   save the edit
//   POST { key, image } keep a picture (a data: URL) once
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const q = new URL(request.url).searchParams;
    const project = await loadProject(g.user, params.id);
    if (q.get("img")) {
      const { buf, type } = await draftImage(project, q.get("img"));
      return new Response(buf, { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
    }
    return json({ draft: await getDraft(project, q.get("run") || "") });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function PUT(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    return json(await saveDraft(g.user, project, await request.json().catch(() => ({}))));
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
    return json({ path: await saveDraftImage(project, body.key, body.image) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
