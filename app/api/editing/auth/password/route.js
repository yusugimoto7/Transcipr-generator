import { Lfor } from "../../../../../lib/i18n";
import { guard, checkPassword, setPassword, sessionCookie, publicUser, json } from "../../../../../lib/editing/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const g = await guard(request, { allowMustChange: true });
  if (g.res) return g.res;
  const body = await request.json().catch(() => ({}));
  if (!checkPassword(String(body.current || ""), g.user.hash)) return json({ error: Lfor(request)("رمز عبور فعلی‌ات اشتباه است", "your current password is wrong") }, 400);
  if (String(body.next || "") === String(body.current || "")) return json({ error: Lfor(request)("یک رمز عبور جدید انتخاب کن", "choose a new password") }, 400);
  try {
    const user = await setPassword(g.user.id, body.next);
    return json({ user: publicUser(user) }, 200, { "Set-Cookie": await sessionCookie(user) });
  } catch (e) {
    return json({ error: String(e.message || e) }, 400);
  }
}
