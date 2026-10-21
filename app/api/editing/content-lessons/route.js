import { guard, json } from "../../../../lib/editing/auth";
import { allLessons, setLessonActive, SCOPES } from "../../../../lib/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The rules Hamed taught the content prompts with "learn from this note" (lib/learning.js).
export async function GET(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    return json({ lessons: await allLessons({ fresh: true }), scopes: SCOPES });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

// POST { id, active }: switch a rule off (it stops going into the prompts) or back on.
export async function POST(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    const { id, active } = await request.json();
    await setLessonActive(id, active);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.message === "not found" ? 404 : 500);
  }
}
