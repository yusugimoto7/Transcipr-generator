export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Register the button-tap webhook. Open this ONCE in a browser after setting the
// approval env vars:
//   https://<your-app>.onrender.com/api/telegram/setup
// It points Telegram at /api/telegram/webhook so ✅/❌ taps reach the app.
// NOTE: setting a webhook disables getUpdates — so finish channel-id debugging
// via /api/telegram/updates BEFORE calling this. Add ?delete=1 to remove it.
export async function GET(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ error: "TELEGRAM_BOT_TOKEN is not set." });

  const reqUrl = new URL(request.url);
  const origin = reqUrl.origin;

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
