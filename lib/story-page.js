// Changing one page of a fact story from the pencil under it, without
// touching the others. A story page is the source's own screenshot plus
// typed text (lib/story), so an image model never edits it: the screenshot
// stays the photograph it is, and only the page's words change, either typed
// by the editor or rewritten from the source text by the instruction, before
// that page alone is drawn again.

import { openaiScript } from "./openai.js";
import { cleanText } from "./clean-text.js";
import { callClaude } from "./anthropic.js";
import { sourceTextFor } from "./grounding.js";
import { TERM_RULE } from "./prompts.js";
import { glossaryBlock } from "./glossary.js";
import { drawStory, captureShots, applyCaseRef, quoteInSource, SHOT_VERSION } from "./story/index.js";
import { tenseRule } from "./today.js";
import { englishBlock } from "./lang.js";

function rewritePrompt(topic, page, instruction, sourceText, typed = {}) {
  const kept = [typed.headline ? "headline" : "", typed.body ? "body" : ""].filter(Boolean);
  return `You edit ONE page of an Instagram fact story in Persian (Farsi) for @sugimotovisa, a Persian immigration page. The page shows a real screenshot of the source with this sentence highlighted (it stays as it is):
"${page.quote}"

TOPIC: ${topic.title_fa || topic.title_en || ""}

CURRENT PAGE:
headline: ${page.headline}
body: ${page.body || ""}

THE TEAM'S REQUEST FOR THIS PAGE:
${instruction}

First decide what the request is about:
- the page's WORDS (headline, body): rewrite them as asked, in the same spoken, everyday Persian voice; keep what the request does not ask to change.
- the SCREENSHOT (what part of the source it shows, which sentences are highlighted): the screenshot is always a photograph of the one item the story is about, cut by the app; you only choose the highlighted sentences. Set "screenshot": true, and when the request asks for other sentences to be highlighted, return them in "quote" / "also", copied CHARACTER FOR CHARACTER from the source text (else leave them "" and []).
- the case citation, the design, colours, sizes or anything else that is not words or highlights: do not touch the words; say in "not_done", in one short Persian sentence, what cannot be changed from this box (the case line with its citation is added by the app on every court story by itself).
A request can be about several of these. Words the request does not ask to change come back EXACTLY as they are.${kept.length ? `\nThe editor typed the ${kept.join(" and ")} above by hand just now: return ${kept.length > 1 ? "them" : "it"} EXACTLY as typed, whatever the request says.` : ""}
- headline: the striking fact itself, not a question to the reader; no longer than it is now unless asked.
- body: no longer than it is now unless asked.
- Every fact comes from the source text below and nothing else; if the request asks for a fact the source does not state, leave it out. No advice, no call to action, never «طبق منبع».
${TERM_RULE}${tenseRule("en")}
Return ONLY JSON: {"headline":"","body":"","screenshot":false,"quote":"","also":[],"not_done":""}

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
  let headline = String(edit.headline ?? page.headline).trim().slice(0, 1600);
  let body = String(edit.body ?? page.body ?? "").trim().slice(0, 2600);
  // What the editor typed is kept word for word (Hamed, Nov 12 2026: he typed a headline, wrote a
  // request about the screenshot under it, and got a different headline back).
  const typed = { headline: edit.headline !== undefined && headline !== String(page.headline || "").trim(), body: edit.body !== undefined && body !== String(page.body || "").trim() };
  const typedText = { headline, body };
  let retake = false;
  story.notice = "";
  if (instruction) {
    const sourceText = await sourceTextFor(topic);
    if (!sourceText || sourceText.length < 60) throw new Error("no source text to rewrite the page from");
    const raw = String(await askModel(rewritePrompt(topic, { ...page, headline, body }, instruction, sourceText) + (await glossaryBlock(story.lang === "en" ? "en" : "fa")) + (story.lang === "en" ? englishBlock("story") : "")));
    const m = raw.replace(/```json/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
    let v = null;
    try {
      v = m ? JSON.parse(m[0].replace(/,\s*([\]}])/g, "$1")) : null;
    } catch (_) {}
    if (!v || !String(v.headline || "").trim()) throw new Error("the page could not be rewritten; try again");
    headline = typed.headline ? typedText.headline : cleanText(String(v.headline).trim(), { lang: story.lang }).slice(0, 1600);
    body = typed.body ? typedText.body : cleanText(String(v.body || "").trim(), { lang: story.lang }).slice(0, 2600);
    // other sentences to highlight, only ones the source really has
    const quote = String(v.quote || "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (quote && quoteInSource(quote, sourceText)) {
      page.quote = quote;
      page.also = (Array.isArray(v.also) ? v.also : []).map((x) => String(x || "").replace(/\s+/g, " ").trim().slice(0, 400)).filter((x) => x && x !== quote && quoteInSource(x, sourceText)).slice(0, 2);
      retake = true;
    }
    if (v.screenshot) retake = true;
    story.notice = String(v.not_done || "").trim().slice(0, 300);
    applyCaseRef(topic, story, sourceText);
  }
  // a court story made before the case line existed gets it on its next edit
  if (!instruction) applyCaseRef(topic, story, "");
  // The screenshot is taken again when the request was about it, and whenever it was cut the old way
  // (a newsletter page's shot now stays inside the one item the story is about).
  if (retake || (page.shot_url && page.shot_v !== SHOT_VERSION)) {
    const was = { url: page.shot_url, v: page.shot_v };
    page.shot_url = "";
    try {
      await captureShots(story.source_url ? { ...topic, source_url: story.source_url } : topic, { ...story, pages: [page] }, []);
    } catch (_) {}
    if (!page.shot_url) {
      page.shot_url = was.url;
      page.shot_v = was.v;
      if (retake) story.notice = [story.notice, story.lang === "en" ? "The screenshot could not be taken again; the earlier one was kept." : "اسکرین‌شات دوباره گرفته نشد؛ همون قبلی موند."].filter(Boolean).join(" ");
    }
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
