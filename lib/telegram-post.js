// The Telegram news post: written from the topic's source text, edited by the
// team in the app (not in Telegram), given one picture in the carousel's
// style, and sent from the app straight to the public channel. Nothing is
// sent until someone presses Send on the topic page.
//
// The post is kept editable as plain text with **bold** (what the editor
// types); it becomes Telegram HTML only when it is sent. The related
// sugimotovisa.com page is kept apart, so editing the text cannot break it.

import { newsPostPrompt } from "./prompts.js";
import { cleanText } from "./clean-text.js";
import { getRelatedCandidates } from "./wordpress.js";
import { sourceTextFor } from "./grounding.js";
import { editorNoteBlock } from "./custom-news.js";
import { lessonsBlock } from "./learning.js";
import { glossaryBlock } from "./glossary.js";
import { englishBlock, englishPicturePrompt } from "./lang.js";
import { openaiEnabled, openaiRewrite, openaiPost } from "./openai.js";
import { callClaude } from "./anthropic.js";
import { tgCall, tgToken } from "./telegram.js";
import { drawBrandImage, keepImage, editPicture, telegramTarget, imageBytes } from "./carousel.js";

// Telegram messages cap at 4096 chars; keep headroom for the header.
export function clamp(s) {
  return String(s || "").slice(0, 3800);
}

export function escapeHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function ask(prompt, maxTokens) {
  if (openaiEnabled()) {
    try {
      return await openaiRewrite(prompt);
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
    }
  }
  return callClaude([{ role: "user", content: prompt }], false, maxTokens);
}

// The post itself goes to the strongest model; picking the related link stays on the cheap one.
async function askWriter(prompt) {
  if (openaiEnabled()) {
    try {
      return await openaiPost(prompt);
    } catch (e) {
      console.log("[telegram] post model failed, trying the cheaper one:", String(e?.message || e));
      return ask(prompt, 1500);
    }
  }
  return ask(prompt, 1500);
}

// A CLEAN Farsi news post (no hooks, no sales line), grounded in the real
// source text. `strict` throws instead of falling back to the script, for the
// in-app editor where a failure should say so.
export async function generateNewsPost(topic, fallback, { strict = false, notes = "", previous = "", lang = "fa" } = {}) {
  const sourceText = await sourceTextFor(topic, { maxChars: 4500 });
  if (strict && (!sourceText || sourceText.length < 60)) throw new Error("no source text to write the post from");
  let prompt = newsPostPrompt(topic, sourceText) + editorNoteBlock(topic, "fa") + (await lessonsBlock("telegram", "fa"));
  if (previous && notes) {
    prompt += `\n\nنسخه قبلی پست که تیم دیده (طبق یادداشت بازنویسی کن و هر چیزی که یادداشت نخواسته عوض بشه رو نگه دار):\n${previous}\n\nیادداشت تیم برای این نسخه (فقط شکل و تأکید؛ هر فکتی فقط از متن منبع):\n${notes}`;
  } else if (notes) {
    prompt += `\n\nیادداشت تیم برای این پست (فقط شکل و تأکید؛ هر فکتی فقط از متن منبع):\n${notes}`;
  }
  prompt += await glossaryBlock(lang === "en" ? "en" : "fa");
  if (lang === "en") prompt += englishBlock("telegram");
  try {
    return String(await askWriter(prompt)).trim();
  } catch (e) {
    if (strict) throw e;
    return escapeHtml(clamp(fallback || topic?.title_fa || ""));
  }
}

// The single genuinely relevant sugimotovisa.com page for a topic, or none:
// a shortlist from the site, then the model picks one or NONE, so an
// unrelated page is never attached.
export async function pickRelatedLink(topic) {
  const candidates = await getRelatedCandidates(topic).catch(() => []);
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const list = candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.url}`).join("\n");
  const prompt = `موضوع خبر: ${topic?.title_fa || topic?.title_en || ""}

از بین صفحات زیر از سایت سوگیموتوویزا، فقط مرتبط‌ترین صفحه به همین موضوع خبری رو انتخاب کن. فقط شمارهٔ همون یک مورد رو بنویس (مثلاً: 3). اگه هیچ‌کدوم واقعاً به موضوع مربوط نیست، دقیقاً بنویس: NONE

