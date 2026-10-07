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

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

// Fetch the actual article text from a URL with a hard 5-second timeout.
// Returns null on any failure so callers can fall back silently.
async function fetchSourceText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SugimotoBot/1.0)" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return stripHtml(html) || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { topic, sourceText: rawSourceText } = body || {};
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

  // Auto-fetch source text from the first research fact URL so generation is
  // grounded in real article text rather than just the fact summaries or model
  // memory. Falls back to the fact list as plain text when the fetch fails.
  let sourceText = rawSourceText || "";
  if (!sourceText.trim()) {
    const facts = Array.isArray(topic.researchedFacts) ? topic.researchedFacts : [];
    const firstUrl = facts[0]?.source_url;
    if (firstUrl) {
      const fetched = await fetchSourceText(firstUrl);
      if (fetched) {
        sourceText = fetched;
      } else if (facts.length) {
        sourceText = facts.map((f) => `- ${f.fact} (${f.source_url}, ${f.date})`).join("\n");
      }
    }
  }

  let raw;
  try {
    const prompt = handler.prompt(topic, sourceText);
    raw = await generateText(prompt, handler.tokens);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  const parsed = handler.parse(raw);
  return NextResponse.json({ raw, parsed, format: topic.format });
}
