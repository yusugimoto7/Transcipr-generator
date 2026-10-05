import OpenAI from "openai";

// Letter review is the one job in this app where a wrong answer can cost
// someone their PR application, so it defaults to the flagship tier. A review
// is a few thousand tokens in and out — cents per letter.
const LETTER_MODEL = process.env.OPENAI_LETTER_MODEL || "gpt-5.6-sol";
// Transcription of an uploaded PDF or photo is mechanical.
const EXTRACT_MODEL = process.env.OPENAI_EXTRACT_MODEL || "gpt-5.6-terra";

let client = null;
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on the server.");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

export function llmReady() {
  return !!process.env.OPENAI_API_KEY;
}

// Generous ceiling: reasoning models spend part of it before the visible
// answer, and a truncated JSON object is unusable.
export async function letterJson(prompt) {
  const resp = await getClient().responses.create({
    model: LETTER_MODEL,
    input: prompt,
    text: { format: { type: "json_object" } },
    max_output_tokens: 24000,
  });
  return parseJson(resp.output_text || "");
}

export async function transcribe(file) {
  const part = file.type === "application/pdf"
    ? { type: "input_file", filename: file.name || "letter.pdf", file_data: file.dataUrl }
    : { type: "input_image", image_url: file.dataUrl };
  const resp = await getClient().responses.create({
    model: EXTRACT_MODEL,
    input: [{
      role: "user",
      content: [
        part,
        {
          type: "input_text",
          text:
            "Transcribe this employment letter exactly as written, top to bottom, including the letterhead, " +
            "addresses, phone numbers, emails, dates, signature block, and any stamp or seal text. " +
            "Do not correct, summarize, translate or add anything. Where a signature or stamp appears " +
            "as an image, write [signature] or [stamp: <legible text>]. Output only the transcription.",
        },
      ],
    }],
    max_output_tokens: 8000,
  });
  return (resp.output_text || "").trim();
}

function parseJson(raw) {
  const s = raw.trim();
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1));
    throw new Error("Model did not return JSON.");
  }
}
