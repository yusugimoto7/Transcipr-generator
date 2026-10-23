// The picture in a story template that has one (Hamed, Oct 23 2026: "where a
// template uses a photo, the AI makes it from the news, and we can change
// it"). It is an illustration of the subject only: the proof stays the
// source's own screenshot on the same page, so the picture must never look
// like evidence — no text, no documents, no numbers, no flags or seals.
// The team's picture rules (no hijab, people at most in the background) and
// what the app has learned about pictures apply here as on carousels.

import OpenAI from "openai";
import { keepImage } from "../carousel.js";
import { lessonsBlock } from "../learning.js";

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const QUALITY = process.env.STORY_PHOTO_QUALITY || "medium";
const SIZES = { portrait: "1024x1536", landscape: "1536x1024", square: "1024x1024" };

let client = null;
function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set, so no picture can be made");
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

const LOOKS = {
  photo: "a realistic, editorial-quality photograph",
  bw: "a realistic black-and-white documentary photograph with strong contrast",
  illustration: "a simple, friendly flat vector illustration with a few bold shapes, on a plain white background",
};

function photoPrompt(topic, page, shape, look, note) {
  return `Make ${LOOKS[look] || LOOKS.photo} to illustrate an Instagram story about Canadian / European immigration news. ${shape === "landscape" ? "Wide landscape framing." : shape === "square" ? "Square framing, subject centred." : "Tall portrait framing."}

What the story is about (for the subject of the picture only; do not write any of it in the picture):
Topic: ${topic.title_en || topic.title_fa || ""}
Headline: ${page.headline}
${page.body ? `Detail: ${page.body}` : ""}

Choose ONE clear visual idea that fits the subject: a place (an airport, a Canadian or European city or landmark, a campus, a courthouse exterior, a border crossing, an office), objects (a suitcase, a passport closed on a table, keys, a calendar, a laptop with a blank screen), or a mood. Cinematic light, uncluttered, room around the subject.

STRICT RULES:
- NO text, letters, numbers, signs, captions, logos, watermarks, flags, coats of arms or official seals anywhere in the picture.
- NO documents, forms, letters, ID cards or screens with content: the story's real proof is shown separately, and this picture must never look like evidence.
- People: avoid them; at most a generic person seen from behind or far away, never the subject. NEVER anyone wearing a hijab, headscarf or any head covering. Never a recognisable real person or public figure.
- Nothing that states a fact (no charts, no amounts, no dates).${note ? `\n\nThe team's note for this picture: ${note}` : ""}`;
}

// Makes a picture for one page and keeps it (WordPress media, else memory).
// Returns its URL.
export async function makeStoryPhoto(topic, page, { shape = "portrait", look = "photo", note = "", name = "sugimoto-story-photo" } = {}) {
  const prompt = photoPrompt(topic, page, shape, look, String(note || "").slice(0, 600)) + (await lessonsBlock("design").catch(() => ""));
  const res = await openai().images.generate({
    model: IMAGE_MODEL,
    prompt,
    size: SIZES[shape] || SIZES.portrait,
    quality: QUALITY,
    output_format: "jpeg",
    output_compression: 88,
    n: 1,
  });
  const b64 = res.data && res.data[0] && res.data[0].b64_json;
  if (!b64) throw new Error("the image model returned no picture");
  return (await keepImage(Buffer.from(b64, "base64"), `${name}-${Date.now().toString(36)}`)).url;
}

// Pictures for every page of a story in a template that has one, a few at a
// time; pages that already have a picture keep it. A failed picture leaves
// the page without one (the template then shows its plain colour there).
export async function fillStoryPhotos(topic, story, meta, onPage = () => {}) {
  if (!meta || !meta.photo) return story;
  const todo = story.pages.filter((p) => !p.photo_url);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const p = todo[next++];
      try {
        p.photo_url = await makeStoryPhoto(topic, p, { shape: meta.photo, look: meta.look });
        p.photo_error = "";
      } catch (e) {
        p.photo_error = String(e?.message || e).slice(0, 200);
      }
      onPage(p);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  return story;
}
