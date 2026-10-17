import { editingEnabled, currentUser, json } from "../../../../../lib/editing/auth";
import { accessOf } from "../../../../../lib/editing/access";
import { TICKET, TICKET_MINUTES, signTicket } from "../../../../../lib/editing/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Renews the access ticket (lib/editing/session.js) from the stored account. The middleware calls
// it when the ticket is missing or old; a disabled account or a changed password gets 401.
export async function GET(request) {
  if (!editingEnabled()) return json({ error: "off" }, 503);
  const user = await currentUser(request).catch(() => null);
  if (!user) return json({ error: "sign in again" }, 401);
  const ax = accessOf(user);
  const ticket = await signTicket(user.id, ax);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return json({ ax, ticket, mc: !!user.must_change }, 200, {
    "Set-Cookie": `${TICKET}=${ticket}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TICKET_MINUTES * 60}${secure}`,
  });
}
