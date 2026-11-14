import { guard, json, allUsers } from "../../../../../../lib/editing/auth";
import { accessOf } from "../../../../../../lib/editing/access";
import { loadProject, canSee } from "../../../../../../lib/editing/projects";
import { notify } from "../../../../../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Share a project with teammates (Hamed, Nov 14 2026: "a share button on the card, to send it to team mates or
// copy its link"). GET: the people it can go to (Video Editing access, the project shared with them, not me).
// POST { to: [user ids], note }: each gets a push and an inbox line that opens the project. Nothing about who
// may see or edit the project changes: that stays with "who can edit".
async function people(user, project) {
  return (await allUsers())
    .filter((u) => u.id !== user.id && u.active !== false && (u.role === "admin" || accessOf(u).includes("editing")) && canSee(u, project))
    .map((u) => ({ id: u.id, name: u.name }));
}

export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    return json({ people: await people(g.user, project) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const body = await request.json().catch(() => ({}));
    const allowed = new Set((await people(g.user, project)).map((p) => p.id));
    const to = [...new Set(Array.isArray(body.to) ? body.to : [])].filter((x) => allowed.has(x));
    if (!to.length) return json({ error: "choose at least one person" }, 400);
    const note = String(body.note || "").trim().slice(0, 500);
    const who = g.user.name || "";
    const title = String(project.title || "");
    await notify(to, {
      title: [`${who} یک پروژه برات فرستاد`, `${who} shared a project with you`],
      body: [note ? `${title}\n${note}` : title, note ? `${title}\n${note}` : title],
      url: `/editing/p/${project.id}`,
      tag: `share-${project.id}-${Date.now()}`,
    }, { except: "" });
    return json({ sent: to.length });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
