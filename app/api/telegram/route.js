export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram messages cap at 4096 chars; keep headroom for the header.
function clamp(s) {
  return String(s || "").slice(0, 3800);
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
