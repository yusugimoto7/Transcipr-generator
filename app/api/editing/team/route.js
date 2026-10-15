import { guard, allUsers, createUser, publicUser, json } from "../../../../lib/editing/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  const users = (await allUsers()).map(publicUser).sort((a, b) => a.created_at - b.created_at);
  return json({ users });
}

// Add a member: name, email, temporary password (they must change it at first login).
export async function POST(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  const body = await request.json().catch(() => ({}));
  try {
    const user = await createUser({ ...body, role: body.role === "admin" ? "admin" : "member", created_by: g.user.id });
    return json({ user: publicUser(user) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 400);
  }
}
