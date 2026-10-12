// Carousel posts from a topic: the slide texts are written by the Content
// Wizard's carousel prompt (same brand rules and format the team already
// uses there), each slide is drawn by the image model, the images are kept in
// the WordPress media library, and the set can be sent to Telegram.
//
// Grounding: slide text comes only from the topic's source text, like the
// scripts. The image prompt hands the model the finished slide text and tells
// it to render exactly that, nothing more — the picture must not add a fact.

import OpenAI from "openai";
import { carouselPrompt, parseCarousel } from "./wizardPrompts.js";
import { generateText } from "./wizardOpenai.js";
import { fetchArticleText } from "./news.js";
import { getLexbaseItems, findLexbaseItem } from "./newsletter/lexbase.js";
import { uploadMedia, wordpressEnabled } from "./wordpress.js";
import { tgCall } from "./telegram.js";

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
// 4:5 portrait, Instagram's tallest feed format. gpt-image-2 takes any size
// whose edges are multiples of 16.
const IMAGE_SIZE = process.env.CAROUSEL_IMAGE_SIZE || "1088x1360";
// medium is about 5 cents a slide; high about 20 and noticeably slower.
const IMAGE_QUALITY = process.env.CAROUSEL_IMAGE_QUALITY || "medium";
const IMAGE_PARALLEL = 3;

export const MIN_SLIDES = 3;
export const MAX_SLIDES = 10; // a Telegram album holds at most 10 photos

let client = null;
function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function publicBase() {
  return (process.env.PUBLIC_BASE_URL || "https://sugimoto-topic-engine.onrender.com").replace(/\/+$/, "");
}

// The text the topic rests on: the newsletter item itself, else the article,
// else the card's stored excerpt.
export async function sourceTextFor(topic) {
  if (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || "")) {
    await getLexbaseItems({ waitMs: 8000 }).catch(() => {});
    const it = findLexbaseItem(topic);
    if (it && it.text) return it.text;
  }
  let text = "";
  if (topic.source_url) text = await fetchArticleText(topic.source_url).catch(() => "");
  if (!text && topic.snippet) text = String(topic.snippet);
  return text;
}

export async function writeSlides(topic, count, notes, sourceText) {
  const n = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Number(count) || 7));
  let prompt = carouselPrompt(
    { ...topic, title: topic.title_fa || topic.title_en, slideCount: n, format: "carousel" },
    sourceText
  );
  if (notes) {
    prompt += `\n\nEditor's notes for THIS carousel (follow them, as long as they do not require any fact that is not in the source text):\n${notes}`;
  }
  const parsed = parseCarousel(await generateText(prompt, 4000));
  const slides = (parsed.slides || [])
    .filter((s) => s && String(s.content || "").trim())
    .slice(0, n)
    .map((s, i) => ({ num: i + 1, content: String(s.content).trim() }));
  if (slides.length < MIN_SLIDES) throw new Error("the slide texts could not be written");
  return { slides, caption: parsed.caption || "" };
}

function imagePrompt(slide, total, notes) {
  const role =
    slide.num === 1
      ? "This is the COVER slide: the headline is the hero, very large and bold."
      : slide.num === total
        ? "This is the LAST slide: a clear takeaway, with the call-to-action lines visually separated at the bottom."
        : "This is a content slide: clear hierarchy, bullet points laid out as a clean list or simple table if the text is tabular.";
  return `Design slide ${slide.num} of ${total} of an Instagram carousel for Sugimoto Visa, a licensed Persian-language immigration consultancy (Canada and Europe).

TEXT TO RENDER — Persian (Farsi), right-to-left. Render it EXACTLY as given, every word spelled correctly, correct Persian letter joining, nothing added, removed or translated. Keep any English words, numbers and emojis exactly as written:
"""
${slide.content}
"""

${role}
Brand look, the same on every slide of the set: clean, modern, editorial; white or very light warm background; brand orange #F26A12 as the accent colour with deep navy #121A24 text; generous margins; a modern Persian sans-serif typeface (like Vazirmatn); small "SUGIMOTO VISA" wordmark at the bottom; small "${slide.num}/${total}" in a corner. Simple flat illustration or icons only where they help — no photos of real people, no flags unless the text has a flag emoji, no logos of governments or other organisations.
Do not add any words, numbers, dates or claims that are not in the text above.${notes ? `\n\nEditor's design notes: ${notes}` : ""}`;
}

