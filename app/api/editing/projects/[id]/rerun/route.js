import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, rerun } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apply the corrections (or retry a failed version): starts the next version.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    return json({ run: await rerun(g.user, project) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
