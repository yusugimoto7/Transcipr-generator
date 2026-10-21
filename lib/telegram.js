// Thin Telegram Bot API helper for the sends to the public channel.

export function tgToken() {
  return process.env.TELEGRAM_BOT_TOKEN;
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
