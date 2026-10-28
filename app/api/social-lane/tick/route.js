import { pollSocialLane, laneStatus } from "../../../../lib/social/lane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// One read of the followed accounts, called by the lane's clock (lib/social/lane-clock.js) with the
// server's own secret. Open in access.js; the secret is the check. The read is started and the
// answer given at once: a read with transcripts can take minutes, and the clock only needs to know
// it began (the lane page shows what it did).
export async function GET(request) {
  const secret = process.env.EDITING_SESSION_SECRET || "";
  const given = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (secret && given !== secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const before = laneStatus();
  pollSocialLane({ reason: "clock" }).catch(() => {});
  return Response.json(
    { ok: true, started: true, was_polling: before.polling, cards: before.cards, today: before.today, last_poll: before.last_poll, error: before.error },
    { headers: { "Cache-Control": "no-store" } }
  );
}
