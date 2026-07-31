import { tgCall, approvalEnabled } from "../../../lib/telegram";
import { newsPostPrompt } from "../../../lib/prompts";
import { getRelatedCandidates } from "../../../lib/wordpress";
import { fetchArticleText } from "../../../lib/news";
import { openaiEnabled, openaiRewrite } from "../../../lib/openai";
import { callClaude } from "../../../lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram messages cap at 4096 chars; keep headroom for the header.
function clamp(s) {
  return String(s || "").slice(0, 3800);
}

function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Generate a CLEAN Farsi news post (no hooks / no sales CTA), grounded in the
// real source article. Falls back to the provided fa script if generation fails.
async function generateNewsPost(topic, fallback) {
  let sourceText = "";
  if (topic?.source_url) sourceText = await fetchArticleText(topic.source_url).catch(() => "");
  if (!sourceText && topic?.snippet) sourceText = String(topic.snippet);
  const prompt = newsPostPrompt(topic, sourceText);
  try {
    if (openaiEnabled()) {
      try {
        return (await openaiRewrite(prompt)).trim();
      } catch (e) {
        if (!process.env.ANTHROPIC_API_KEY) throw e;
        return (await callClaude([{ role: "user", content: prompt }], false, 1500)).trim();
      }
    }
    return (await callClaude([{ role: "user", content: prompt }], false, 1500)).trim();
  } catch (_) {
    return escapeHtml(clamp(fallback || topic?.title_fa || ""));
  }
}

// Pick the single genuinely-relevant sugimotovisa.com link for a topic. Pulls a
// shortlist from the site, then lets the model choose the best match — or NONE,
// so we never attach an unrelated page.
async function pickRelatedLink(topic) {
  const candidates = await getRelatedCandidates(topic).catch(() => []);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const list = candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.url}`).join("\n");
  const prompt = `موضوع خبر: ${topic?.title_fa || topic?.title_en || ""}

از بین صفحات زیر از سایت سوگیموتوویزا، فقط مرتبط‌ترین صفحه به همین موضوع خبری رو انتخاب کن. فقط شمارهٔ همون یک مورد رو بنویس (مثلاً: 3). اگه هیچ‌کدوم واقعاً به موضوع مربوط نیست، دقیقاً بنویس: NONE

${list}`;

  let ans = "";
  try {
    if (openaiEnabled()) {
      try {
        ans = await openaiRewrite(prompt);
      } catch (e) {
        if (!process.env.ANTHROPIC_API_KEY) throw e;
        ans = await callClaude([{ role: "user", content: prompt }], false, 30);
      }
    } else {
      ans = await callClaude([{ role: "user", content: prompt }], false, 30);
    }
  } catch (_) {
    return null; // don't attach a link we're unsure about
  }
  if (/none/i.test(ans)) return null;
  const m = String(ans).match(/\d+/);
  if (!m) return null;
  return candidates[parseInt(m[0], 10) - 1] || null;
}

// GET diagnostic: open /api/telegram in a browser to see which bot the token
// belongs to and whether it can actually reach the configured channel. Exposes
// only public info (bot username, the channel id you already set, channel
// title) — never the token. This is the fastest way to debug "chat not found".
export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const out = { token_set: !!token };
  if (!token) {
    out.error = "TELEGRAM_BOT_TOKEN is not set in Render.";
    return Response.json(out);
  }

  // Which bot does this token belong to?
  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
    out.bot = me.ok ? "@" + me.result.username : { error: me.description };
  } catch (e) {
    out.bot = { error: String(e?.message || e) };
  }

  // Check EVERY channel the app might use — so you can see exactly which one is
  // wrong. "review" + "public" = the approval flow; "direct" = the old mode.
  const roles = {
    review: process.env.TELEGRAM_REVIEW_CHAT_ID,
    public: process.env.TELEGRAM_PUBLIC_CHANNEL_ID,
    direct: process.env.TELEGRAM_CHANNEL_ID,
  };
  out.approval_flow_active = !!(roles.review && roles.public);
  out.channels = {};
  for (const [role, id] of Object.entries(roles)) {
    if (!id) {
      out.channels[role] = { set: false };
      continue;
    }
    try {
      const chat = await fetch(
        `https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(id)}`
      ).then((r) => r.json());
      if (chat.ok) {
        out.channels[role] = { set: true, id, reachable: true, title: chat.result.title || chat.result.username || "(ok)" };
      } else {
        out.channels[role] = {
          set: true,
          id,
          reachable: false,
          error: chat.description,
          fix: /chat not found/i.test(chat.description || "")
            ? "Add the bot above as an admin of this channel (with Post messages), OR fix this id. Post in the channel then open /api/telegram/updates to get its real id."
            : undefined,
        };
      }
    } catch (e) {
      out.channels[role] = { set: true, id, reachable: false, error: String(e?.message || e) };
    }
  }
  return Response.json(out);
}

export async function POST(request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  // Configured if we have a bot token AND either the approval flow (review +
  // public) OR a direct channel. Previously this wrongly required
  // TELEGRAM_CHANNEL_ID even in approval mode, where it is intentionally empty.
  if (!token || (!approvalEnabled() && !chatId)) {
    return Response.json(
      {
        error:
          "Telegram is not configured. Set TELEGRAM_BOT_TOKEN plus either TELEGRAM_REVIEW_CHAT_ID + TELEGRAM_PUBLIC_CHANNEL_ID (approval flow) or TELEGRAM_CHANNEL_ID (direct).",
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

  // APPROVAL FLOW: send ONE clean news post to the review chat with buttons.
  // The post is grounded NEWS (no hooks / no sales CTA), with the source link
  // AND the most relevant sugimotovisa.com link. Tapping ✅ (webhook) publishes
  // it — you can edit the message first. Nothing hits the public channel until
  // it's approved.
  if (approvalEnabled()) {
    try {
      const [newsHtml, related] = await Promise.all([
        generateNewsPost(topic, fa || en),
        pickRelatedLink(topic).catch(() => null),
      ]);
      let post = newsHtml || escapeHtml(clamp(fa || en || title));
      // No external "news source" link in the channel — only the relevant
      // sugimotovisa.com page (when one genuinely matches).
      if (related?.url) {
        post += `\n\n📎 <a href="${escapeHtml(related.url)}">${escapeHtml(related.title || "مطلب مرتبط در سوگیموتوویزا")}</a>`;
      }
      const keyboard = {
        inline_keyboard: [
          [
            { text: "✅ انتشار", callback_data: "pub" },
            { text: "✏️ ویرایش", callback_data: "edit" },
            { text: "❌ رد", callback_data: "rej" },
          ],
        ],
      };
      // Try HTML; if the model emitted a stray tag, retry as plain text.
      let data = await tgCall("sendMessage", {
        chat_id: process.env.TELEGRAM_REVIEW_CHAT_ID,
        text: post.slice(0, 3900),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: keyboard,
      });
      if (!data.ok && /parse|entit|tag/i.test(data.description || "")) {
        data = await tgCall("sendMessage", {
          chat_id: process.env.TELEGRAM_REVIEW_CHAT_ID,
          text: post.replace(/<[^>]+>/g, "").slice(0, 3900),
          disable_web_page_preview: true,
          reply_markup: keyboard,
        });
      }
      if (!data.ok) {
        return Response.json({ error: data.description || "send failed" }, { status: 502 });
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
