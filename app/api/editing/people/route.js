import { guard, json } from "../../../../lib/editing/auth";
import { listPeople, createPerson } from "../../../../lib/editing/people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: the people who speak in dubbed videos, each with their fixed voice.  POST { name, voice_id, run_id?, speaker? }: a new one.
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    return json({ people: await listPeople() });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}

export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    return json({ person: await createPerson(g.user, await request.json().catch(() => ({}))) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
