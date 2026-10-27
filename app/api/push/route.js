import { guard, json } from "../../../lib/editing/auth";
import { pushEnabled, publicKey, prefsOf, subscribe, unsubscribe, setTeam, notify } from "../../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This person's notifications (lib/push).
//   GET                                -> { enabled, key, devices, team }
//   POST { subscription }              -> this device is added
//   POST { test: true }                -> a test notification to this person's devices
//   PATCH { team }                     -> also the team's work, or only one's own
//   DELETE { endpoint }                -> this device is removed
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const p = pushEnabled() ? await prefsOf(g.user.id).catch(() => ({ subs: [], team: false })) : { subs: [], team: false };
  return json({ enabled: pushEnabled(), key: publicKey(), devices: (p.subs || []).map((s) => s.endpoint), team: !!p.team });
}

export async function POST(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  if (!pushEnabled()) return json({ error: "notifications are not switched on on the server" }, 503);
  try {
    const body = await request.json().catch(() => ({}));
    if (body.test) {
      const sent = await notify([g.user.id], { title: ["اعلان‌ها روشن است", "Notifications are on"], body: ["از این به بعد وقتی کاری آماده شد خبرت می‌کنیم.", "You'll hear here when something is ready."], url: "/", tag: "test" }, { team: false });
      return json({ sent });
    }
    await subscribe(g.user.id, body.subscription, request.headers.get("user-agent") || "");
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e.message || e) }, 400);
  }
}

export async function PATCH(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const body = await request.json().catch(() => ({}));
  await setTeam(g.user.id, !!body.team);
  return json({ ok: true });
}

export async function DELETE(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const body = await request.json().catch(() => ({}));
  await unsubscribe(g.user.id, String(body.endpoint || ""));
  return json({ ok: true });
}
