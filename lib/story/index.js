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
import { STORY_SAMPLES_FA } from "../sugimoto-voice.js";
import { briefBlock } from "../brief.js";
import { openaiScript } from "../openai.js";
import { callClaude } from "../anthropic.js";
import { keepImage, sendCarousel, telegramTarget } from "../carousel.js";
import { tgCall } from "../telegram.js";
import { getLexbaseItems, findLexbaseItem, getLexbasePdfs, citationOf } from "../newsletter/lexbase.js";
import { norm, locate } from "./match.js";
import { pdfQuoteShot } from "./pdfshot.js";
import { webQuoteShot, webArticleShot, socialPostShot, xPostCard } from "./webshot.js";
import { postPhotoShot } from "./post-photo.js";
import { socialNetwork } from "../social-post.js";
import { getSupplement } from "../supplement.js";
import { xPostText } from "../video-file.js";
import { hctiImage, hctiEnabled } from "./hcti.js";
import { cleanTemplate, templatePageHtml, cleanBlocks, blockCss } from "./templates.js";
export { STORY_TEMPLATES, cleanTemplate, templateMeta } from "./templates.js";

// Bumped when the way screenshots are cropped changes, so a rewrite takes
// new ones instead of reusing the old crops.
export const SHOT_VERSION = 4; // 3: the article from its headline / the page's full width, every key sentence marked (Nov 11 2026); 4: a newsletter item's shot stays inside that item (Nov 12 2026)

// The tallest screenshot a story page has room for, as height over width (.shots img.shot in css.js).
const SHOT_RATIO = 0.95;

export const MIN_PAGES = 1;
export const MAX_PAGES = 4;
export { hctiEnabled as storyEnabled };

export function isLexbase(topic) {
  return !!topic && (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || ""));
}

// ── writing ──────────────────────────────────────────────────────────────────

