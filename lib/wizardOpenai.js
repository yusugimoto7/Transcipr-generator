// Plain OpenAI chat-completion client for the Content Wizard (Path B). This
// file was named lib/anthropic.js in content-wizard even though it only ever
// called OpenAI — renamed here to avoid confusion with topic-engine's real
// lib/anthropic.js (Claude) and lib/openai.js (the swipe-deck's own OpenAI
// wrapper, with its own env-overridable per-job models). This one is
// intentionally separate and simple: the wizard always uses gpt-4o directly,
// matching lib/research.js's web-search model.
import OpenAI from "openai";

const MODEL = "gpt-4o";

let client = null;
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on the server.");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

const SYSTEM_MESSAGE =
  "You are a professional content writer for Sugimoto Visa (@sugimotovisa), a licensed immigration consulting firm. " +
  "Your task is to create educational social media content (Instagram carousels, reels, articles, Telegram posts) " +
  "that helps Persian-speaking audiences understand official immigration pathways to Canada and Europe. " +
  "All content is factual, grounded in official government sources, and intended to inform — not facilitate any unlawful activity. " +
  "Follow the brand guidelines and output format exactly as specified in the user message.";

export async function generateText(prompt, maxTokens = 3000) {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: SYSTEM_MESSAGE },
      { role: "user", content: prompt },
    ],
  });
  return (response.choices[0]?.message?.content || "").trim();
}
