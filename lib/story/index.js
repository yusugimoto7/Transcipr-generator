// Instagram fact stories from a topic: 1 to 4 pages (1 by default), each a
// short Farsi fact over a real screenshot of the original source with the
// sentence that proves it highlighted. Lexbase items are photographed from
// the newsletter's own PDF; everything else from the source web page.
//
// Screenshots are taken only here, when someone asks for a story, and are
// kept with that story so a rewrite of the text reuses them.
//
// Grounding: every page names the exact source sentence it rests on, and a
// page whose sentence is not in the source text is rejected before anything
// is drawn. The screenshot is a photograph, never an image model's drawing.

import { TERM_RULE, stayOnQuestion } from "../prompts.js";
import { glossaryBlock } from "../glossary.js";
import { cleanText } from "../clean-text.js";
import { lessonsBlock } from "../learning.js";
import { englishBlock } from "../lang.js";
import { BRAND_CONTEXT } from "../brandContext.js";
import { openaiScript } from "../openai.js";
import { callClaude } from "../anthropic.js";
import { keepImage, sendCarousel, telegramTarget } from "../carousel.js";
import { tgCall } from "../telegram.js";
import { getLexbaseItems, findLexbaseItem, getLexbasePdfs } from "../newsletter/lexbase.js";
import { norm, locate } from "./match.js";
import { pdfQuoteShot } from "./pdfshot.js";
import { webQuoteShot } from "./webshot.js";
import { hctiImage, hctiEnabled } from "./hcti.js";
import { cleanTemplate, templatePageHtml } from "./templates.js";
export { STORY_TEMPLATES, cleanTemplate, templateMeta } from "./templates.js";

// Bumped when the way screenshots are cropped changes, so a rewrite takes
// new ones instead of reusing the old crops.
const SHOT_VERSION = 2;

export const MIN_PAGES = 1;
export const MAX_PAGES = 4;
export { hctiEnabled as storyEnabled };

export function isLexbase(topic) {
  return !!topic && (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || ""));
}

// ── writing ──────────────────────────────────────────────────────────────────

