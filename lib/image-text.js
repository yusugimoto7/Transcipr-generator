// Text from pictures the editor uploads (screenshots of a news page, an IRCC
// letter, a post). A vision model transcribes what is written in each image,
// word for word; that transcription is the only source a card made from the
// images may use, exactly like a fetched article. Nothing is inferred from
// what a picture merely shows.

import OpenAI from "openai";

const VISION_MODEL = process.env.OPENAI_VISION_MODEL || process.env.OPENAI_SCRIPT_MODEL || "gpt-5.6-terra";
export const MAX_IMAGES = 5;
const MAX_BYTES = 4 * 1024 * 1024; // per image, after the page has shrunk it

let client = null;
function openai() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Accepts data URLs only (the page sends the files themselves, never links
// for the server to fetch).
export function cleanImages(list) {
  const out = [];
  for (const im of Array.isArray(list) ? list : []) {
    const url = String((im && im.data) || im || "");
    const m = url.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) continue;
    if (Math.floor((m[2].length * 3) / 4) > MAX_BYTES) continue;
    out.push({ data: url, name: String((im && im.name) || `image-${out.length + 1}`).slice(0, 80) });
    if (out.length >= MAX_IMAGES) break;
  }
  return out;
}

const PROMPT = `Transcribe the text in each image below, for a newsroom that may only use what is written.

Rules:
- Copy every readable word exactly as written, in its original language (English, Persian, French…). Keep numbers, dates, names, amounts and headings exactly.
- Keep the reading order. Turn tables into lines like "column: value | column: value".
- If a word is unreadable write [unreadable]. Do not guess, summarise, translate or add anything.
- If an image has no readable text, write: (no text)
- Do not describe people, logos or design; only the text.

Answer with one block per image, in order:
=== IMAGE 1 ===
(text)
=== IMAGE 2 ===
(text)`;

// Returns [{ name, text }] in the order given.
export async function transcribeImages(images) {
  if (!images.length) return [];
  const content = [{ type: "input_text", text: PROMPT }];
  for (const im of images) content.push({ type: "input_image", image_url: im.data, detail: "high" });
  const resp = await openai().responses.create({
    model: VISION_MODEL,
    input: [{ role: "user", content }],
    max_output_tokens: 12000,
  });
  const raw = String(resp.output_text || "");
  const parts = raw.split(/^\s*=+\s*IMAGE\s+(\d+)\s*=+\s*$/im);
  const byNum = {};
  for (let i = 1; i < parts.length; i += 2) byNum[Number(parts[i])] = String(parts[i + 1] || "").trim();
  return images.map((im, i) => {
    const t = byNum[i + 1] != null ? byNum[i + 1] : images.length === 1 ? raw.trim() : "";
    return { name: im.name, text: /^\(no text\)$/i.test(t) ? "" : t };
  });
}
