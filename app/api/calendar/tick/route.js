import { json } from "../../../../lib/editing/auth";
import { tick } from "../../../../lib/calendar/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One pass of the publishing clock (lib/calendar/scheduler.js calls it every minute). Guarded by
// the session secret, so only the app itself or a cron job holding that secret can run it.
export async function GET(request) {
  const secret = process.env.EDITING_SESSION_SECRET || "";
  if (!secret || (request.headers.get("authorization") || "") !== "Bearer " + secret) return json({ error: "unauthorized" }, 401);
  try {
    return json({ ok: true, ...(await tick()) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
