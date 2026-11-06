// The topic page's assistant (Hamed, Nov 6 2026: "a live chatbot I can talk to, tell it what the
// problem is, and it changes the writing at once the way I need"). One turn: the conversation so far,
// the topic's source text and everything already written for it go to the writing model, which
// answers in the person's language and, when asked to change something, returns the whole new text of
// each part it changed. The page then saves each change through the step that part already has
// (script_fix with exact text, telegram_save, carousel "draw", article "save"), so the panels, the
// redraw of only the changed slides and the "earlier version" all work as for a change made by hand.
//
// Grounding stays non-negotiable: the model is told the source text is the only place facts come
// from, and to say so when asked for something it does not hold.
import { getEntry, keyOf } from "./workspace.js";
import { sourceTextFor } from "./grounding.js";
import { glossaryBlock } from "./glossary.js";
import { openaiAssistant } from "./openai.js";
import { cleanText, cleanHtml } from "./clean-text.js";

const MAX_TURNS = 16;
const PART_KEYS = ["script_fa", "script_en", "telegram_fa", "telegram_en", "carousel_fa", "carousel_en", "article_fa", "article_en"];

const strip = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function current(m) {
  const out = {};
  const s = m.script || {};
  if (s.script_fa) out.script_fa = s.script_fa;
  if (s.script_en) out.script_en = s.script_en;
  for (const [k, l] of [["telegram", "fa"], ["telegram_en", "en"]]) if (m[k] && m[k].text) out["telegram_" + l] = m[k].text;
  for (const [k, l] of [["carousel", "fa"], ["carousel_en", "en"]]) {
    const c = m[k];
    if (c && (c.slides || []).length) out["carousel_" + l] = { slides: c.slides.map((x) => ({ num: x.num, text: x.content })), caption: c.caption || "", template: c.template || 1 };
  }
  for (const [k, l] of [["article", "fa"], ["article_en", "en"]]) {
    const a = m[k] && m[k].article;
    if (a && (a.title_fa || a.content_html)) out["article_" + l] = { title_fa: a.title_fa || "", meta_description: a.meta_description || "", excerpt: a.excerpt || "", content_html: a.content_html || "" };
  }
  for (const [k, l] of [["story", "fa"], ["story_en", "en"]]) {
    const st = m[k];
    if (st && (st.pages || []).length) out["story_" + l + " (read only)"] = st.pages.map((p) => [p.headline, p.body].filter(Boolean).join(" — "));
  }
  return out;
}

function prompt({ topic, source, parts, glossary, lang }) {
  return `You are the writing assistant inside Sugimoto Visa's Topic Engine, the content tool of a licensed Persian-language immigration consultancy for Canada and Europe (Instagram @sugimotovisa). The person talking to you is Hamed or someone on his team. They look at one topic and what was written from it, and ask you to change the writing, or ask questions about it. Act like a skilled editor who changes things at once.

HOW TO ANSWER: a JSON object, nothing else:
{"reply": "...", "changes": { ... }}
- "reply": your answer to the person, in the language they wrote in (Persian if they wrote Persian), short and plain: what you changed and why, or the answer to their question. No markdown headings.
- "changes": only the parts you changed, each with its WHOLE new version (never a fragment, never a diff). Leave it {} when you only answer. Keys and shapes:
  "script_fa" / "script_en": the full video script text.
  "telegram_fa" / "telegram_en": the full Telegram post text (**bold** allowed).
  "carousel_fa" / "carousel_en": {"slides": [{"title": "...", "body": "..."}, ...], "caption": "..."}; 1 to 10 slides in order; the first is the cover, the last the closing slide; keep a slide's words unchanged where the person did not ask to change it (an unchanged slide keeps its picture); "template" (1-9) only when they ask for another template.
  "article_fa" / "article_en": {"title_fa": "...", "meta_description": "...", "excerpt": "...", "content_html": "..."}; keep the HTML structure (h2/h3/p/ul/a) and the links.
- Change only what was asked. A part that does not exist yet cannot be changed: say it has to be made first from its tile on the topic page. Stories cannot be changed here: say so.

RULES THAT NEVER BEND:
- Every fact (numbers, dates, programme names, conditions) comes from the SOURCE TEXT below. Never add a fact it does not hold, even when asked; say plainly what the source does not say.
- The brand's own voice: never "according to the source", no sales lines and no "DM us" in news posts; the scripts keep their closing comment word.
- No em or en dashes. Keep the Persian half-space where it belongs.
- Content language of the page right now: ${lang === "en" ? "English" : "Persian"} (when the person does not name a language, change that one).
${glossary}

TOPIC: ${topic.title_fa || ""}${topic.title_en ? " / " + topic.title_en : ""}
Field: ${topic.field || ""} · Date: ${topic.date || ""} · Why now: ${topic.why_now || ""}

SOURCE TEXT (the only source of facts):
"""
${source || "(no source text could be read for this topic)"}
"""

WHAT IS WRITTEN NOW (JSON):
${JSON.stringify(parts, null, 1)}`;
}

function cleanChanges(raw, have) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of PART_KEYS) {
    const v = raw[k];
    if (v == null || !(k in have)) continue;
    const lang = k.endsWith("_en") ? "en" : "fa";
    if (k.startsWith("script_") || k.startsWith("telegram_")) {
      const t = cleanText(String(v || ""), { lang }).trim();
      if (t) out[k] = t.slice(0, k.startsWith("telegram_") ? 3800 : 12000);
    } else if (k.startsWith("carousel_")) {
      const slides = (Array.isArray(v.slides) ? v.slides : [])
        .map((x) => ({ title: cleanText(String((x && x.title) || ""), { lang }).trim().slice(0, 200), body: cleanText(String((x && x.body) || ""), { lang }).trim().slice(0, 1500) }))
        .filter((x) => x.title || x.body)
        .slice(0, 10);
      if (slides.length) out[k] = { slides, caption: cleanText(String(v.caption ?? have[k].caption ?? ""), { lang }).slice(0, 4000), template: Number(v.template) >= 1 && Number(v.template) <= 9 ? Number(v.template) : have[k].template };
    } else if (k.startsWith("article_")) {
      const a = {};
      for (const f of ["title_fa", "meta_description", "excerpt"]) if (typeof v[f] === "string" && v[f].trim()) a[f] = cleanText(v[f], { lang }).trim();
      if (typeof v.content_html === "string" && strip(v.content_html).length > 40) a.content_html = cleanHtml(v.content_html, { lang });
      if (Object.keys(a).length) out[k] = a;
    }
  }
  return out;
}

export async function assistantTurn({ topic, messages, lang = "fa" }) {
  const convo = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && String(m.text || "").trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: String(m.text).slice(0, 6000) }));
  if (!convo.length || convo[convo.length - 1].role !== "user") throw new Error("write a message first");
  const entry = await getEntry(keyOf(topic)).catch(() => null);
  const m = (entry && entry.materials) || {};
  const parts = current(m);
  const source = await sourceTextFor(topic, { maxChars: 14000 }).catch(() => "");
  const system = prompt({ topic, source, parts, glossary: await glossaryBlock(lang === "en" ? "en" : "fa").catch(() => ""), lang });
  const out = await openaiAssistant(system, convo);
  const reply = String((out && out.reply) || "").trim() || (lang === "en" ? "Done." : "انجام شد.");
  const changes = cleanChanges(out && out.changes, parts);
  // what the page needs to save each change with its own step
  const links = { fa: (m.telegram && m.telegram.link) || "", en: (m.telegram_en && m.telegram_en.link) || "" };
  return { reply: cleanText(reply, { lang }), changes, links, at: Date.now() };
}
