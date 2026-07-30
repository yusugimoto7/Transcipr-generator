export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Register the button-tap webhook. Open this ONCE in a browser after setting the
// approval env vars:
//   https://<your-app>.onrender.com/api/telegram/setup
// It points Telegram at /api/telegram/webhook so ✅/❌ taps reach the app.
// NOTE: setting a webhook disables getUpdates — so finish channel-id debugging
// via /api/telegram/updates BEFORE calling this. Add ?delete=1 to remove it.
// Resolve the PUBLIC base URL. Behind Render's proxy request.url is the internal
// host (localhost:10000), so prefer an explicit ?base=, then the forwarded host
// headers the proxy sets, then Render's env var, then the raw origin.
function publicBase(request) {
  const reqUrl = new URL(request.url);
  const override = reqUrl.searchParams.get("base");
  if (override) return override.replace(/\/+$/, "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host && !/^localhost|127\.0\.0\.1/.test(host)) return `${proto}://${host}`.replace(/\/+$/, "");
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, "");
  return reqUrl.origin;
}

export async function GET(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ error: "TELEGRAM_BOT_TOKEN is not set." });

  const reqUrl = new URL(request.url);
  const origin = publicBase(request);

  if (reqUrl.searchParams.get("delete") === "1") {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`).then((r) => r.json());
    return Response.json({ deleted: true, result: res });
  }

  const webhookUrl = `${origin}/api/telegram/webhook`;
  const body = { url: webhookUrl, allowed_updates: ["callback_query"] };
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) body.secret_token = secret;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

  return Response.json({
    webhook_url: webhookUrl,
    review_chat_set: !!process.env.TELEGRAM_REVIEW_CHAT_ID,
    public_channel_set: !!process.env.TELEGRAM_PUBLIC_CHANNEL_ID,
    secret_set: !!secret,
    result: res,
  });
}
