import { tgCall, approvalEnabled } from "../../../lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram messages cap at 4096 chars; keep headroom for the header.
function clamp(s) {
  return String(s || "").slice(0, 3800);
}

// GET diagnostic: open /api/telegram in a browser to see which bot the token
// belongs to and whether it can actually reach the configured channel. Exposes
// only public info (bot username, the channel id you already set, channel
// title) — never the token. This is the fastest way to debug "chat not found".
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  const out = { token_set: !!token, chat_id_configured: chatId || null };
  if (!token) {
    out.error = "TELEGRAM_BOT_TOKEN is not set.";
    return Response.json(out);
  }
  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
    out.bot = me.ok ? "@" + me.result.username : { error: me.description };
  } catch (e) {
    out.bot = { error: String(e?.message || e) };
  }
  if (!chatId) {
    out.chat_check = { ok: false, error: "TELEGRAM_CHANNEL_ID is not set." };
    return Response.json(out);
  }
  try {
    const chat = await fetch(
      `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chatId)}`
    ).then((r) => r.json());
    out.chat_check = chat.ok
      ? { ok: true, title: chat.result.title || chat.result.username || "(reachable)" }
      : { ok: false, error: chat.description };
    if (!chat.ok && /chat not found/i.test(chat.description || "")) {
      out.fix =
        "The bot above must be an admin of THIS channel, and chat_id_configured must be that exact channel's id. Post a message in the channel, then check /api/telegram/updates to read the real id.";
    }
  } catch (e) {
    out.chat_check = { ok: false, error: String(e?.message || e) };
  }
  return Response.json(out);
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) {
    return Response.json(
      {
        error:
          "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID in your environment.",
      },
      { status: 500 }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const { topic, fa, en } = payload || {};
  const title = topic?.title_fa || topic?.title_en || "Sugimoto topic";
  const sourceLine = topic?.source_url ? `\n\n🔗 ${topic.source_url}` : "";

  // APPROVAL FLOW: send ONE publish-ready post (Farsi primary) to the review
  // chat with Approve/Reject buttons. Tapping ✅ (handled by the webhook)
  // publishes it to the public channel. Nothing hits the public channel until
  // it's approved.
  if (approvalEnabled()) {
    const body = fa || en;
    if (!body) return Response.json({ error: "nothing to send" }, { status: 400 });
    const post = `🎬 ${title}\n\n${clamp(body)}${sourceLine}`;
    try {
      const data = await tgCall("sendMessage", {
        chat_id: process.env.TELEGRAM_REVIEW_CHAT_ID,
        text: post,
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ انتشار در کانال", callback_data: "pub" },
              { text: "❌ رد", callback_data: "rej" },
            ],
          ],
        },
      });
      if (!data.ok) {
        return Response.json({ error: (data.description || "send failed") }, { status: 502 });
      }
      return Response.json({ ok: true, mode: "review" });
    } catch (e) {
      return Response.json({ error: String(e?.message || e) }, { status: 500 });
    }
  }

  const messages = [];
  if (fa) messages.push(`🎬 ${title}\n\n🇮🇷 سناریو فارسی:\n\n${clamp(fa)}${sourceLine}`);
  if (en)
    messages.push(
      `🎬 ${topic?.title_en || title}\n\n🇬🇧 English script:\n\n${clamp(en)}${sourceLine}`
    );
  if (messages.length === 0) {
    return Response.json({ error: "nothing to send" }, { status: 400 });
  }

  try {
    for (const text of messages) {
      const res = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
          }),
        }
      );
      const data = await res.json();
      if (!data.ok) {
        const desc = String(data.description || "Telegram send failed");
        let hint = "";
        if (/chat not found/i.test(desc)) {
          hint =
            " — ربات به کانال دسترسی نداره. مطمئن شو: ۱) ربات به‌عنوان Admin با اجازهٔ Post به کانال اضافه شده، و ۲) مقدار TELEGRAM_CHANNEL_ID دقیقاً درست باشه (آی‌دی عددی مثل -100xxxxxxxxxx یا @username کانال).";
        } else if (/bot.*(kicked|not a member|forbidden)/i.test(desc) || /forbidden/i.test(desc)) {
          hint = " — ربات از کانال حذف شده یا Admin نیست. دوباره به‌عنوان Admin اضافه‌ش کن.";
        } else if (/chat_id is empty|invalid/i.test(desc)) {
          hint = " — TELEGRAM_CHANNEL_ID خالی یا نامعتبره.";
        }
        return Response.json({ error: desc + hint }, { status: 502 });
      }
    }
    return Response.json({ ok: true, sent: messages.length });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
