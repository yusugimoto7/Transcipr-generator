import { guard, json } from "../../../../lib/editing/auth";
import { listProjects } from "../../../../lib/editing/projects";
import { getEntries } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What can become a card: the Topic Engine's topics (admin only; members keep seeing only their
// own work) and Video Editing projects whose video is approved (members: their own).
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const out = { topics: [], videos: [] };
  if (g.user.role === "admin") {
    const entries = await getEntries().catch(() => []);
    out.topics = entries
      .filter((e) => e.status !== "archived")
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 200)
      .map((e) => ({ key: e.key, title: e.topic.title_en || e.topic.title_fa, title_fa: e.topic.title_fa || "", url: e.topic.source_url || "", status: e.status, has: Object.keys(e.materials || {}) }));
  }
  const projects = await listProjects(g.user).catch(() => []);
  out.videos = projects
    .filter((p) => p.latest && p.latest.status === "approved" && p.latest.delivery)
    .map((p) => ({ id: p.id, title: p.title, topic: p.topic || "", url: p.latest.delivery.view, version: p.latest.version }));
  return json(out);
}
