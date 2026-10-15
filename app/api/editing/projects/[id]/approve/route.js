import { guard, json, publicUser } from "../../../../../../lib/editing/auth";
import { get } from "../../../../../../lib/editing/store";
import { loadProject, approve } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { run_id }: approve the latest version after review. The full file then goes to Drive.
// Nothing is posted to Instagram or TikTok from this section.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const owner = (await get(`users/${project.owner_id}.json`))?.data || null;
    const body = await request.json().catch(() => ({}));
    await approve(g.user, project, String(body.run_id || ""), owner && publicUser(owner));
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
