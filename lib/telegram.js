// Thin Telegram Bot API helper shared by the send / webhook / setup routes.

export function tgToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

// Approval flow is active only when BOTH a review chat (where drafts + buttons
// go) and a public channel (where approved posts publish) are configured.
export function approvalEnabled() {
  return !!process.env.TELEGRAM_REVIEW_CHAT_ID && !!process.env.TELEGRAM_PUBLIC_CHANNEL_ID;
}

export async function tgCall(method, body) {
  const token = tgToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}
