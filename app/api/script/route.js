import { callClaude } from "../../../lib/anthropic";
import { openaiEnabled, openaiScript } from "../../../lib/openai";
import { hookOptions } from "../../../lib/hooks";
import { cleanText } from "../../../lib/clean-text";
import { scriptPrompt, englishScriptRewritePrompt, persianShare } from "../../../lib/prompts";
import { sourceTextFor } from "../../../lib/grounding";
import { editorNoteBlock } from "../../../lib/custom-news";
import { lessonsBlock } from "../../../lib/learning";
import { glossaryBlock } from "../../../lib/glossary";

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

// The team's note on a written script (the note box under it): the same script prompt, so every
// rule on format, voice and length still holds, with the current script and the note after it.
// The note changes the wording, order, emphasis or length; facts still come only from the source.
function revisePrompt(topic, lang, sourceText, script, note) {
  const fa = lang === "fa";
  return `${scriptPrompt(topic, lang, sourceText)}

===== REVISION =====
${fa ? "این اسکریپت قبلاً نوشته شده. تیم یک یادداشت روی آن گذاشته. اسکریپت را طبق یادداشت بازنویسی کن و هرچه یادداشت نخواسته، همان‌طور که هست نگه دار." : "This script was already written and the team left a note on it. Rewrite the script as the note asks, and keep everything the note does not ask to change."}
${fa ? "⛔️ یادداشت منبع فکت نیست: هر عدد، تاریخ، نام برنامه و قانون فقط از متن منبع بالا. اگر یادداشت چیزی می‌خواهد که در منبع نیست، آن را اضافه نکن." : "⛔️ The note is not a source of facts: every number, date, programme name and rule still comes only from the source text above. If the note asks for something the source does not hold, leave it out."}

${fa ? "اسکریپت فعلی:" : "CURRENT SCRIPT:"}
${String(script || "").slice(0, 6000)}

${fa ? "یادداشت تیم:" : "THE TEAM'S NOTE:"}
${String(note || "").slice(0, 1500)}

${fa ? "فقط متن اسکریپت بازنویسی‌شده را بنویس، بدون توضیح." : "Write only the rewritten script, with no explanation."}`;
}

//   POST { topic, lang: "fa" | "en" }                      -> first draft
//   POST { topic, lang: "en", rewrite: { script, seconds?, notes? } }
//        -> the English script rewritten into English and/or to a duration
//   POST { topic, lang, revise: { script, note } }         -> the script rewritten by the team's note
export async function POST(request) {
  try {
    const { topic, lang, rewrite, revise } = await request.json();
    if (!topic || (lang !== "fa" && lang !== "en") || (rewrite && lang !== "en") || (revise && !(revise.script && revise.note))) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }

    // Ground the script in the REAL article text so it's about the actual news,
    // not an invented topic. Falls back to the stored snippet if the fetch
    // fails (cached, so the parallel fa+en calls don't double-fetch).
    const sourceText = await sourceTextFor(topic, { maxChars: 6000 });

    // The glossary goes last, after the lessons: one Persian name per term in every script.
    const glossary = await glossaryBlock(lang === "en" ? "en" : "fa");
    const prompt = (revise
      ? revisePrompt(topic, lang, sourceText, revise.script, revise.note) + editorNoteBlock(topic, lang) + (await lessonsBlock("script", lang))
      : rewrite
      ? englishScriptRewritePrompt(topic, rewrite.script, sourceText, {
          seconds: Math.max(0, Math.min(600, Number(rewrite.seconds) || 0)),
          notes: String(rewrite.notes || "").slice(0, 1500),
        })
      : scriptPrompt(topic, lang, sourceText) + editorNoteBlock(topic, lang) + (await lessonsBlock("script", lang))) + glossary;

    let { text, provider } = await write(prompt);

    // One corrective pass: translate the Farsi draft into English, grounded on
    // the same source, rather than show Farsi under "English script".
    if (lang === "en" && notEnglish(text)) {
      const again = await write(englishScriptRewritePrompt(topic, text, sourceText) + glossary);
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
