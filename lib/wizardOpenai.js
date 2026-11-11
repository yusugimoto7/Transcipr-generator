// Plain OpenAI chat-completion client for the Content Wizard (Path B). This
// file was named lib/anthropic.js in content-wizard even though it only ever
// called OpenAI — renamed here to avoid confusion with topic-engine's real
// lib/anthropic.js (Claude) and lib/openai.js (the swipe-deck's own OpenAI
// wrapper, with its own env-overridable per-job models). This one is
// intentionally separate and simple. It ran on gpt-4o, hard-coded, until Nov 11 2026 (Hamed: "carousels
// come from a different AI with different concepts"): it now runs on the app's script model, so the
// Wizard, the carousel and the scripts are written by the same model.
import OpenAI from "openai";
import { BRAND_CONTEXT } from "./brandContext.js";

const MODEL = process.env.OPENAI_WIZARD_MODEL || process.env.OPENAI_SCRIPT_MODEL || "gpt-6.1-sol";

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
  "Follow the brand guidelines and output format exactly as specified in the user message.\n\n" +
  BRAND_CONTEXT;

export async function generateText(prompt, maxTokens = 3000) {
  const openai = getClient();
  // the Responses API, as everywhere else in the app; a reasoning model spends part of the budget
  // before it answers, so the ceiling has room above the visible text
  const response = await openai.responses.create({
    model: MODEL,
    instructions: SYSTEM_MESSAGE,
    input: prompt,
    max_output_tokens: Math.max(8000, maxTokens * 4),
  });
  return (response.output_text || "").trim();
}