async function drawSlide(slide, total, notes) {
  const res = await openai().images.generate({
    model: IMAGE_MODEL,
    prompt: imagePrompt(slide, total, notes),
    size: IMAGE_SIZE,
    quality: IMAGE_QUALITY,
    output_format: "jpeg",
    output_compression: 90,
    n: 1,
  });
  const b64 = res.data && res.data[0] && res.data[0].b64_json;
  if (!b64) throw new Error("the image model returned no image");
  return Buffer.from(b64, "base64");
}

// In-memory fallback for when WordPress cannot take the upload. Lost on
// restart; the WordPress copy is the one that lasts.
const memory = globalThis.__sugimotoImages || (globalThis.__sugimotoImages = new Map());
export function memoryImage(id) {
  return memory.get(id) || null;
}

async function keepImage(buffer, name) {
  if (wordpressEnabled()) {
    try {
      return { url: (await uploadMedia(buffer, name + ".jpg", "image/jpeg")).url, kept: "wordpress" };
    } catch (e) {
      console.log("[carousel] WordPress upload failed:", String(e?.message || e).slice(0, 200));
    }
  }
  const id = globalThis.crypto.randomUUID();
  memory.set(id, buffer);
  return { url: `${publicBase()}/api/carousel/img/${id}`, kept: "memory" };
}

function slug(topic) {
  const base = String(topic.title_en || "topic")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `sugimoto-carousel-${base || "topic"}-${Date.now().toString(36)}`;
}

// Draws every slide that has no image yet (all of them for a new carousel),
// a few at a time. `onSlide` reports progress as each one is done.
export async function drawSlides(topic, slides, notes, onSlide = () => {}) {
  const name = slug(topic);
  const todo = slides.filter((s) => !s.image_url);
  let next = 0;
  const errors = [];
  const worker = async () => {
    while (next < todo.length) {
      const s = todo[next++];
      try {
        const kept = await keepImage(await drawSlide(s, slides.length, notes), `${name}-${s.num}`);
        s.image_url = kept.url;
        s.kept = kept.kept;
        s.error = "";
      } catch (e) {
        s.error = String(e?.message || e).slice(0, 200);
        errors.push(s.error);
      }
      onSlide(s);
    }
  };
  await Promise.all(Array.from({ length: IMAGE_PARALLEL }, worker));
  if (errors.length === todo.length && todo.length) throw new Error("no image could be drawn: " + errors[0]);
  return slides;
}

export async function redrawSlide(topic, slides, num, notes) {
  const s = slides.find((x) => x.num === Number(num));
  if (!s) throw new Error("no such slide");
  const kept = await keepImage(await drawSlide(s, slides.length, notes), `${slug(topic)}-${s.num}`);
  s.image_url = kept.url;
  s.kept = kept.kept;
  s.error = "";
  return slides;
}

export function telegramTarget(target) {
  return target === "public"
    ? process.env.TELEGRAM_PUBLIC_CHANNEL_ID || process.env.TELEGRAM_CHANNEL_ID || ""
    : process.env.TELEGRAM_REVIEW_CHAT_ID || process.env.TELEGRAM_CHANNEL_ID || "";
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// One Telegram album (up to 10 photos). A photo caption holds 1024 characters,
// so a longer Instagram caption follows the album as its own message.
export async function sendCarousel(carousel, target) {
  const chat = telegramTarget(target);
  if (!chat) throw new Error(target === "public" ? "No public channel is configured" : "No review chat is configured");
  const photos = (carousel.slides || []).filter((s) => s.image_url).slice(0, MAX_SLIDES);
  if (!photos.length) throw new Error("this carousel has no images yet");
  const caption = String(carousel.caption || "").trim();
  const short = caption.length <= 1000;
  const media = photos.map((s, i) => ({
    type: "photo",
    media: s.image_url,
    ...(i === 0 && caption && short ? { caption: esc(caption), parse_mode: "HTML" } : {}),
  }));
  const r = await tgCall("sendMediaGroup", { chat_id: chat, media });
  if (!r.ok) throw new Error("Telegram: " + (r.description || "send failed"));
  if (caption && !short) {
    const r2 = await tgCall("sendMessage", { chat_id: chat, text: esc(caption).slice(0, 4000), parse_mode: "HTML" });
    if (!r2.ok) throw new Error("Telegram (caption): " + (r2.description || "send failed"));
  }
  return { chat, messages: r.result.length };
}
