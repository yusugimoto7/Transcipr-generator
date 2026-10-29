import { guard, json } from "../../../lib/editing/auth";
import { studyStatus, runStudy, carouselStatus, runCarouselStudy } from "../../../lib/voice-study";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The voice study (lib/voice-study.js): how far it is, admin only.
export async function GET(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    const brief = (s) => ({ ...s, items: undefined, states: (s.items || []).reduce((a, i) => ((a[i.state] = (a[i.state] || 0) + 1), a), {}) });
    return json({ videos: brief(await studyStatus()), carousels: brief(await carouselStatus()) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

// POST { count, restart, study: "videos" | "carousels" }: start one again (restart reads the list afresh).
export async function POST(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  const body = await request.json().catch(() => ({}));
  const count = Math.min(300, Math.max(1, Number(body.count) || 100));
  const by = (g.user && g.user.id) || "";
  if (body.study === "carousels") return json(await runCarouselStudy({ restart: !!body.restart, by }));
  return json(await runStudy({ count, restart: !!body.restart, by }));
}