${list}`;

  let ans = "";
  try {
    ans = await ask(prompt, 30);
  } catch (_) {
    return null; // don't attach a link we're unsure about
  }
  if (/none/i.test(ans)) return null;
  const m = String(ans).match(/\d+/);
  if (!m) return null;
  return candidates[parseInt(m[0], 10) - 1] || null;
}

// ---- editable text <-> Telegram HTML -------------------------------------

function unescapeHtml(s) {
  return String(s || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

export function htmlToEditable(html) {
  return unescapeHtml(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**")
      .replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**")
      .replace(/<[^>]+>/g, "")
  ).trim();
}

export function editableToHtml(text) {
  return escapeHtml(String(text || "").trim()).replace(/\*\*([^*\n][\s\S]*?)\*\*/g, "<b>$1</b>");
}

function linkHtml(link, lang = "fa") {
  if (!link || !/^https:\/\//.test(link.url || "")) return "";
  return `\n\n📎 <a href="${escapeHtml(link.url)}">${escapeHtml(link.title || (lang === "en" ? "Related on Sugimoto Visa" : "مطلب مرتبط در سوگیموتوویزا"))}</a>`;
}

export function cleanLink(link) {
  if (!link || !/^https:\/\/\S+$/.test(String(link.url || ""))) return null;
  return { url: String(link.url).slice(0, 500), title: String(link.title || "").slice(0, 200) };
}

// Writes the post (and finds the related page) for the editor to work on.
export async function writePost(topic, { notes = "", previous = "", lang = "fa" } = {}) {
  const [html, related] = await Promise.all([
    generateNewsPost(topic, "", { strict: true, notes, previous: previous ? editableToHtml(previous) : "", lang }),
    pickRelatedLink(topic).catch(() => null),
  ]);
  const text = htmlToEditable(html);
  if (!text) throw new Error("the post could not be written; try again");
  return { text: cleanText(text, { lang }).slice(0, 3800), link: cleanLink(related) };
}

// ---- the picture ----------------------------------------------------------

// The headline is the post's first line (the bold title): it comes from the
// source text like the rest of the post, so the picture adds no fact.
export function headlineOf(text, topic) {
  const first = String(text || "").split("\n").map((l) => l.replace(/\*\*/g, "").trim()).find(Boolean) || "";
  const h = first.split(/\s+/).length <= 16 ? first : "";
  return h || String((topic && (topic.title_fa || topic.title_en)) || "").trim();
}

function picturePrompt(headline, notes, withRefs) {
  return `Design ONE news image (4:5 portrait) for the Telegram channel of Sugimoto Visa, a licensed Persian-language immigration consultancy for Canada and Europe. It sits above a news post, like a magazine cover for that one story.

HEADLINE TO RENDER — Persian (Farsi), right-to-left. Render it EXACTLY as given, every word spelled correctly with correct Persian letter joining; nothing added, removed or translated. Keep English words and numbers exactly as written.
PERSIAN TYPOGRAPHY: lines right-aligned; kashida only where a line needs it; every headline line the same font size, the headline one block read as one sentence, never a word of it set apart in a smaller box. Headline to render:
"""
${headline}
"""

