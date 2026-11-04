import { guard, json } from "../../../lib/editing/auth";
import { inboxOf, markSeen } from "../../../lib/push";
import { storeConfigured } from "../../../lib/editing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The notification centre of the person signed in (bell in the top bar, lib/push).
//   GET        -> { items: [{ id, title, body, url, at }], unread }
//   POST {}    -> everything counts as read
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  if (!storeConfigured()) return json({ items: [], unread: 0 });
  const { items, seen } = await inboxOf(g.user.id);
  return json({ items, seen, unread: items.filter((x) => x.at > seen).length });
}

export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  if (storeConfigured()) await markSeen(g.user.id).catch(() => {});
  return json({ ok: true });
}
