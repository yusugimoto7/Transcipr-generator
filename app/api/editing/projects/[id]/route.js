import { guard, json, publicUser } from "../../../../../lib/editing/auth";
import { get } from "../../../../../lib/editing/store";
import { loadProject, runsOf, correctionsOf, canApprove, isAdmin, nextStages } from "../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One project with every version and the corrections on the latest one. 403 for anyone but its
// owner and the admin.
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const owner = (await get(`users/${project.owner_id}.json`))?.data || null;
    const runs = await runsOf(project.id);
    const latest = runs.find((r) => r.id === project.latest_run_id) || runs[runs.length - 1] || null;
    const corrections = latest ? await correctionsOf(latest.id) : [];
    const strip = (r) => (isAdmin(g.user) ? r : { ...r, log_tail: undefined });
    return json({
      project,
      owner: owner ? { id: owner.id, name: owner.name } : null,
      runs: runs.map(strip),
      corrections,
      can_approve: canApprove(g.user, project, owner && publicUser(owner)),
      next_stages: nextStages(runs, project),
      me: { id: g.user.id, role: g.user.role },
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
