import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, startStage } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { stage: "subtitles" | "graphics" }: start the next step on the approved video.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const body = await request.json().catch(() => ({}));
    return json({ run: await startStage(g.user, project, String(body.stage || "")) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
