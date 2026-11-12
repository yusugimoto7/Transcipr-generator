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
import { drawStory, captureShots, applyCaseRef, quoteInSource, SHOT_VERSION, cleanPageManual, cleanBg, STORY_BACKGROUNDS } from "./story/index.js";
import { SAFE_TOP, SAFE_BOTTOM } from "./story/type.js";
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


// ── a design request for one page (Hamed, Nov 12 2026: "let me ask for the whole design to be done
// again", next to moving and sizing the parts by hand) ─────────────────────────────────────────────
// The designer on the page sends the layout it shows (`layout`: where each part is, its width and
// type size) with each part's measured height (`sizes`). A model reads the request and answers only
// in intents: the order of the parts, how much bigger or smaller each gets, the gap, the background.
// The new positions are worked out here by rule, stacked inside the area Instagram leaves free, so a
// request can never push a part off the page; the result is saved as the page's hand layout and can
// be moved by hand afterwards.
const PART_NAMES = ["headline", "shot", "body", "ref"];

function layoutFrom(layout, sizes, intent) {
  const have = PART_NAMES.filter((k) => layout[k] && sizes[k] && Number(sizes[k].h) > 0);
  const asked = (Array.isArray(intent.order) ? intent.order : []).filter((k) => have.includes(k));
  const byY = have.slice().sort((a, b) => layout[a].y - layout[b].y);
  const order = [...new Set([...asked, ...byY])];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const scaleOf = (k) => clamp(Number((intent.scale || {})[k]) || 1, 0.4, 2.5);
  // each part at its new size: type grows in both directions, a picture keeps its shape
  const parts = order.map((k) => {
    const cur = layout[k];
    const h0 = Number(sizes[k].h);
    if (k === "shot") {
      const w = clamp(Math.round(cur.w * scaleOf(k)), 240, 1000);
      return { k, w, h: (h0 * w) / cur.w, ratio: h0 / cur.w };
    }
    const font0 = cur.font || 40;
    const font = clamp(Math.round(font0 * scaleOf(k)), 18, 110);
    const w = clamp(cur.w, 300, 960);
    return { k, w, font, h: h0 * (font / font0) ** 2 * (cur.w / w), font0, h0, w0: cur.w };
  });
  let gap = clamp(Math.round(Number(intent.gap) || 40), 14, 120);
  const room = SAFE_BOTTOM - SAFE_TOP;
  const total = () => parts.reduce((s, p) => s + p.h, 0) + gap * (parts.length - 1);
  // too tall for the free area: the gap first, then everything a little at a time
  for (let i = 0; i < 60 && total() > room; i++) {
    if (gap > 18) {
      gap -= 4;
      continue;
    }
    for (const p of parts) {
      if (p.k === "shot") {
        p.w = Math.max(240, Math.round(p.w * 0.96));
        p.h = p.ratio * p.w;
      } else {
        p.font = Math.max(18, Math.round(p.font * 0.97));
        p.h = p.h0 * (p.font / p.font0) ** 2 * (p.w0 / p.w);
      }
    }
  }
  let y = SAFE_TOP + Math.max(0, (room - total()) / 2);
  const out = {};
  for (const p of parts) {
    out[p.k] = { x: Math.round((1080 - p.w) / 2), y: Math.round(y), w: p.w, ...(p.font ? { font: p.font } : {}) };
    y += p.h + gap;
  }
  return out;
}

export async function designStoryPage(topic, story, num, { request, layout, sizes } = {}) {
  const page = story.pages.find((p) => p.num === Number(num));
  if (!page) throw new Error("no such page");
  const ask = String(request || "").trim().slice(0, 800);
  const cur = cleanPageManual(layout);
  if (!ask) throw new Error("write what the design should be like");
  if (!cur || cur.blocks || !cur.shot || !sizes) throw new Error("the page's layout did not arrive; open the design again");
  const lines = PART_NAMES.filter((k) => cur[k] && sizes[k]).map((k) => `- ${k}${k === "shot" ? " (the screenshot of the source)" : k === "ref" ? " (the case / source line)" : ""}: top ${cur[k].y}, width ${cur[k].w}, height ${Math.round(sizes[k].h)}${cur[k].font ? `, type size ${cur[k].font}` : ""}`);
  const prompt = `You adjust the layout of ONE Instagram story page (1080 x 1920 px). Instagram's own buttons cover the top 260 px and the bottom 280 px, so the parts live between y 260 and y 1640, one under the other, centred.

THE PARTS NOW, top to bottom:
${lines.join("\n")}
Background now: ${story.bg || "purple"} (choices: ${Object.keys(STORY_BACKGROUNDS).join(", ")}, or a #rrggbb colour)

THE EDITOR'S REQUEST (Persian or English):
${ask}

Answer only with what should change:
- "order": the parts top to bottom, using the names above (keep the present order unless the request moves something).
- "scale": for each part a number; 1 keeps its size, 1.2 is a fifth bigger, 0.8 a fifth smaller. For the screenshot it scales the picture, for text the type size. Change only the parts the request speaks of; "bigger" with no amount is about 1.2-1.3, "much bigger" about 1.5.
- "gap": the space between parts in px (40 now; 20 tight, 70 airy).
- "bg": a background from the choices only if the request asks for another colour, else "".
- "not_done": one short Persian sentence naming anything in the request that cannot be done here (the words themselves are changed with the pencil button, fonts and frames are not changeable), else "".
The app fits everything into the free area by itself; do not shrink things to make room.

Return ONLY JSON: {"order":[],"scale":{"headline":1,"shot":1,"body":1,"ref":1},"gap":40,"bg":"","not_done":""}`;
  const raw = String(await askModel(prompt));
  const m = raw.replace(/```json/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
  let v = null;
  try {
    v = m ? JSON.parse(m[0].replace(/,\s*([\]}])/g, "$1")) : null;
  } catch (_) {}
  if (!v) throw new Error("the design request could not be read; try again in other words");
  const next = cleanPageManual(layoutFrom(cur, sizes, v));
  if (!next) throw new Error("the new layout could not be worked out");
  page.manual = next;
  if (v.bg && String(v.bg).trim()) {
    const bg = cleanBg(String(v.bg).trim());
    // another background is the whole story's: every page is drawn again in it
    if (bg && bg !== (story.bg || "purple")) {
      story.bg = bg;
      for (const p of story.pages) p.image_url = "";
    }
  }
  story.notice = String(v.not_done || "").trim().slice(0, 300);
  page.image_url = "";
  await drawStory(story);
  if (!page.image_url) throw new Error("the page could not be drawn: " + (page.error || "unknown error"));
  return story;
}
