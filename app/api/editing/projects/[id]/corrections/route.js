import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, addCorrection, deleteCorrection } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { run_id, out: "1:49", note }  ·  DELETE ?run_id=&cid=
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    return json({ correction: await addCorrection(g.user, project, await request.json().catch(() => ({}))) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function DELETE(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const q = new URL(request.url).searchParams;
    await deleteCorrection(g.user, project, q.get("run_id"), q.get("cid"));
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
