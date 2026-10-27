import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, subtitleLines, editSubtitleLines } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?run=<run id> → { lines: [{ n, start, end, text }] }  ·  POST { run_id, edits: [{ line, text }] }
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    return json({ lines: await subtitleLines(project, new URL(request.url).searchParams.get("run")) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    return json(await editSubtitleLines(g.user, project, await request.json().catch(() => ({}))));
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