// One text in two parts, the way Hamed writes his own stories (Nov 25 2026: «در استوری‌ها حالت تایتل و
// متن رو نداشته باشیم. یک متن در دو قسمت داشته باشیم», and "reach Hamed's own story writing style"):
// the first part above the screenshot, the second under it, no headline. His real stories are the
// model (STORY_SAMPLES_FA). With a script written for the topic the story tells the script's point
// with its facts; without one it is built on the brief (lib/brief.js). The two parts are kept on the
// page as `headline` (top) and `body` (bottom), the names every saved story already uses.
function storyPrompt(topic, n, sourceText, notes, previous, { script = "", brief = null, lang = "fa" } = {}) {
  const evergreen = topic.evergreen
    ? `This topic is an explainer, not news: the audience's question is «${topic.question || topic.title_fa}». The facts are the rules on the official page below.${stayOnQuestion(topic, "en")}`
    : "This topic is news or a document: the story says what it holds, the figure, the decision, the answer, the date, who it covers.";
  const prev =
    previous && (previous.pages || []).length
      ? `\n\nPREVIOUS VERSION, which the editor reviewed. Revise it according to the notes; keep what the notes do not ask to change:\n${JSON.stringify({ pages: previous.pages.map(({ headline, body, quote, ref }) => ({ top: headline, bottom: body, quote, ref })), caption: previous.caption || "" })}`
      : "";
  const master = String(script || "").trim()
    ? `\n\nTHE SCRIPT ALREADY WRITTEN FOR THIS TOPIC (the team's master text). The story tells the same point with the same facts and keeps the script's own wording wherever it fits; it never takes another angle and never contradicts it. It is far shorter than the script: page 1 is what the script opens with, the main point, and only what a story holds follows.\n"""\n${String(script).trim().slice(0, 5000)}\n"""`
    : "";
  return `${BRAND_CONTEXT}

Write an Instagram FACT STORY in Persian (Farsi) for @sugimotovisa, the way Hamed Sugimoto writes his own. He pastes a screenshot of the original document on the story and types ONE short text around it, in two parts: the first part above the screenshot, the second under it. There is no headline and no title: both parts are the same running text in the same voice, and the second carries on from the first. ${n} page${n > 1 ? "s" : ""}, each read in a few seconds.

${evergreen}
TOPIC: ${topic.title_fa || topic.title_en || ""}

HAMED'S OWN STORIES (real ones; ⬛ is where the screenshot sits). Write like these:
${STORY_SAMPLES_FA.map((x, i) => `${i + 1}. ${x}`).join("\n")}

What makes them his:
- Part 1 says what this is and gives THE MAIN FACT at once: the figure (as «از … به …» when the source has both ends), the decision, or the question. It often names the document in a few words first: «یه آمار تکان‌دهنده از …»، «یک ایمیل داخلی خیلی جذاب …»، «یه سؤال جالب از اداره مهاجرت کانادا»، «مکاتبات داخلی اداره مهاجرت کانادا نشون میده …»، «دادگاه فدرال کانادا …».
- Part 2 says what it shows or what follows: the next figure, the answer («پاسخ: …»), the consequence («این نشون میده …»، «یعنی اینکه …»). It may end on what is still not known («… مشخص نیست!») or on an honest open question.
- Spoken, everyday Persian (میتونه، نشون میده، ایشون، اقدام کرده), short lines, «!» where the fact is surprising. A Persian term may be followed once by the English one people know it by.
- A note on how to read a figure («این تعداد درخواست‌هاست، نه تعداد افراد») is one short sentence of part 2 at most. A story is never a list of what a document does not cover, and never opens with such a note.

For EACH page return:
- "top": part 1, at most 40 Persian words.
- "bottom": part 2, at most 45 Persian words. It carries on from part 1 and never repeats it.
- "ref": for a court decision, the case name exactly as the source text writes it (e.g. «Saravanabavanathan v. Canada (Citizenship and Immigration)»); otherwise "".
- "quote": ONE or TWO consecutive sentences copied CHARACTER FOR CHARACTER from the SOURCE TEXT below, in its original language (usually English), at most 280 characters, that prove this page's main fact. Never translate, shorten inside, or paraphrase it: it is searched for in the original document and highlighted there. When the fact stands in a table or figure of the source (a block marked "TABLE OR FIGURE"), copy the row that holds it exactly as it stands in that block.
- "also": the screenshot shows the document itself, not only the quote, so up to TWO other sentences from the same part of the source that a reader should notice (another figure, the date it applies from, who it covers), copied CHARACTER FOR CHARACTER the same way; they are highlighted too. [] when nothing else near the quote matters.

Rules:
- Every fact comes from the source text and nothing else. «این نشون میده …» / «یعنی …» only for what the source itself says or what its figures plainly show (from 8 to 14.7 million is "almost double"); never a consequence of your own, no advice, no prediction.
- Page 1 carries the main point of the piece. Later pages carry on with the next most important figures or facts, the way his second story above does. Use a DIFFERENT quote on each page.
- Never write «طبق منبع» or «بر اساس گزارش»; state facts in the brand's own voice.
- No call to action anywhere on a story, pages or caption: no "comment the word", no "write below", no "we send you the link", no DM, bio link, «ذخیره کنید» or consultation line, unless the editor's notes below ask for one in so many words.
- Name people, courts and offices exactly as the source does, with their exact role.
${TERM_RULE}
Also return "caption": a 1-3 line Persian caption for the story post in the same voice (facts only).

Return ONLY JSON: {"pages":[{"top":"","bottom":"","quote":"","also":[],"ref":""}],"caption":""}${prev}${notes ? `\n\nEditor's notes for THIS story (follow them, as long as they need no fact outside the source text):\n${notes}` : ""}${master}${master ? "" : briefBlock(brief, lang === "en" ? "en" : "fa")}

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

// ── the script as the story (Hamed, Nov 11 2026: "the script is very good but the story's text is
// unrelated; I want exactly the script") ─────────────────────────────────────────────────────────
export async function writeStory(topic, count, notes, sourceText, previous = null, lang = "fa", { script = "", brief = null } = {}) {
  const n = Math.max(MIN_PAGES, Math.min(MAX_PAGES, Number(count) || 1));
  const prompt = storyPrompt(topic, n, sourceText, notes, previous, { script, brief, lang }) + (await lessonsBlock("story")) + (await glossaryBlock(lang === "en" ? "en" : "fa")) + (lang === "en" ? englishBlock("story") : "");
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
        // The page's one text in its two parts: `headline` is the part above the screenshot, `body` the
        // part under it. Cleaned like every text; the quote never is, it must match the source exactly.
        headline: cleanText(String(p.top ?? p.headline ?? "").trim(), { lang }).slice(0, 420),
        body: cleanText(String(p.bottom ?? p.body ?? "").trim(), { lang }).slice(0, 480),
        quote: String(p.quote || "").replace(/\s+/g, " ").trim().slice(0, 400),
        // the other sentences worth marking: only ones the source really has, never the quote again
        also: (Array.isArray(p.also) ? p.also : [])
          .map((x) => String(x || "").replace(/\s+/g, " ").trim().slice(0, 400))
          .filter((x) => x && norm(x) !== norm(p.quote) && quoteInSource(x, sourceText))
          .slice(0, 2),
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

// ── the case line ────────────────────────────────────────────────────────────
// A court story names its case the way it is cited (Hamed, Nov 12 2026: "in all case laws, bring the
// court number, like Name v. Immigration, 2026 FC 12345"). The name and the neutral citation are read
// from the source by rule: Lexbase prints the applicant in capitals before the file number
// ("KULDEEP KAUR IMM-19440-25 2026 FC 1216"); an IMM file is an immigration matter against the
// Minister. A news report's case name comes from the writer (checked against the source) and gets the
// citation only when the source text holds exactly one.
export function caseRef(topic, sourceText, given = "") {
  const it = isLexbase(topic) ? findLexbaseItem(topic) : null;
  const text = String((it && it.text) || "");
  const all = [...new Set((String(sourceText || "").match(/\b20\d\d\s+(?:FC|FCA|SCC)\s+\d{1,5}\b/g) || []).map((c) => c.replace(/\s+/g, " ")))];
  const citation = (it && it.citation) || citationOf(topic && topic.citation) || citationOf(text) || (!it && all.length === 1 ? all[0] : "");
  const ref = String(given || "").trim();
  if (!citation) return ref;
  if (ref.replace(/\s+/g, " ").includes(citation)) return ref;
  // the applicant's name stands in capitals right before the file number, after the item's own heading
  // when it has one (the item's text starts at its heading since Nov 25 2026)
  const m = text.slice(0, 700).match(/(?:^|[\s.:–—-])([A-Z][A-Z .,'’\-]{2,80}?)\s+((?:IMM|T|A|DES)-\d+-\d+)/);
  if (m) {
    const name = m[1].trim().toLowerCase().replace(/(^|[\s\-'’])([a-z])/g, (x, a, b) => a + b.toUpperCase());
    const safety = /public safety/i.test(text);
    return /^IMM/.test(m[2]) ? `${name} v. Canada (${safety ? "Public Safety" : "Immigration"}), ${citation}` : `${name}, ${citation}`;
  }
  return ref ? `${ref}, ${citation}` : citation;
}

// Every page of a court story carries the case line.
export function applyCaseRef(topic, story, sourceText) {
  const court = (topic && (topic.kind === "court" || topic.field === "Court" || topic.citation)) || (story.pages || []).some((p) => p.ref);
  if (!court) return story;
  const given = ((story.pages || []).find((p) => p.ref) || {}).ref || "";
  const line = caseRef(topic, sourceText, given);
  if (line) for (const p of story.pages || []) p.ref = line;
  return story;
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

// Which pages carry a screenshot (Hamed, Nov 19 2026: «در درست کردن استوری ها به من این آپشن رو بده که
// انتخاب کنم در کدوم صفحه اسکرین شات بذاری و یا نذاری… گاهی اسکرین شات اساسا نذارم»): chosen in the story
// form and per page afterwards, kept on the story as `shots` (page numbers; [] = none). A story saved
// before has none set and keeps the earlier rule, the first page only (Nov 18 2026).
export function shotPages(story) {
  const n = ((story && story.pages) || []).length;
  return cleanShots(story && story.shots, n);
}
export function cleanShots(v, count) {
  if (!Array.isArray(v)) return count > 0 ? [1] : [];
  return [...new Set(v.map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= Math.max(1, count || MAX_PAGES)))].sort((a, b) => a - b);
}

// Fills shot_url on the pages chosen for a screenshot that have none (a reused quote keeps its
// shot); `only` limits it to those page numbers. Throws when pages were chosen and none could be shot.
export async function captureShots(topic, story, previousPages = [], { only = null } = {}) {
  const name = slug(topic);
  const want = shotPages(story);
  for (const p of story.pages) {
    if (!want.includes(p.num)) continue;
    // Only shots cropped the current way are reused.
    const marks = (x) => [x.quote, ...(x.also || [])].map(norm).join("|");
    const old = previousPages.find((x) => x.shot_url && x.shot_v === SHOT_VERSION && marks(x) === marks(p));
    if (old && !p.shot_url) {
      p.shot_url = old.shot_url;
      p.shot_key = old.shot_key || "";
      p.shot_v = SHOT_VERSION;
    }
  }
  // the pages not chosen are text only: no screenshot and no picture
  for (const p of story.pages) {
    if (want.includes(p.num)) continue;
    p.shot_url = "";
    p.shot_key = "";
    p.photo_url = "";
    p.shot_error = "";
  }
  story.source_label = story.source_label || sourceLabel(topic);
  if (!want.length) return story;
  const todo = story.pages.filter((p) => want.includes(p.num) && (!only || only.includes(p.num)) && !p.shot_url);
  if (isLexbase(topic)) {
    await getLexbaseItems({ waitMs: 8000 }).catch(() => {});
    const it = findLexbaseItem(topic);
    const issue = (it && it.issue) || topic.issue;
    if (!issue) throw new Error("this Lexbase item is not loaded; open the Lexbase tab and try again");
    const pdfs = await getLexbasePdfs(issue);
    for (const p of todo) {
      try {
        // only the item the story is about: a page of the issue holds several court decisions
        const item = it ? { title: it.title, text: it.text } : null;
        let shot = p.quote ? await pdfQuoteShot(pdfs, p.quote, { also: p.also || [], ratio: SHOT_RATIO, item }) : null;
        // A sentence read from a picture on the page (a table pasted as an image, lib/newsletter/figures.js)
        // is not in the PDF's own text: the item is photographed from its heading down, unmarked, which
        // shows that table (Nov 25 2026). Still the real page, never a drawing.
        if (!shot && it && it.text) shot = await pdfQuoteShot(pdfs, String(it.text).slice(0, 170), { ratio: SHOT_RATIO, item, plain: true });
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
    // The topic's link: its source, the post it came from, or a link typed in as its title.
    const titled = ([topic.title_en, topic.title_fa].map((t) => String(t || "").match(/https?:\/\/[^\s<>"']+/)).find(Boolean) || [])[0] || "";
    const source = topic.source_url || titled;
    const post = [source, topic.post_url].find((u) => u && socialNetwork(u)) || "";
    if (!source && !post) throw new Error("this topic has no source page to photograph");
    // the pages an X post links to: a quote may come from one of them rather than from the post
    const linked = post && socialNetwork(post) === "x" ? await xPostText(post).then((x) => x.links || [], () => []) : [];
    const extraPages = (((await getSupplement(topic).catch(() => null)) || {}).sources || []).map((x) => x && x.url).filter((u) => u && u !== source).slice(0, 3);
    const pageShot = async (url, p) =>
      p.quote ? (await webArticleShot(url, [p.quote, ...(p.also || [])].filter(Boolean), { ratio: SHOT_RATIO, name: `${name}-shot-${p.num}` })) || (await webQuoteShot(url, p.quote)).quote : "";
    // A story of several pages shows a different screenshot on each (Hamed, Nov 18 2026: «وقتی بیش از یک
    // استوری درست میکنی دیگه درهر صفحه اسکرین مشابه نذار»; a two-page story from an IRCC post showed the
    // same post twice). Every shot has a key: a post's embed looks the same whatever is marked in it, so
    // it is used by one page only; a web page counts once per marked sentence, and once unmarked. A page
    // takes the first source whose key no earlier page has, marked first, then unmarked.
    const used = new Set(story.pages.filter((p) => p.shot_url && p.shot_key).map((p) => p.shot_key));
    const pageKey = (u, q) => u + "|" + (q ? norm(q) : "plain");
    const others = (u) => u && !socialNetwork(u);
    for (const p of todo) {
      const marks = [p.quote, ...(p.also || [])].filter(Boolean);
      const shotName = `${name}-shot-${p.num}`;
      let got = null;
      let postPlain = null;
      const take = (url, key) => url && !got && (got = { url, key });
      try {
        // The original first (Hamed, Nov 22 2026: the person's post is worth nothing to us, the news itself
        // is): marked, the source page itself, then the document the post shares as a picture (an IRCC
        // email, a government page; lib/story/post-photo.js), then the pages the post links to and the
        // trusted pages added to the source text (lib/supplement.js), and only then the post itself
        // (its own page is a login wall, so the network's public embed, else the card drawn from X's data)
        if (others(source) && !used.has(pageKey(source, p.quote))) take(await pageShot(source, p).catch(() => ""), pageKey(source, p.quote));
        let photoPlain = null;
        if (!got && post) {
          const ph = await postPhotoShot(post, marks, { ratio: SHOT_RATIO, name: shotName, skip: used }).catch(() => null);
          if (ph && ph.marked) take(ph.url, ph.key);
          else if (ph) photoPlain = ph;
        }
        for (const u of [...linked.slice(0, 3), ...extraPages]) if (!got && others(u) && !used.has(pageKey(u, p.quote))) take(await pageShot(u, p).catch(() => ""), pageKey(u, p.quote));
        // a shared document, even unmarked, comes before the post that shared it
        if (!got && post && !photoPlain && !used.has("post:" + post)) {
          // An X post is drawn from X's own public data first (xPostCard): the embed loads the network's
          // whole script for the same picture, the heaviest page this server opens, and it did not load
          // there (Nov 22 2026). The embed is the way for Instagram, and for X when the data gives nothing.
          const fail = (what) => (e) => {
            console.log(`[story] post ${what} failed:`, post, String(e?.message || e).slice(0, 160));
            return null;
          };
          let shot = socialNetwork(post) === "x" ? await xPostCard(post, marks, { ratio: SHOT_RATIO, name: shotName }).catch(fail("card")) : null;
          if (!shot) shot = await socialPostShot(post, marks, { ratio: SHOT_RATIO, name: shotName }).catch(fail("embed"));
          if (shot && shot.marked) take(shot.url, "post:" + post);
          else if (shot) postPlain = shot;
        }
        // unmarked, still the real source: the shared document as it is, then a page from its headline
        // down (Nov 16 2026), and the post itself last
        if (!got && photoPlain) take(photoPlain.url, photoPlain.key);
        // a page no other page shows at all comes before another look at one that already shows it
        const seen = (u) => [...used].some((k) => k.startsWith(u + "|"));
        const plainOrder = [source, ...linked.slice(0, 3), ...extraPages].filter(others);
        for (const u of [...plainOrder.filter((u) => !seen(u)), ...plainOrder.filter(seen)]) {
          if (got || used.has(pageKey(u, ""))) continue;
          take(await webArticleShot(u, [], { ratio: SHOT_RATIO, name: shotName, plain: true }).catch(() => ""), pageKey(u, ""));
        }
        if (!got && postPlain && !used.has("post:" + post)) take(postPlain.url, "post:" + post);
        if (!got) throw new Error(post ? "the post could not be photographed" : "the quoted sentence was not found on the source page");
        used.add(got.key);
        p.shot_url = got.url;
        p.shot_key = got.key;
        p.shot_v = SHOT_VERSION;
        p.shot_error = "";
      } catch (e) {
        p.shot_error = String(e?.message || e).slice(0, 200);
      }
    }
    story.masthead_url = "";
  }
  const any = story.pages.find((p) => want.includes(p.num) && p.shot_url);
  if (!any) throw new Error("no screenshot could be taken: " + ((story.pages.find((p) => p.shot_error) || {}).shot_error || "unknown error"));
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
// Imported as well as passed on: a bare re-export gives this file no
// `storyColours` of its own, and every page failed to draw without it.
import { storyColours } from "./colours.js";
import { partsSize } from "./type.js";
export { STORY_BACKGROUNDS, storyColours, cleanBg } from "./colours.js";

// One font for every story, whatever the template (Hamed, Oct 27 2026); Inter for Latin labels.
export const STORY_FONTS = "Vazirmatn|Inter";

// The stylesheet every page is drawn with (lib/story/css.js, shared with the hand-design preview).
export { STORY_CSS } from "./css.js";
import { STORY_CSS } from "./css.js";

// A page laid out by hand on the topic page (app/StoryDesigner.jsx): where the headline, the
// screenshot, the body and the source line go, in story pixels. The screenshot keeps its own
// proportions at the width it was given.
export function cleanPageManual(m) {
  if (!m || typeof m !== "object") return null;
  const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  const part = (p, withFont) =>
    p && typeof p === "object" ? { x: num(p.x, -1080, 2160), y: num(p.y, -1920, 3840), w: num(p.w, 80, 2160), ...(withFont ? { font: num(p.font, 16, 120) } : {}) } : null;
  // a template's own blocks, moved by hand (cleanBlocks in templates.js)
  const blocks = cleanBlocks(m.blocks);
  if (blocks) return { template: String(m.template || ""), blocks };
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
  // The chosen template's own design with its blocks where they were put by hand (only while the
  // story is still in the template the blocks were placed in).
  const tplKey = cleanTemplate(story.template);
  if (m && m.blocks && tplKey !== "simple" && (!m.template || m.template === tplKey)) {
    const html = templatePageHtml(tplKey, page, total, story);
    if (html) return html + `<style>${blockCss(m.blocks)}</style>`;
  }
  if (m && !m.blocks) {
    const at = (p, font) => (p ? `left:${p.x}px;top:${p.y}px;width:${p.w}px;${font && p.font ? `font-size:${p.font}px;` : ""}` : "display:none;");
    return `<style>${MANUAL_CSS}</style><div class="s m" style="--bg:${c.bg}${dir};--text:${c.text};--box:${c.box};--boxText:${c.boxText};--edge:${c.edge || "transparent"}">
  <div class="body top" style="${at(m.headline, true)}"><span>${esc(digits(page.headline))}</span></div>
  ${page.shot_url ? `<div class="shots" style="${at(m.shot)}"><img class="shot" src="${esc(page.shot_url)}"></div>` : ""}
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
  // One text in two parts, above and under the screenshot, both set the same way (Hamed, Nov 25 2026:
  // «حالت تایتل و متن رو نداشته باشیم، یک متن در دو قسمت»): the same boxes and one type size, which
  // steps down as the text grows. A text-only page has the screenshot's room too, so its type is larger.
  const roomy = page.shot_url ? 1 : 1.15;
  const b = Math.round(partsSize(page.headline, page.body) * roomy);
  // No site header on any story (the team: a news site's logo and buttons
  // above the fact look weird), stories saved with one included.
  const mast = "";
  return `<div class="s" style="--bg:${c.bg}${dir};--text:${c.text};--box:${c.box};--boxText:${c.boxText};--edge:${c.edge || "transparent"};--b:${b}px">
  <div class="body top"><span>${esc(digits(page.headline))}</span></div>
  ${page.shot_url ? `<div class="shots">${mast}<img class="shot" src="${esc(page.shot_url)}"></div>` : ""}
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