function storyPrompt(topic, n, sourceText, notes, previous) {
  const evergreen = topic.evergreen
    ? `This topic is an explainer, not news: the audience's question is «${topic.question || topic.title_fa}». The facts are the rules on the official page below.${stayOnQuestion(topic, "en")}`
    : "This topic is news: each page states what happened — the decision, the number, the date, who it covers.";
  const prev =
    previous && (previous.pages || []).length
      ? `\n\nPREVIOUS VERSION, which the editor reviewed. Revise it according to the notes; keep what the notes do not ask to change:\n${JSON.stringify({ pages: previous.pages.map(({ headline, body, quote, ref }) => ({ headline, body, quote, ref })), caption: previous.caption || "" })}`
      : "";
  return `${BRAND_CONTEXT}

Write an Instagram FACT STORY in Persian (Farsi) for @sugimotovisa. It must feel raw and natural, like a person typed it in the Instagram app over a screenshot, not like a designed post: ${n} page${n > 1 ? "s" : ""}, read in a few seconds each. Every page shows a real screenshot of the original source with one sentence highlighted, and above it a short Farsi fact that the highlighted sentence proves.

${evergreen}
TOPIC: ${topic.title_fa || topic.title_en || ""}

VOICE — the team's reference stories (a Persian immigration page posting screenshots of IRCC documents, court rulings and statistics) read like this:
  «یه سؤال جالب از اداره مهاجرت کانادا»
  «یه آمار تکان‌دهنده از تعداد دانشجویان بین‌المللی در کانادا که طی ۵ سال درس رو رها کردند و اعلام پناهندگی کردند: ۱۵۰۰ درصد افزایش»
  «دادگاه فدرال کانادا با درخواست مندیمس یک متقاضی اهل سریلانکا موافقت کرد و به اداره مهاجرت ۹۰ روز وقت داد تا جواب اپلیکیشن ایشون رو مشخص کنه!»
  «این متقاضی پرونده اسپانسرشیپ خودش رو در سال ۲۰۱۹ اقدام کرده بود و هنوز جوابش نیومده بود!»
  «اداره مهاجرت پرونده هر ۴۵ نفر رو دوباره باز کرد»
So: spoken, everyday Persian (میتونه، نشون میده، ایشون، اقدام کرده)، short lines, the striking number or decision up front, an exclamation mark where the fact is surprising. A Persian term may be followed by the English one people know it by (e.g. «اجازه کار بعد از تحصیل Post Graduation Work Permit»). Naming what the screenshot is — «این رأی»، «این ایمیل داخلی»، «این آمار رسمی» — is natural here.

For EACH page return:
- "headline": a short hook line in at most 12 Persian words, in that voice — the striking fact itself (number, decision, date) or a short opener that names it («یه آمار تکان‌دهنده: …»). Not a question to the reader.
- "body": at most 40 Persian words in the same voice adding what makes the fact clear (who, when, what exactly, the number). Plain statements.
- "ref": for a court decision, the case name exactly as the source text writes it (e.g. «Saravanabavanathan v. Canada (Citizenship and Immigration)»); otherwise "".
- "quote": ONE or TWO consecutive sentences copied CHARACTER FOR CHARACTER from the SOURCE TEXT below, in its original language (usually English), at most 280 characters, that prove this page's headline. Never translate, shorten inside, or paraphrase it — it is searched for in the original document and highlighted there.

Rules:
- Every fact comes from the source text and nothing else. No advice, no "what this means for you", no prediction.
- Pages tell one story in order: page 1 is the strongest single fact; later pages add the next most important facts. Use a DIFFERENT quote on each page.
- Never write «طبق منبع» or «بر اساس گزارش»; state facts in the brand's own voice. «این نشون میده …» only for what the source text itself states, never your own conclusion.
- No call to action, no «دایرکت», no «لینک در بیو», no «ذخیره کنید».
- Name people, courts and offices exactly as the source does, with their exact role.
${TERM_RULE}
Also return "caption": a 1-3 line Persian caption for the story post in the same voice (facts only).

Return ONLY JSON: {"pages":[{"headline":"","body":"","quote":"","ref":""}],"caption":""}${prev}${notes ? `\n\nEditor's notes for THIS story (follow them, as long as they need no fact outside the source text):\n${notes}` : ""}

===== SOURCE TEXT =====
${sourceText}
===== END =====`;
}

function parseStory(raw) {
  const t = String(raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const v = JSON.parse(m[0].replace(/,\s*([\]}])/g, "$1"));
    return v && Array.isArray(v.pages) ? v : null;
  } catch (_) {
    return null;
  }
}

// A quote counts when the source text has it, allowing for spacing and
// punctuation: all of it, or a run covering most of it.
export function quoteInSource(quote, sourceText) {
  const q = norm(quote);
  if (q.length < 25) return false;
  const hit = locate(norm(sourceText), quote);
  return !!hit && hit.end - hit.start >= Math.min(q.length, Math.max(40, q.length * 0.7));
}

async function askModel(prompt) {
  try {
    return await openaiScript(prompt, { maxOutputTokens: 6000 });
  } catch (e) {
    if (!process.env.ANTHROPIC_API_KEY) throw e;
    return callClaude([{ role: "user", content: prompt }], false, 4000);
  }
}

export async function writeStory(topic, count, notes, sourceText, previous = null, lang = "fa") {
  const n = Math.max(MIN_PAGES, Math.min(MAX_PAGES, Number(count) || 1));
  const prompt = storyPrompt(topic, n, sourceText, notes, previous) + (await lessonsBlock("story")) + (await glossaryBlock(lang === "en" ? "en" : "fa")) + (lang === "en" ? englishBlock("story") : "");
  let lastProblem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await askModel(attempt ? prompt + `\n\nYour previous answer was rejected: ${lastProblem}. Copy each quote exactly from the source text.` : prompt);
    const parsed = parseStory(raw);
    if (!parsed) {
      lastProblem = "it was not the JSON asked for";
      continue;
    }
    const pages = parsed.pages
      .slice(0, n)
      .map((p) => ({
        // Cleaned like every text; the quote never is, it must match the source character for character.
        headline: cleanText(String(p.headline || "").trim(), { lang }).slice(0, 140),
        body: cleanText(String(p.body || "").trim(), { lang }).slice(0, 400),
        quote: String(p.quote || "").replace(/\s+/g, " ").trim().slice(0, 400),
        // A case name is shown only when the source text carries it.
        ref: (() => {
          const r = String(p.ref || "").replace(/\s+/g, " ").trim().slice(0, 140);
          return r && norm(sourceText).includes(norm(r)) ? r : "";
        })(),
      }))
      .filter((p) => p.headline);
    const bad = pages.filter((p) => !quoteInSource(p.quote, sourceText));
    if (pages.length && !bad.length) {
      return { pages: pages.map((p, i) => ({ num: i + 1, ...p })), caption: cleanText(String(parsed.caption || "").trim(), { lang }) };
    }
    lastProblem = pages.length ? `${bad.length} quote(s) are not in the source text: ${bad.map((p) => `"${p.quote.slice(0, 80)}"`).join(", ")}` : "no pages";
  }
  throw new Error("the story could not be grounded: " + lastProblem);
}

// ── screenshots ──────────────────────────────────────────────────────────────

function sourceLabel(topic) {
  if (isLexbase(topic)) {
    const it = findLexbaseItem(topic);
    const issue = (it && it.issue) || topic.issue || "";
    const cite = (it && it.citation) || topic.citation || "";
    return ["Lexbase", issue, cite].filter(Boolean).join(" · ");
  }
  let host = "";
  try {
    host = new URL(topic.source_url).hostname.replace(/^www\./, "");
  } catch (_) {}
  const date = String(topic.published || "").slice(0, 10);
  return [host || topic.source_name || "", date].filter(Boolean).join(" · ");
}

function slug(topic) {
  const base = String(topic.title_en || "topic").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `sugimoto-story-${base || "topic"}-${Date.now().toString(36)}`;
}

// Fills shot_url on every page that has none (a reused quote keeps its
// shot). Throws when no page could be shot.
export async function captureShots(topic, story, previousPages = []) {
  const name = slug(topic);
  for (const p of story.pages) {
    // Only shots cropped the current way are reused.
    const old = previousPages.find((x) => x.shot_url && x.shot_v === SHOT_VERSION && norm(x.quote) === norm(p.quote));
    if (old && !p.shot_url) {
      p.shot_url = old.shot_url;
      p.shot_v = SHOT_VERSION;
    }
  }
  const todo = story.pages.filter((p) => !p.shot_url);
  if (isLexbase(topic)) {
    await getLexbaseItems({ waitMs: 8000 }).catch(() => {});
    const it = findLexbaseItem(topic);
    const issue = (it && it.issue) || topic.issue;
    if (!issue) throw new Error("this Lexbase item is not loaded; open the Lexbase tab and try again");
    const pdfs = await getLexbasePdfs(issue);
    for (const p of todo) {
      try {
        const shot = await pdfQuoteShot(pdfs, p.quote);
        if (!shot) throw new Error("the sentence was not found in the PDF");
        p.shot_url = (await keepImage(shot.jpeg, `${name}-shot-${p.num}`)).url;
        p.shot_v = SHOT_VERSION;
        p.shot_error = "";
      } catch (e) {
        p.shot_error = String(e?.message || e).slice(0, 200);
      }
    }
    story.masthead_url = "";
  } else {
    if (!topic.source_url) throw new Error("this topic has no source page to photograph");
    for (const p of todo) {
      try {
        const shot = await webQuoteShot(topic.source_url, p.quote);
        p.shot_url = shot.quote;
        p.shot_v = SHOT_VERSION;
        p.shot_error = "";
      } catch (e) {
        p.shot_error = String(e?.message || e).slice(0, 200);
      }
    }
    story.masthead_url = "";
  }
  // A page whose own sentence could not be photographed shows another page's
  // screenshot rather than none: it is still the real source.
  const any = story.pages.find((p) => p.shot_url);
  if (!any) throw new Error("no screenshot could be taken: " + (story.pages[0].shot_error || "unknown error"));
  for (const p of story.pages) if (!p.shot_url) p.shot_url = any.shot_url;
  story.source_label = story.source_label || sourceLabel(topic);
  return story;
}

// ── drawing ──────────────────────────────────────────────────────────────────

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const faDigits = (s) => String(s).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);

// Raw stories, made the way a person makes one in the Instagram app: one
// flat colour, the headline in the app's bold text, the screenshot pasted in,
// and the explanation in the app's white text boxes laid over the bottom of
// the screenshot. No logo, no frames, no decoration. The app's own font is not
// public; Vazirmatn ExtraBold is the closest to its bold Persian, Inter to
// its Latin. Instagram covers the top and bottom ~250px with its controls,
// so the content stays between them.
export { STORY_BACKGROUNDS, storyColours, cleanBg } from "./colours.js";

// Lalezar and Markazi Text are used by some templates.
export const STORY_FONTS = "Vazirmatn|Inter|Lalezar|Markazi Text";

export const STORY_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1920px;font-family:'Inter','Vazirmatn',sans-serif}
.s{width:1080px;height:1920px;overflow:hidden;background:var(--bg);display:flex;flex-direction:column;justify-content:center;align-items:center;padding:260px 70px 280px;direction:rtl;text-align:center}
h1{font-weight:800;line-height:1.45;font-size:var(--h,60px);color:var(--text);text-shadow:0 1px 3px rgba(0,0,0,.25);max-width:940px}
.shots{display:flex;flex-direction:column;gap:12px;width:940px;margin-top:44px}
.shots img{display:block;width:100%;height:auto;border-radius:18px;object-fit:contain;background:#fff;border:2px solid var(--edge)}
.shots img.mast{max-height:230px;object-fit:cover;object-position:top}
.shots img.shot{max-height:820px}
.body{margin-top:44px;font-weight:800;font-size:var(--b,50px);line-height:1.5;max-width:940px}
.body span{background:var(--box);color:var(--boxText);padding:12px 26px;border-radius:16px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.ref{margin-top:34px;direction:ltr;color:var(--text);font-family:'Inter',sans-serif;font-weight:700;font-size:30px;opacity:.9;max-width:940px}
`;

// A page laid out by hand on the topic page (app/StoryDesigner.jsx): where the headline, the
// screenshot, the body and the source line go, in story pixels. The screenshot keeps its own
// proportions at the width it was given.
export function cleanPageManual(m) {
  if (!m || typeof m !== "object") return null;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const part = (p, withFont) =>
    p && typeof p === "object" ? { x: num(p.x, -1080, 2160), y: num(p.y, -1920, 3840), w: num(p.w, 80, 2160), ...(withFont ? { font: num(p.font, 16, 120) } : {}) } : null;
  const out = { headline: part(m.headline, true), shot: part(m.shot, false), body: part(m.body, true), ref: part(m.ref, true) };
  return Object.values(out).some(Boolean) ? out : null;
}

const MANUAL_CSS = `
.s.m{display:block;padding:0;position:relative}
.s.m>*{position:absolute;margin:0;max-width:none}
.s.m .shots{gap:0}
.s.m .shots img.shot{max-height:none}
`;

export function storyPageHtml(page, total, story) {
  const c = storyColours(story.bg);
  // An English story reads left to right with Latin digits.
  const en = story.lang === "en";
  const digits = en ? (s) => String(s) : faDigits;
  const dir = en ? ";direction:ltr" : "";
  const m = cleanPageManual(page.manual);
  if (m) {
    const at = (p, font) => (p ? `left:${p.x}px;top:${p.y}px;width:${p.w}px;${font && p.font ? `font-size:${p.font}px;` : ""}` : "display:none;");
    return `<style>${MANUAL_CSS}</style><div class="s m" style="--bg:${c.bg}${dir};--text:${c.text};--box:${c.box};--boxText:${c.boxText};--edge:${c.edge || "transparent"}">
  <h1 style="${at(m.headline, true)}">${esc(digits(page.headline))}</h1>
  <div class="shots" style="${at(m.shot)}"><img class="shot" src="${esc(page.shot_url)}"></div>
  ${page.body ? `<div class="body" style="${at(m.body, true)}"><span>${esc(digits(page.body))}</span></div>` : ""}
  ${page.ref ? `<div class="ref" style="${at(m.ref, true)}">${esc(page.ref)}</div>` : ""}
</div>`;
  }
  // A trending template chosen for this story (lib/story/templates.js);
  // "simple", the team's own style, is drawn below.
  const tpl = cleanTemplate(story.template);
  if (tpl !== "simple") {
    const html = templatePageHtml(tpl, page, total, story);
    if (html) return html;
  }
  const h = page.headline.length > 70 ? 52 : page.headline.length > 45 ? 58 : 64;
  const b = page.body.length > 170 ? 42 : page.body.length > 110 ? 46 : 50;
  // No site header on any story (the team: a news site's logo and buttons
  // above the fact look weird), stories saved with one included.
  const mast = "";
  return `<div class="s" style="--bg:${c.bg}${dir};--text:${c.text};--box:${c.box};--boxText:${c.boxText};--edge:${c.edge || "transparent"};--h:${h}px;--b:${b}px">
  <h1>${esc(digits(page.headline))}</h1>
  <div class="shots">${mast}<img class="shot" src="${esc(page.shot_url)}"></div>
  ${page.body ? `<div class="body"><span>${esc(digits(page.body))}</span></div>` : ""}
  ${page.ref ? `<div class="ref">${esc(page.ref)}</div>` : ""}
</div>`;
}

// Draws every page without an image (all of them after a rewrite).
export async function drawStory(story, onPage = () => {}) {
  const total = story.pages.length;
  await Promise.all(
    story.pages.map(async (p) => {
      if (p.image_url) return;
      try {
        p.image_url = await hctiImage({
          html: storyPageHtml(p, total, story),
          css: STORY_CSS,
          google_fonts: STORY_FONTS,
          viewport_width: 1080,
          viewport_height: 1920,
          device_scale: 1,
          ms_delay: 500,
        });
        p.error = "";
      } catch (e) {
        p.error = String(e?.message || e).slice(0, 200);
      }
      onPage(p);
    })
  );
  if (!story.pages.some((p) => p.image_url)) throw new Error("no page could be drawn: " + story.pages[0].error);
  return story;
}

// Telegram: one photo, or an album for 2-4 pages (an album needs two).
export async function sendStory(story, target) {
  const pages = story.pages.filter((p) => p.image_url);
  if (!pages.length) throw new Error("this story has no images yet");
  if (pages.length > 1) return sendCarousel({ slides: pages, caption: story.caption }, target);
  const chat = telegramTarget(target);
  if (!chat) throw new Error(target === "public" ? "No public channel is configured" : "No review chat is configured");
  const caption = String(story.caption || "").slice(0, 1000);
  const r = await tgCall("sendPhoto", { chat_id: chat, photo: pages[0].image_url, ...(caption ? { caption: esc(caption), parse_mode: "HTML" } : {}) });
  if (!r.ok) throw new Error("Telegram: " + (r.description || "send failed"));
  return { chat, messages: 1 };
}
