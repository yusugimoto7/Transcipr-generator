import { guard, json } from "../../../lib/editing/auth";
import { studyStatus, runStudy } from "../../../lib/voice-study";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The voice study (lib/voice-study.js): how far it is, admin only.
export async function GET(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    const s = await studyStatus();
    return json({ ...s, items: undefined, states: (s.items || []).reduce((a, i) => ((a[i.state] = (a[i.state] || 0) + 1), a), {}) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

// POST { count, restart }: start it again (restart reads the list of videos afresh).
export async function POST(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  const body = await request.json().catch(() => ({}));
  const count = Math.min(300, Math.max(1, Number(body.count) || 100));
  return json(await runStudy({ count, restart: !!body.restart, by: (g.user && g.user.id) || "" }));
}
