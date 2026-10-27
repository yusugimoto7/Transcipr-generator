import { pollSocialLane } from "../../../../lib/social/lane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One read of the followed accounts, called by the lane's clock (lib/social/lane-clock.js) with the
// server's own secret. Open in access.js; the secret is the check.
export async function GET(request) {
  const secret = process.env.EDITING_SESSION_SECRET || "";
  const given = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const st = await pollSocialLane({ reason: "clock" });
  const last = st.log && st.log[0];
  return Response.json(
    { ok: true, cards: st.cards, today: st.today, last: last ? { posts: last.posts, fresh: last.fresh, made: last.made, skipped: last.skipped } : null, error: st.error },
    { headers: { "Cache-Control": "no-store" } }
  );
}
