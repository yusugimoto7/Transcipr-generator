import { clearCookie, clearTicket } from "../../../../../lib/editing/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const h = new Headers({ "Cache-Control": "no-store" });
  h.append("Set-Cookie", clearCookie());
  h.append("Set-Cookie", clearTicket());
  return Response.json({ ok: true }, { headers: h });
}
