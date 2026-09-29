import { NextResponse } from "next/server";
import { researchTopic } from "../../../lib/research.js";
import { generateText } from "../../../lib/wizardOpenai.js";
import { BRAND_CONTEXT } from "../../../lib/brandContext.js";

export const runtime = "nodejs";

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { country, field, language } = body || {};
  if (!country) {
    return NextResponse.json({ error: "country is required" }, { status: 400 });
  }

  // Run research first so topic suggestions are grounded in current facts,
  // not model memory. A broad seed topic is used to discover what's current.
  const seedTopic = { country, title: field || "immigration news", language };
  const facts = await researchTopic(seedTopic);

  const factsBlock = facts.length
    ? facts.map((f) => `- ${f.fact} (${f.source_url}, ${f.date})`).join("\n")
    : "(no verified facts found — suggest based on general knowledge of this country's immigration landscape)";

  const langNote = language === "english"
    ? "Write all titles and summaries in English."
    : "Write all titles and summaries in Persian (Farsi).";

  const prompt = `${BRAND_CONTEXT}

You are a content strategist for @sugimotovisa. Based on the verified facts below, suggest 5 specific, audience-relevant Instagram carousel topics for the immigration brand.

Country: ${country}
Category: ${field || "general immigration"}
${langNote}

Verified facts from official sources:
${factsBlock}

For each topic:
- Title: specific, curiosity-driving (NOT "5 golden tips" style)
- Summary: 1-2 sentences explaining what angle to take and why it matters to the audience
- Stick to what the facts above actually support — no invented claims

Return JSON only:
{ "topics": [ { "title": "...", "summary": "..." }, ... ] }`;

  let raw;
  try {
    raw = await generateText(prompt, 1500);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }

  // Parse defensively — model may wrap JSON in code fences
  let topics = [];
  try {
    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed?.topics)) {
      topics = parsed.topics.map((t) => ({ ...t, researchedFacts: facts }));
    }
  } catch {
    // Return raw text as a single fallback so the UI doesn't break entirely
    topics = [{ title: raw.slice(0, 100), summary: raw, researchedFacts: facts }];
  }

  return NextResponse.json({ topics });
}
