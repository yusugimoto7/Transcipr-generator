import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiScript } from "../../../lib/openai";
import { scriptPrompt } from "../../../lib/prompts";
import { fetchArticleText } from "../../../lib/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { topic, lang } = await request.json();
    if (!topic || (lang !== "fa" && lang !== "en")) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    // Ground the script in the REAL article text so it's about the actual news,
    // not an invented topic. Falls back to the stored snippet if the fetch
    // fails (cached, so the parallel fa+en calls don't double-fetch).
    let sourceText = "";
    if (topic.source_url) {
      sourceText = await fetchArticleText(topic.source_url).catch(() => "");
    }
    if (!sourceText && topic.snippet) sourceText = String(topic.snippet);

    const prompt = scriptPrompt(topic, lang, sourceText);

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
