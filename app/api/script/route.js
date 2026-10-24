import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiScript } from "../../../lib/openai";
import { hookOptions } from "../../../lib/hooks";
import { cleanText } from "../../../lib/clean-text";
import { scriptPrompt, englishScriptRewritePrompt, persianShare } from "../../../lib/prompts";
import { sourceTextFor } from "../../../lib/grounding";
import { editorNoteBlock } from "../../../lib/custom-news";
import { lessonsBlock } from "../../../lib/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function write(prompt) {
  if (openaiEnabled()) {
    try {
      return { text: await openaiScript(prompt), provider: "openai" };
    } catch (e) {
      // OpenAI failed — fall back to Claude if we can, else re-throw.
      if (!process.env.ANTHROPIC_API_KEY) throw e;
      return { text: await callClaude([{ role: "user", content: prompt }], false), provider: "anthropic (openai failed)" };
    }
  }
  return { text: await callClaude([{ role: "user", content: prompt }], false), provider: "anthropic" };
}

// An "English" script that is mostly Persian letters came back in the wrong
// language (the source, the title and the audience are all Persian, and the
// model sometimes follows them).
const notEnglish = (text) => persianShare(text) > 0.2;

//   POST { topic, lang: "fa" | "en" }                      -> first draft
//   POST { topic, lang: "en", rewrite: { script, seconds?, notes? } }
//        -> the English script rewritten into English and/or to a duration
export async function POST(request) {
  try {
    const { topic, lang, rewrite } = await request.json();
    if (!topic || (lang !== "fa" && lang !== "en") || (rewrite && lang !== "en")) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    // Ground the script in the REAL article text so it's about the actual news,
    // not an invented topic. Falls back to the stored snippet if the fetch
    // fails (cached, so the parallel fa+en calls don't double-fetch).
    const sourceText = await sourceTextFor(topic, { maxChars: 4500 });

    const prompt = rewrite
      ? englishScriptRewritePrompt(topic, rewrite.script, sourceText, {
          seconds: Math.max(0, Math.min(600, Number(rewrite.seconds) || 0)),
          notes: String(rewrite.notes || "").slice(0, 1500),
        })
      : scriptPrompt(topic, lang, sourceText) + editorNoteBlock(topic, lang) + (await lessonsBlock("script", lang));

    let { text, provider } = await write(prompt);

    // One corrective pass: translate the Farsi draft into English, grounded on
    // the same source, rather than show Farsi under "English script".
    if (lang === "en" && notEnglish(text)) {
      const again = await write(englishScriptRewritePrompt(topic, text, sourceText));
      if (again.text && !notEnglish(again.text)) ({ text, provider } = again);
      else throw new Error("the English script came back in Persian twice; try again");
    }

    const clean = cleanText(text, { lang });
    // Three other opening lines to choose from (lib/hooks.js); a failure there never costs the script.
    const hooks = rewrite ? [] : await hookOptions(topic, clean, lang, sourceText).catch(() => []);
    return Response.json({ text: clean, provider, hooks });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
