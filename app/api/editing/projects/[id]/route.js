import { guard, json, publicUser, allUsers } from "../../../../../lib/editing/auth";
import { accessOf } from "../../../../../lib/editing/access";
import { get } from "../../../../../lib/editing/store";
import { loadProject, runsOf, correctionsOf, canApprove, isAdmin, nextStages, accessOfProject, canShare } from "../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One project with every version and the corrections on the latest one. 403 for anyone it is not
// shared with (canSee).
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
      access: accessOfProject(project),
      can_share: canShare(g.user, project),
      // the people it can be shared with: everyone who has Video Editing, but its owner
      team: canShare(g.user, project)
        ? (await allUsers()).filter((u) => u.id !== project.owner_id && u.role !== "admin" && accessOf(u).includes("editing")).map((u) => ({ id: u.id, name: u.name }))
        : [],
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
