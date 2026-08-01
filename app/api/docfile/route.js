export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Send a generated article as a Word-compatible .doc file to the Telegram
// review chat. Generated entirely here — no Google account, no Apps Script.
export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId =
    process.env.TELEGRAM_REVIEW_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) {
    return Response.json(
      { error: "Telegram is not configured (TELEGRAM_BOT_TOKEN + a chat id)." },
      { status: 500 }
    );
  }

  let article;
  try {
    ({ article } = await request.json());
  } catch (_) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!article || !article.title_fa || !article.content_html) {
    return Response.json({ error: "missing article" }, { status: 400 });
  }

  const html =
    '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">' +
    '<head><meta charset="utf-8"></head>' +
    '<body dir="rtl" style="text-align:right;font-family:Arial,sans-serif;line-height:1.8">' +
    "<h1>" + article.title_fa + "</h1>" +
    article.content_html +
    "</body></html>";
  const filename = (article.slug || "article") + ".doc";

  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", "📄 " + (article.title_fa || "").slice(0, 200));
    form.append(
      "document",
      new Blob(["﻿" + html], { type: "application/msword" }),
      filename
    );
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) {
      return Response.json(
        { error: data.description || "Telegram sendDocument failed" },
        { status: 502 }
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
