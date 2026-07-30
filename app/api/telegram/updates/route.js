export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Helper to find the CORRECT channel id. Steps:
//  1. Post any message in your channel (as the channel).
//  2. Open /api/telegram/updates in a browser.
//  3. Copy the "chat_id" it shows into TELEGRAM_CHANNEL_ID on Render.
// Telegram only returns channel posts here if the bot is an admin of the channel.
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ error: "TELEGRAM_BOT_TOKEN is not set." });
  try {
    const data = await fetch(
      `https://api.telegram.org/bot${token}/getUpdates`
    ).then((r) => r.json());
    if (!data.ok) return Response.json({ error: data.description });

    const chats = new Map();
    for (const u of data.result || []) {
      const chat = u.channel_post?.chat || u.message?.chat || u.my_chat_member?.chat;
      if (chat && chat.id) {
        chats.set(chat.id, { chat_id: chat.id, type: chat.type, title: chat.title || chat.username || "" });
      }
    }
    const found = [...chats.values()];
    return Response.json({
      hint:
        found.length === 0
          ? "No chats seen yet. Post a message IN your channel, then reload this page. (The bot must be a channel admin.)"
          : "Copy the channel's chat_id below into TELEGRAM_CHANNEL_ID on Render.",
      chats: found,
    });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) });
  }
}
