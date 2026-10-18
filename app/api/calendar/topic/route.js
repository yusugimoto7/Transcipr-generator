import { guard, json } from "../../../../lib/editing/auth";
import { HttpError } from "../../../../lib/calendar/model";
import { topicCalendar, addFromTopic } from "../../../../lib/calendar/fromTopic";
import { platformPosting, dryRun } from "../../../../lib/calendar/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The topic page's calendar strip: what was made from the topic, which of it is already on the
// calendar, and adding one as a draft card. Every signed-in person may add; posting still needs
// Hamed's approval of the card.
function fail(e) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.log("[calendar/topic]", e);
  return json({ error: String(e.message || e).slice(0, 300) }, 500);
}

export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    return json({ ...(await topicCalendar(g.user, new URL(request.url).searchParams.get("key") || "")), platform_posting: platformPosting() || dryRun() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const body = await request.json();
    return json({ card: await addFromTopic(g.user, body) });
  } catch (e) {
    return fail(e);
  }
}
