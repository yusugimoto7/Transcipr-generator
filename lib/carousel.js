// Carousel posts from a topic: the slide texts are written by the Content
// Wizard's carousel prompt (same brand rules and format the team already
// uses there), each slide is drawn by the image model, the images are kept in
// the WordPress media library, and the set can be sent to Telegram.
//
// Grounding: slide text comes only from the topic's source text, like the
// scripts. The image prompt hands the model the finished slide text and tells
// it to render exactly that, nothing more — the picture must not add a fact.

import OpenAI, { toFile } from "openai";
import sharp from "sharp";
import fs from "node:fs/promises";
import path from "node:path";
import { carouselPrompt, parseCarousel } from "./wizardPrompts.js";
import { generateText } from "./wizardOpenai.js";
import { BRAND_CONTEXT } from "./brandContext.js";
import { openaiScript } from "./openai.js";
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

// The model is asked for "===SLIDE 1===" markers, but writing in Persian it
// sometimes uses Persian digits, extra spaces or markdown around them, or the
// Persian word for slide. Normalise all of that before parsing.
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function normaliseMarkers(raw) {
  return String(raw || "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/[*_#>\s]*={2,}\s*(?:slide|اسلاید)\s*([0-9۰-۹٠-٩]+)\s*={2,}[*_]*/gi, (_, n) => {
      const d = String(n)
        .replace(/[۰-۹]/g, (c) => String(FA_DIGITS.indexOf(c)))
        .replace(/[٠-٩]/g, (c) => String(AR_DIGITS.indexOf(c)));
      return `\n===SLIDE ${Number(d)}===\n`;
    })
    .replace(/[*_#>\s]*={2,}\s*(?:caption|کپشن)\s*={2,}[*_]*/gi, "\n===CAPTION===\n");
}

function parseSlides(raw, n) {
  const parsed = parseCarousel(normaliseMarkers(raw));
  const slides = (parsed.slides || [])
    .filter((s) => s && String(s.content || "").trim())
    .slice(0, n)
    .map((s, i) => ({ num: i + 1, content: String(s.content).trim() }));
  return { slides, caption: parsed.caption || "" };
}

const NEWS_RULES = `

THIS CAROUSEL REPORTS NEWS — these rules OVERRIDE the structure above where they conflict:
- The hook on slide 1 is the news itself: the concrete fact, number, decision or date, stated plainly and specifically (e.g. «کانادا ویزای ۲۳۰ مقام ارشد رژیم ایران را لغو کرد» or «انتظار گواهی شهروندی به ۲۵ ماه رسید»). The fact is what makes people stop.
- Do NOT address the reader. Never write «برای شما چه معنی دارد؟», «این برای من چه معنایی داره؟», «آیا شما هم…», «اگر شما…», «باید بدانید», «ذخیره کنید», or any sentence whose subject is the reader. No questions as hooks.
- Slides 2 to the second-last report what happened: what was decided, by whom, when, which numbers, who it covers. Every slide states facts from the source text. No advice, no "next steps", no interpretation of what it means for anyone, no "analysis" section.
- No comparison table unless the source text itself compares things.
- The last slide: a short factual closing line, then the consultation line exactly as given above. Nothing else — no «این پست را ذخیره کن», no comment prompts.
- The caption is a short news report in the brand's own voice: the fact first, then the details, each as a 🔹 point. No «این پست رو برای … بفرست», no financial tip unless the news is about money, no closing question. Only the consultation line may invite contact.
- Never refer to a "source", "report" or "document" — state the facts directly.`;

const FORMAT_REMINDER = `

FORMAT REMINDER (required): answer with the slides only, each starting on its own line with the marker exactly as ===SLIDE 1===, ===SLIDE 2===, … using Latin digits, then ===CAPTION=== followed by the caption. No other text, no markdown around the markers.`;

export async function writeSlides(topic, count, notes, sourceText, { returnRaw = false, previous = null } = {}) {
  const n = Math.max(MIN_SLIDES, Math.min(MAX_SLIDES, Number(count) || 7));
  let prompt = carouselPrompt(
    { ...topic, title: topic.title_fa || topic.title_en, slideCount: n, format: "carousel" },
    sourceText
  );
  // A revision: the model sees the version the editor reviewed, so the notes
  // change that version instead of producing an unrelated new one.
  if (previous && (previous.slides || []).length) {
    const prev = previous.slides.map((s) => `===SLIDE ${s.num}===\n${s.content}`).join("\n") + (previous.caption ? `\n===CAPTION===\n${previous.caption}` : "");
    prompt += `\n\nPREVIOUS VERSION of this carousel, which the editor reviewed. Revise it according to the editor's notes below; keep what the notes do not ask to change:\n${prev}`;
  }
  if (notes) {
    prompt += `\n\nEditor's notes for THIS carousel (follow them, as long as they do not require any fact that is not in the source text):\n${notes}`;
  }
  // The carousel prompt is written for advice posts ("what does this mean for
  // you?"). A news topic is reported, not sold: the hook is the fact itself.
  prompt += NEWS_RULES;
  // A second try with an explicit format reminder (the model occasionally
  // drifts from the markers), then once on the app's script model, which
  // also covers the Wizard's model declining a topic (it has refused
  // politically sensitive ones). Each try costs a cent or two.
  const tries = [
    () => generateText(prompt, 4000),
    () => generateText(prompt + FORMAT_REMINDER, 4000),
    () => openaiScript(BRAND_CONTEXT + "\n\n" + prompt + FORMAT_REMINDER),
  ];
  const raws = [];
  for (const attempt of tries) {
    let raw = "";
    try {
      raw = await attempt();
    } catch (e) {
      raws.push("[error] " + String(e?.message || e));
      continue;
    }
    raws.push(raw);
    const out = parseSlides(raw, n);
    if (out.slides.length >= MIN_SLIDES) return returnRaw ? { ...out, raw } : out;
  }
  const last = String(raws[raws.length - 1] || "").replace(/\s+/g, " ").trim();
  throw new Error(
    "the slide texts could not be written — the model answered: " + (last ? `"${last.slice(0, 220)}${last.length > 220 ? "…" : ""}"` : "(nothing)")
  );
}

// The brand's own published carousels, given to the image model as style
// references (public/brand/carousel-style), and the logo that is placed on
// every slide afterwards (public/brand/sugimoto-logo.png). The logo is
// composited, not drawn: an image model cannot be trusted to reproduce it.
const BRAND_DIR = path.join(process.cwd(), "public", "brand");
let refsCache = null;
async function styleRefs() {
  if (refsCache) return refsCache;
  try {
    const dir = path.join(BRAND_DIR, "carousel-style");
    const names = (await fs.readdir(dir)).filter((n) => /\.(jpe?g|png|webp)$/i.test(n)).sort().slice(0, 4);
    refsCache = await Promise.all(
      names.map(async (n) => toFile(await fs.readFile(path.join(dir, n)), n, { type: /png$/i.test(n) ? "image/png" : "image/jpeg" }))
    );
  } catch (_) {
    refsCache = [];
  }
  return refsCache;
}

function imagePrompt(slide, total, notes, withRefs) {
  const role =
    slide.num === 1
      ? "This is the COVER slide: a small cream pill label above a very large bold headline; a relevant realistic photo on one side."
      : slide.num === total
        ? "This is the LAST slide: a clear takeaway, with the call-to-action lines in their own rounded cards."
        : "This is a content slide: a short bold heading, then the points as rounded white info cards (one point per card, each with a circular pale-teal icon on the left), or a clean table if the text is tabular.";
  return `Design slide ${slide.num} of ${total} of an Instagram carousel (4:5 portrait) for Sugimoto Visa, a licensed Persian-language immigration consultancy for Canada and Europe.

TEXT TO RENDER — Persian (Farsi), right-to-left. Render it EXACTLY as given, every word spelled correctly with correct Persian letter joining; nothing added, removed or translated. Keep English words, numbers and emojis exactly as written. Long text may be laid out across several cards, but every word must appear:
"""
${slide.content}
"""

${role}
${withRefs ? "VISUAL STYLE: match the attached reference posts — they are this brand's own carousels. Use them for STYLE ONLY (layout language, colours, typography, cards, photo treatment); never copy their text, subjects, logos or university names.\n" : ""}Style: clean white background; deep teal (#0d4f4b) for headlines in a heavy, bold Persian display typeface; body text in dark grey; a soft cream (#f3e3c3) rounded pill label for small kickers; key values (numbers, dates, names) highlighted inside mint (#d6efe9) rounded pills; information in rounded white cards with a subtle shadow, each with a circular pale-teal icon; where it fits, a realistic, relevant photo on one side, framed by a large curved deep-teal swoosh shape. Generous spacing, strong hierarchy, the same look on every slide of the set. Small "${slide.num}/${total}" in a top corner. Photos may show generic people, never recognisable public figures; no government or university logos.
KEEP THE BOTTOM-CENTRE STRIP (the bottom 10% of the image) COMPLETELY EMPTY AND PLAIN — the company logo is placed there afterwards. Do not draw any logo, wordmark or brand name anywhere.
Do not add any words, numbers, dates or claims that are not in the text above.${notes ? `\n\nEditor's design notes: ${notes}` : ""}`;
}

// The logo on a white rounded plate, centred at the bottom.
async function addLogo(buffer) {
  try {
    const img = sharp(buffer);
    const { width, height } = await img.metadata();
    const logoW = Math.round(width * 0.3);
    const logo = await sharp(path.join(BRAND_DIR, "sugimoto-logo.png")).resize({ width: logoW }).png().toBuffer();
    const lm = await sharp(logo).metadata();
    const padX = Math.round(logoW * 0.08);
    const padY = Math.round(lm.height * 0.35);
    const plateW = lm.width + padX * 2;
    const plateH = lm.height + padY * 2;
    const plate = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${plateW}" height="${plateH}"><rect width="${plateW}" height="${plateH}" rx="${Math.round(plateH / 2)}" fill="#ffffff"/></svg>`
    );
    const left = Math.round((width - plateW) / 2);
    const top = height - plateH - Math.round(height * 0.025);
    return await img
      .composite([
        { input: plate, left, top },
        { input: logo, left: left + padX, top: top + padY },
      ])
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (e) {
    console.log("[carousel] logo not added:", String(e?.message || e).slice(0, 160));
    return buffer;
  }
}

async function drawSlide(slide, total, notes) {
  const refs = await styleRefs();
  const common = { model: IMAGE_MODEL, size: IMAGE_SIZE, quality: IMAGE_QUALITY, output_format: "jpeg", output_compression: 90, n: 1 };
  let res;
  if (refs.length) {
    try {
      res = await openai().images.edit({ ...common, image: refs, prompt: imagePrompt(slide, total, notes, true) });
    } catch (e) {
      // References are a nicety; a slide without them beats no slide.
      console.log("[carousel] reference edit failed, drawing without:", String(e?.message || e).slice(0, 160));
    }
  }
  if (!res) res = await openai().images.generate({ ...common, prompt: imagePrompt(slide, total, notes, false) });
  const b64 = res.data && res.data[0] && res.data[0].b64_json;
  if (!b64) throw new Error("the image model returned no image");
  return addLogo(Buffer.from(b64, "base64"));
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
