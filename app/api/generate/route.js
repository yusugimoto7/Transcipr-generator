import { NextResponse } from "next/server";
import { generateText } from "../../../lib/wizardOpenai.js";
import {
  carouselPrompt,    parseCarousel,
  infographicPrompt, parseInfographic,
  reelPrompt,        parseReel,
  articlePrompt,     parseArticle,
  telegramPrompt,    parseTelegramPost,
} from "../../../lib/wizardPrompts.js";

export const runtime = "nodejs";

const FORMATS = {
  carousel:    { prompt: carouselPrompt,    parse: parseCarousel,     tokens: 4000 },
  infographic: { prompt: infographicPrompt, parse: parseInfographic,  tokens: 2000 },
  reel:        { prompt: reelPrompt,        parse: parseReel,         tokens: 2000 },
  article:     { prompt: articlePrompt,     parse: parseArticle,      tokens: 3000 },
  telegram:    { prompt: telegramPrompt,    parse: parseTelegramPost, tokens: 1500 },
};

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { topic, sourceText } = body || {};
  if (!topic?.format) {
    return NextResponse.json({ error: "topic.format is required" }, { status: 400 });
  }

  const handler = FORMATS[topic.format];
  if (!handler) {
    return NextResponse.json(
      { error: `Unknown format: ${topic.format}. Valid: ${Object.keys(FORMATS).join(", ")}` },
      { status: 400 }
    );
  }

  const prompt = handler.prompt(topic, sourceText || "");

  console.log("[generate] topic:", JSON.stringify({ title: topic.title, country: topic.country, format: topic.format }));
  console.log("[generate] prompt length:", prompt.length);

  let raw;
  try {
    raw = await generateText(prompt, handler.tokens);
    console.log("[generate] raw output:", raw?.slice(0, 200));
  } catch (err) {
    console.error("[generate] error:", err.message, err.status, err.code);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const parsed = handler.parse(raw);
  return NextResponse.json({ raw, parsed, format: topic.format });
}
