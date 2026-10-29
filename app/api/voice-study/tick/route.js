import { studyTick } from "../../../../lib/voice-study";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called once after the server starts (instrumentation.js) with the server's own secret: runs the
// voice study when it was never finished. Open in access.js; the secret is the check.
export async function GET(request) {
  const secret = process.env.EDITING_SESSION_SECRET || "";
  const given = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json(await studyTick().catch((e) => ({ started: false, reason: String(e.message || e) })), { headers: { "Cache-Control": "no-store" } });
}
