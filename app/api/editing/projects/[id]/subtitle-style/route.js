import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, setSubtitleStyle } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { subtitles: { size, position_y, words_per_group, font, look, colour, highlight, language }, remake }
// Saves the project's subtitle settings; with remake, the subtitles version waiting for review is made
// again in them (lib/editing/projects.js setSubtitleStyle).
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const body = await request.json().catch(() => ({}));
    const out = await setSubtitleStyle(g.user, project, body.subtitles, { remake: !!body.remake });
    return json({ settings: out.project.settings, run: out.run });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
