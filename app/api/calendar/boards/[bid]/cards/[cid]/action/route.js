import { guard, json } from "../../../../../../../../lib/editing/auth";
import { approveCard, archiveCard, approvalValid, getBoard, checkId, addEvent } from "../../../../../../../../lib/calendar/model";
import { publishCard, resetChannel } from "../../../../../../../../lib/calendar/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e) {
  return json({ error: String(e.message || e) }, e.status || 500);
}

// approve | unapprove | publish_now | retry { channel } | archive
// Approving and publishing are Hamed's (admin) alone. Publishing runs in the background: the page
// reads the result from the card.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const body = await request.json().catch(() => ({}));
    const admin = g.user.role === "admin";
    switch (body.action) {
      case "approve":
      case "unapprove":
        return json({ card: await approveCard(g.user, params.bid, params.cid, body.action === "approve") });
      case "archive":
        await archiveCard(g.user, params.bid, params.cid);
        return json({ ok: true });
      case "publish_now": {
        if (!admin) return json({ error: "only Hamed publishes" }, 403);
        const b = await getBoard(params.bid);
        const card = b.cards.find((c) => c.id === checkId(params.cid));
        if (!card) return json({ error: "card not found" }, 404);
        if (!approvalValid(card)) return json({ error: "approve the card first" }, 409);
        await addEvent(card.id, g.user.id, "started publishing now");
        publishCard(params.bid, params.cid, g.user.id).catch((e) => console.error("[calendar] publish", e));
        return json({ ok: true, started: true });
      }
      case "retry":
        if (!admin) return json({ error: "only Hamed can try a channel again" }, 403);
        await resetChannel(params.bid, checkId(params.cid), String(body.channel || ""));
        await addEvent(params.cid, g.user.id, `cleared ${body.channel} to try again`);
        return json({ ok: true });
      default:
        return json({ error: "unknown action" }, 400);
    }
  } catch (e) {
    return fail(e);
  }
}
