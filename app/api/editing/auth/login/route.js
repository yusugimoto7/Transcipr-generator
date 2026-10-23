import { LANG_COOKIE, normLang } from "../../../../../lib/i18n";
import { editingEnabled, findByEmail, checkPassword, createUser, sessionCookie, publicUser, json, normEmail, loginLocked, loginFailed, loginOk, allUsers } from "../../../../../lib/editing/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!editingEnabled()) return json({ error: "Video Editing is not switched on yet" }, 503);
  const body = await request.json().catch(() => ({}));
  const email = normEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "enter your email and password" }, 400);
  if (loginLocked(email)) return json({ error: "too many attempts; wait 15 minutes" }, 429);
  try {
    let user = await findByEmail(email);
    // First login of the admin: the account is created from ADMIN_EMAIL + ADMIN_BOOTSTRAP_PASSWORD,
    // only while no admin exists yet.
    if (!user && email === normEmail(process.env.ADMIN_EMAIL) && process.env.ADMIN_BOOTSTRAP_PASSWORD &&
        password === process.env.ADMIN_BOOTSTRAP_PASSWORD && !(await allUsers()).some((u) => u.role === "admin")) {
      user = await createUser({ name: "Hamed", email, password, role: "admin", created_by: "bootstrap" });
    }
    if (!user || !user.active || !checkPassword(password, user.hash)) {
      loginFailed(email);
      return json({ error: "wrong email or password" }, 401);
    }
    loginOk(email);
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append("Set-Cookie", await sessionCookie(user));
    // The language chosen on the account follows the person to this device.
    if (user.lang) headers.append("Set-Cookie", `${LANG_COOKIE}=${normLang(user.lang)}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax`);
    return Response.json({ user: publicUser(user) }, { status: 200, headers });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