Layout: the headline large and bold, easy to read on a phone; a strong picture that fits the subject: a striking conceptual scene WITHOUT people (documents, a passport, a Canadian or European landmark, an airport, a campus, a map), photographic and cinematic. No other text on the image.
PEOPLE: avoid them; at most a person seen from behind or at a distance. NEVER show anyone wearing a hijab, headscarf or any head covering.
${withRefs ? "VISUAL STYLE: match the attached reference posts — they are this brand's own designs. Use them for STYLE ONLY (colours, typography, shapes); never copy their text, subjects, people or logos.\n" : ""}Style: deep teal (#0d4f4b) and white with a soft cream (#f3e3c3) accent; heavy bold Persian display typeface; clean and premium. Never recognisable public figures; no government or university logos.
KEEP THE BOTTOM-CENTRE STRIP (the bottom 10% of the image) COMPLETELY EMPTY AND PLAIN — the company logo is placed there afterwards. Do not draw any logo, wordmark or brand name anywhere.${notes ? `\n\nEditor's design notes: ${notes}` : ""}`;
}

function slug(topic) {
  const base = String((topic && topic.title_en) || "topic").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `sugimoto-telegram-${base || "topic"}-${Date.now().toString(36)}`;
}

export async function drawPicture(topic, text, notes = "", lang = "fa") {
  const headline = headlineOf(text, topic);
  if (!headline) throw new Error("write the post first");
  const taught = await lessonsBlock("design");
  const words = lang === "en" ? englishPicturePrompt : (p) => p;
  const buffer = await drawBrandImage((withRefs) => words(picturePrompt(headline, String(notes || "").slice(0, 800), withRefs)) + taught);
  return { ...(await keepImage(buffer, slug(topic))), headline };
}

export function editPostPicture(topic, url, instruction, text, lang = "fa") {
  return editPicture(url, instruction, { text: headlineOf(text, topic), name: slug(topic), lang });
}

// ---- sending ----------------------------------------------------------------

async function send(method, body) {
  let r = await tgCall(method, { ...body, parse_mode: "HTML" });
  // A stray tag in edited text: send it as plain text rather than not at all.
  if (!r.ok && /parse|entit|tag/i.test(r.description || "")) {
    const strip = (s) => unescapeHtml(String(s || "").replace(/<[^>]+>/g, ""));
    const plain = { ...body };
    if (plain.text) plain.text = strip(plain.text);
    if (plain.caption) plain.caption = strip(plain.caption);
    r = await tgCall(method, plain);
  }
  if (!r.ok) throw new Error("Telegram: " + (r.description || "send failed"));
  return r.result;
}

// The picture is uploaded as a file rather than handed to Telegram as a link:
// Telegram's fetcher can be refused by the site that stores it (and by the
// app's own login), and then the whole post fails.
async function sendPhotoFile(chat, url, caption) {
  const token = tgToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  const bytes = await imageBytes(url);
  const post = async (cap, html) => {
    const form = new FormData();
    form.append("chat_id", String(chat));
    form.append("photo", new Blob([bytes], { type: "image/jpeg" }), "sugimoto-visa.jpg");
    if (cap) {
      form.append("caption", cap);
      if (html) form.append("parse_mode", "HTML");
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form });
    return res.json();
  };
  let r = await post(caption, true);
  if (!r.ok && caption && /parse|entit|tag/i.test(r.description || "")) r = await post(unescapeHtml(caption.replace(/<[^>]+>/g, "")), false);
  if (!r.ok) throw new Error("Telegram (picture): " + (r.description || "send failed"));
  return r.result;
}

// To the public channel: the picture with the post as its caption when it
// fits (a photo caption holds 1024 characters), else the picture and then the
// post as its own message right under it.
// An English post goes only to the English channel; it is never sent to the Persian one.
export function englishChannel() {
  return process.env.TELEGRAM_PUBLIC_CHANNEL_ID_EN || "";
}

export async function sendPost({ text, link, image_url }, lang = "fa") {
  const chat = lang === "en" ? englishChannel() : telegramTarget("public");
  if (!chat) throw new Error(lang === "en" ? "No English Telegram channel is configured (TELEGRAM_PUBLIC_CHANNEL_ID_EN)" : "No public Telegram channel is configured (TELEGRAM_PUBLIC_CHANNEL_ID)");
  const html = editableToHtml(text) + linkHtml(cleanLink(link), lang);
  if (!html.trim()) throw new Error("the post is empty");
  if (html.length > 4000) throw new Error("the post is too long for Telegram (4000 characters at most)");
  const ids = [];
  if (image_url) {
    if (html.length <= 1000) {
      ids.push((await sendPhotoFile(chat, image_url, html)).message_id);
      return { chat, messages: ids };
    }
    ids.push((await sendPhotoFile(chat, image_url, "")).message_id);
  }
  ids.push((await send("sendMessage", { chat_id: chat, text: html, disable_web_page_preview: true })).message_id);
  return { chat, messages: ids };
}
