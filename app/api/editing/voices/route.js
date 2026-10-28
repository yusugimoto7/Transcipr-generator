import { guard, json } from "../../../../lib/editing/auth";
import { voiceCatalogue } from "../../../../lib/editing/people";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The voices a dub speaker can have: Hamed's approved voice and the HeyGen public voices of the worker's
// catalogue (config/video_process.json on main of english-sugimotovisa, the one place the video process is
// defined; the app never holds a copy).
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    return json(await voiceCatalogue());
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
