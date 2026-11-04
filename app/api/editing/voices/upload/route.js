import { guard, json } from "../../../../../lib/editing/auth";
import { storeVoice } from "../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A voice for a voice-only motion graphics project (New project → Motion graphics only → Voice only),
// recorded on the page or chosen from the device. Stored before the project exists, named by the
// project when it is made.
export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const form = await request.formData();
    return json({ voice: await storeVoice(form.get("audio")) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
