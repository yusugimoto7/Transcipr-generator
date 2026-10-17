import { guard, json, allUsers } from "../../../../../lib/editing/auth";
import { getBoard, editBoard, removeBoard, approvalValid, contentHash, postStatus } from "../../../../../lib/calendar/model";
import { channelStatus, dryRun, autoPublish } from "../../../../../lib/calendar/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e) {
  return json({ error: String(e.message || e) }, e.status || 500);
}

// The whole board for the team: lists, labels, cards (with whether each approval still holds),
// the team's names for assigning cards, and which channels are connected.
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const b = await getBoard(params.bid);
    const users = (await allUsers()).filter((u) => u.active).map((u) => ({ id: u.id, name: u.name, role: u.role }));
    return json({
      board: { ...b, cards: b.cards.map((c) => ({ ...c, approved: approvalValid(c), stale_approval: !!c.approval && !approvalValid(c), hash: contentHash(c), status: postStatus(c) })) },
      users,
      channels: await channelStatus(),
      settings: { dry_run: dryRun(), autopublish: autoPublish() },
      me: { id: g.user.id, name: g.user.name, role: g.user.role },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    return json({ board: await editBoard(g.user, params.bid, await request.json().catch(() => ({}))) });
  } catch (e) {
    return fail(e);
  }
}

// Remove the board from every view (admin only; see removeBoard).
export async function DELETE(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    await removeBoard(g.user, params.bid);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
