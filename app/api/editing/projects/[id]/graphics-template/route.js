import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, setGraphicsTemplate } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { template, remake }: the motion graphics look for this project; remake plans the version in review again.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const body = await request.json().catch(() => ({}));
    return json(await setGraphicsTemplate(g.user, project, String(body.template || ""), { remake: !!body.remake }));
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
