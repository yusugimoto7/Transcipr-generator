import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, setProjectAccess } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Who sees this project: { team: true } or { team: false, members: [user ids] }. Owner and admin only.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const access = await setProjectAccess(g.user, project, await request.json().catch(() => ({})));
    return json({ access });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
