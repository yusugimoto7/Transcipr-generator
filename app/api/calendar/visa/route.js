import { guard, json } from "../../../../lib/editing/auth";
import { HttpError } from "../../../../lib/calendar/model";
import { addVisaStories } from "../../../../lib/calendar/fromTopic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Studio's visa-result stories into one draft card (posting still needs Hamed's approval).
export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const body = await request.json();
    return json({ card: await addVisaStories(g.user, body) });
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json({ error: String(e.message || e).slice(0, 300) }, 500);
  }
}
