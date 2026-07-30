import { tgCall } from "../../../../lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram calls this when a reviewer taps a button on a draft post.
//  ✅ "pub" -> publish the reviewed text to the public channel.
//  ❌ "rej" -> mark it rejected; nothing is published.
// Register it once via GET /api/telegram/setup.
export async function POST(request) {
  // Verify the shared secret Telegram echoes back (if configured).
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  let update;
  try {
    update = await request.json();
  } catch (_) {
    return Response.json({ ok: true });
  }

  const cq = update.callback_query;
  if (!cq) return Response.json({ ok: true }); // ignore anything but button taps

  const msg = cq.message;
  const data = cq.data || "";
  const publicChannel = process.env.TELEGRAM_PUBLIC_CHANNEL_ID;

  try {
    if (data === "pub" && msg && publicChannel) {
      const text = msg.text || "";
      const sent = await tgCall("sendMessage", {
        chat_id: publicChannel,
        text,
        disable_web_page_preview: true,
      });
      if (!sent.ok) {
        await tgCall("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "خطا در انتشار: " + (sent.description || ""),
          show_alert: true,
        });
        return Response.json({ ok: true });
      }
      // Lock the draft: remove buttons and mark it published.
      await tgCall("editMessageText", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: text + "\n\n✅ منتشر شد در کانال",
        disable_web_page_preview: true,
      });
      await tgCall("answerCallbackQuery", { callback_query_id: cq.id, text: "منتشر شد ✓" });
    } else if (data === "rej" && msg) {
      await tgCall("editMessageText", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        text: (msg.text || "") + "\n\n❌ رد شد",
        disable_web_page_preview: true,
      });
      await tgCall("answerCallbackQuery", { callback_query_id: cq.id, text: "رد شد" });
    } else {
      await tgCall("answerCallbackQuery", { callback_query_id: cq.id });
    }
  } catch (_) {
    // Best-effort; Telegram will retry the update if we don't 200, so still 200.
  }

  return Response.json({ ok: true });
}
