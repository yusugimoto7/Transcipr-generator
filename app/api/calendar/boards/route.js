import { guard, json } from "../../../../lib/editing/auth";
import { listBoards, createBoard } from "../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(e) {
  return json({ error: String(e.message || e) }, e.status || 500);
}

export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    return json({ boards: await listBoards(g.user) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const body = await request.json().catch(() => ({}));
    return json({ board: await createBoard(g.user, body.name) });
  } catch (e) {
    return fail(e);
  }
}
