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
    if (data === "edit") {
      // You can edit the draft directly in Telegram (long-press → Edit, or the
      // ⋮ menu on desktop). Publishing copies the LIVE message, so your edits
      // are what goes out.
      await tgCall("answerCallbackQuery", {
        callback_query_id: cq.id,
        text: "برای ویرایش: همین پیام را مستقیم ویرایش کن (لمس طولانی ← ویرایش، یا در دسکتاپ ⋮ ← Edit)، بعد دکمهٔ ✅ انتشار را بزن.",
        show_alert: true,
      });
    } else if (data === "pub" && msg && publicChannel) {
      // copyMessage sends the message's CURRENT content (including your edits)
      // to the public channel, without the buttons.
      const sent = await tgCall("copyMessage", {
        chat_id: publicChannel,
        from_chat_id: msg.chat.id,
        message_id: msg.message_id,
      });
      if (!sent.ok) {
        await tgCall("answerCallbackQuery", {
          callback_query_id: cq.id,
          text: "خطا در انتشار: " + (sent.description || ""),
          show_alert: true,
        });
        return Response.json({ ok: true });
      }
      // Lock the draft: drop the buttons and confirm as a reply.
      await tgCall("editMessageReplyMarkup", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: { inline_keyboard: [] },
      });
      await tgCall("sendMessage", {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: "✅ منتشر شد در کانال اصلی",
      });
      await tgCall("answerCallbackQuery", { callback_query_id: cq.id, text: "منتشر شد ✓" });
    } else if (data === "rej" && msg) {
      await tgCall("editMessageReplyMarkup", {
        chat_id: msg.chat.id,
        message_id: msg.message_id,
        reply_markup: { inline_keyboard: [] },
      });
      await tgCall("sendMessage", {
        chat_id: msg.chat.id,
        reply_to_message_id: msg.message_id,
        text: "❌ رد شد — منتشر نشد",
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
