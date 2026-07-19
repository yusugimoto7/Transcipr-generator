import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiScript } from "../../../lib/openai";
import { scriptPrompt } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { topic, lang } = await request.json();
    if (!topic || (lang !== "fa" && lang !== "en")) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    const prompt = scriptPrompt(topic, lang);

    let text = "";
    let provider = "anthropic";
    if (openaiEnabled()) {
      try {
        text = await openaiScript(prompt);
        provider = "openai";
      } catch (e) {
        // OpenAI failed — fall back to Claude if we can, else re-throw.
        if (!process.env.ANTHROPIC_API_KEY) throw e;
        text = await callClaude([{ role: "user", content: prompt }], false);
        provider = "anthropic (openai failed)";
      }
    } else {
      text = await callClaude([{ role: "user", content: prompt }], false);
    }

    return Response.json({ text, provider });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
