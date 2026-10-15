import { guard, setPassword, publicUser, json } from "../../../../../lib/editing/auth";
import { update } from "../../../../../lib/editing/store";
import { checkId } from "../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Disable / enable a member, allow them to approve their own cuts, or give a new temporary password.
export async function PATCH(request, { params }) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    const id = checkId("u", params.id);
    const body = await request.json().catch(() => ({}));
    if (id === g.user.id && (body.active === false || body.role === "member")) return json({ error: "you cannot lock yourself out" }, 400);
    let user;
    if (body.temp_password) user = await setPassword(id, body.temp_password, { mustChange: true });
    const fields = {};
    if (typeof body.active === "boolean") fields.active = body.active;
    if (typeof body.may_approve_own === "boolean") fields.may_approve_own = body.may_approve_own;
    if (Object.keys(fields).length) user = await update(`users/${id}.json`, (u) => ({ ...u, ...fields }), `app: user ${id}`);
    return json({ user: publicUser(user) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 400);
  }
}
