import { guard } from "../../../../../../lib/editing/auth";
import { readState } from "../../../../../../lib/calendar/connections";
import { appUrl } from "../../../../../../lib/calendar/media";
import * as tiktok from "../../../../../../lib/calendar/channels/tiktok";
import * as youtube from "../../../../../../lib/calendar/channels/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGN_IN = { tiktok, youtube };

export async function GET(request, { params }) {
  const g = await guard(request, { admin: true });
  const back = (msg) => Response.redirect(`${appUrl(request)}/calendar?connected=${encodeURIComponent(msg)}`, 302);
  if (g.res) return back("sign in as the admin first");
  const a = SIGN_IN[params.channel];
  const q = new URL(request.url).searchParams;
  const st = readState(q.get("state"));
  if (!a || !st || st.uid !== g.user.id) return back("the sign-in link expired; try again");
  if (q.get("error")) return back(`${params.channel}: ${q.get("error_description") || q.get("error")}`);
  try {
    await a.finishConnect(q.get("code"), `${appUrl(request)}/api/calendar/connect/${params.channel}/callback`);
    return back(`${params.channel} connected`);
  } catch (e) {
    return back(String(e.message || e));
  }
}
