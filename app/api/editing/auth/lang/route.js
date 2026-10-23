import { editingEnabled, currentUser, json } from "../../../../../lib/editing/auth";
import { update } from "../../../../../lib/editing/store";
import { LANG_COOKIE, normLang } from "../../../../../lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The interface language: a cookie for this device, and the account for the next one. Open to
// everyone (the sign-in page has the switch too); only a signed-in person's account is written.
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const lang = normLang(body.lang);
  if (editingEnabled()) {
    const user = await currentUser(request).catch(() => null);
    if (user && user.lang !== lang) {
      await update(`users/${user.id}.json`, (u) => ({ ...u, lang }), `app: language ${user.id}`).catch(() => {});
    }
  }
  return json({ ok: true, lang }, 200, { "Set-Cookie": `${LANG_COOKIE}=${lang}; Path=/; Max-Age=${365 * 86400}; SameSite=Lax` });
}
