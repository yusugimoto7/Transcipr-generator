// Changing one page of a fact story from the pencil under it, without
// touching the others. A story page is the source's own screenshot plus
// typed text (lib/story), so an image model never edits it: the screenshot
// stays the photograph it is, and only the page's words change, either typed
// by the editor or rewritten from the source text by the instruction, before
// that page alone is drawn again.

import { openaiScript } from "./openai.js";
import { callClaude } from "./anthropic.js";
import { sourceTextFor } from "./grounding.js";
import { FARSI_TERMS } from "./prompts.js";
import { drawStory } from "./story/index.js";

function rewritePrompt(topic, page, instruction, sourceText) {
  return `You edit ONE page of an Instagram fact story in Persian (Farsi) for @sugimotovisa, a Persian immigration page. The page shows a real screenshot of the source with this sentence highlighted (it stays as it is):
"${page.quote}"

TOPIC: ${topic.title_fa || topic.title_en || ""}

CURRENT PAGE:
headline: ${page.headline}
body: ${page.body || ""}

THE TEAM'S REQUEST FOR THIS PAGE:
${instruction}

Rewrite the headline and body as asked, in the same spoken, everyday Persian voice; keep what the request does not ask to change.
- headline: at most 12 Persian words, the striking fact itself. Not a question to the reader.
- body: at most 40 Persian words.
- Every fact comes from the source text below and nothing else; if the request asks for a fact the source does not state, leave it out. No advice, no call to action, never «طبق منبع».
${FARSI_TERMS}
Return ONLY JSON: {"headline":"","body":""}

===== SOURCE TEXT =====
${sourceText}
===== END =====`;
}

async function askModel(prompt) {
  try {
    return await openaiScript(prompt, { maxOutputTokens: 2000 });
  } catch (e) {
    if (!process.env.ANTHROPIC_API_KEY) throw e;
    return callClaude([{ role: "user", content: prompt }], false, 1200);
  }
}

// `edit`: { headline?, body?, instruction? }. Typed text wins; an
// instruction has the model rewrite the page from the source text.
export async function editStoryPage(topic, story, num, edit = {}) {
  const page = story.pages.find((p) => p.num === Number(num));
  if (!page) throw new Error("no such page");
  const instruction = String(edit.instruction || "").trim().slice(0, 1200);
  let headline = String(edit.headline ?? page.headline).trim().slice(0, 140);
  let body = String(edit.body ?? page.body ?? "").trim().slice(0, 400);
  if (instruction) {
    const sourceText = await sourceTextFor(topic);
    if (!sourceText || sourceText.length < 60) throw new Error("no source text to rewrite the page from");
    const raw = String(await askModel(rewritePrompt(topic, { ...page, headline, body }, instruction, sourceText)));
    const m = raw.replace(/```json/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
    let v = null;
    try {
      v = m ? JSON.parse(m[0].replace(/,\s*([\]}])/g, "$1")) : null;
    } catch (_) {}
    if (!v || !String(v.headline || "").trim()) throw new Error("the page could not be rewritten; try again");
    headline = String(v.headline).trim().slice(0, 140);
    body = String(v.body || "").trim().slice(0, 400);
  }
  if (!headline) throw new Error("the page needs a headline");
  page.headline = headline;
  page.body = body;
  if (instruction) page.edits = [...(page.edits || []), instruction.slice(0, 300)].slice(-5);
  // Only this page has no picture now, so only it is drawn again.
  const keep = story.pages.map((p) => p.image_url);
  page.image_url = "";
  try {
    await drawStory(story);
  } catch (e) {
    story.pages.forEach((p, i) => p !== page && (p.image_url = keep[i]));
    throw e;
  }
  if (!page.image_url) throw new Error("the page could not be drawn: " + (page.error || "unknown error"));
  return story;
}
