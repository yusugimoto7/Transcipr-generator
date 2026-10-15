import { guard, json, allUsers } from "../../../../lib/editing/auth";
import { listProjects, createProject, isAdmin } from "../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: my projects (the admin: everyone's, optional ?owner=<user id>).  POST: new project.
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const owner = new URL(request.url).searchParams.get("owner") || "";
    const projects = await listProjects(g.user, owner);
    const names = isAdmin(g.user) ? Object.fromEntries((await allUsers()).map((u) => [u.id, u.name])) : {};
    return json({ projects: projects.map((p) => ({ ...p, owner_name: names[p.owner_id] || "" })) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await createProject(g.user, await request.json().catch(() => ({})));
    return json({ project });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
