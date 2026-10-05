import { NextResponse } from "next/server";
import { transcribe, llmReady } from "../../../../lib/noc/llm.js";

export const runtime = "nodejs";
export const maxDuration = 120;

const TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

// Turns an uploaded PDF or photo of a letter into text. The text goes back to
// the browser for the user to check before anything is analysed: a misread
// date or salary here would silently poison every later step.
export async function POST(req) {
  if (!llmReady()) return NextResponse.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 503 });
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { name, type, dataUrl } = body || {};
  if (!TYPES.includes(type) || typeof dataUrl !== "string" || !dataUrl.startsWith(`data:${type};base64,`)) {
    return NextResponse.json({ error: "Upload a PDF, PNG, JPEG or WebP file." }, { status: 400 });
  }
  if ((dataUrl.length * 3) / 4 > MAX_BYTES) {
    return NextResponse.json({ error: "File is larger than 10 MB." }, { status: 413 });
  }
  try {
    const text = await transcribe({ name, type, dataUrl });
    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
