import { guard, json } from "../../../../../lib/editing/auth";
import { makeState } from "../../../../../lib/calendar/connections";
import { appUrl } from "../../../../../lib/calendar/media";
import * as tiktok from "../../../../../lib/calendar/channels/tiktok";
import * as youtube from "../../../../../lib/calendar/channels/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGN_IN = { tiktok, youtube };

// Admin only: send Hamed to TikTok's or Google's sign-in page to connect the account.
export async function GET(request, { params }) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  const a = SIGN_IN[params.channel];
  if (!a) return json({ error: "this channel is connected with keys on Render, not here" }, 400);
  const s = await a.status();
  if (!s.connect) return json({ error: s.detail }, 400);
  const redirect = `${appUrl(request)}/api/calendar/connect/${params.channel}/callback`;
  return Response.redirect(a.authUrl(redirect, makeState(g.user.id)), 302);
}
