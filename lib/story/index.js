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

import { storyPagesFromScript } from "../script-split.js";
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
import { getLexbaseItems, findLexbaseItem, getLexbasePdfs, citationOf } from "../newsletter/lexbase.js";
import { norm, locate } from "./match.js";
import { pdfQuoteShot } from "./pdfshot.js";
import { webQuoteShot, webArticleShot, socialPostShot, xPostCard } from "./webshot.js";
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
- "also": the screenshot shows the article itself, not only the quote, so up to TWO other sentences from the same part of the source that a reader should notice (another number, the date it applies from, who it covers), copied CHARACTER FOR CHARACTER the same way; they are highlighted too. [] when nothing else near the quote matters.

Rules:
- Every fact comes from the source text and nothing else. No advice, no "what this means for you", no prediction.
- Pages tell one story in order: page 1 is the strongest single fact; later pages add the next most important facts. Use a DIFFERENT quote on each page.
- Never write «طبق منبع» or «بر اساس گزارش»; state facts in the brand's own voice. «این نشون میده …» only for what the source text itself states, never your own conclusion.
- No call to action, no «دایرکت», no «لینک در بیو», no «ذخیره کنید».
- Name people, courts and offices exactly as the source does, with their exact role.
${TERM_RULE}
Also return "caption": a 1-3 line Persian caption for the story post in the same voice (facts only).

Return ONLY JSON: {"pages":[{"headline":"","body":"","quote":"","also":[],"ref":""}],"caption":""}${prev}${notes ? `\n\nEditor's notes for THIS story (follow them, as long as they need no fact outside the source text):\n${notes}` : ""}

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
// The saved script, word for word, cut into pages by rule (never rewritten by a model): its
// paragraphs, joined or split at sentence ends to the number of pages asked for. Each page's first
// sentence is its headline and the rest its body. The spoken comment-word close is left out: a story
// has no comments. A model only picks, for each page, the source sentences the screenshot highlights.
// the script cut into pages by rule (lib/script-split.js): each page's words in two parts, above
// the screenshot and under it (Hamed, Nov 11 2026)
export function scriptPages(script, count) {
  return storyPagesFromScript(script, count, { min: MIN_PAGES, max: MAX_PAGES });
}

async function quotesForPages(pages, sourceText, shots = [1]) {
  const prompt = `${BRAND_CONTEXT}

Each page of an Instagram story below already has its text (written by the team from the source; do not change it). Under the text sits a screenshot of the original source with sentences highlighted. For EACH page pick from the SOURCE TEXT:
- "quote": ONE or TWO consecutive sentences copied CHARACTER FOR CHARACTER from the source text, in its original language, at most 280 characters, that best prove what this page says. Never translate, shorten inside or paraphrase. A different quote on each page.
- "also": up to TWO other sentences from the same part of the source that back the page's other facts (a number, a date, who it covers), copied the same way; [] if none.
- "ref": for a court decision, the case name exactly as the source writes it; otherwise "".
Also return "caption": a 1-3 line caption for the post made only of the pages' own words.

Return ONLY JSON: {"pages":[{"quote":"","also":[],"ref":""}],"caption":""}

PAGES:
${pages.map((p, i) => `${i + 1}. ${p.headline} ${p.body}`).join("\n")}

===== SOURCE TEXT =====
${sourceText}
===== END =====`;
  let problem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = parseStory(await askModel(attempt ? prompt + `\n\nYour previous answer was rejected: ${problem}. Copy each quote exactly from the source text.` : prompt));
    if (!parsed) {
      problem = "it was not the JSON asked for";
      continue;
    }
    const picks = pages.map((_, i) => parsed.pages[i] || {});
    const out = picks.map((q, i) => {
      const quote = String(q.quote || "").replace(/\s+/g, " ").trim().slice(0, 400);
      const ref = String(q.ref || "").replace(/\s+/g, " ").trim().slice(0, 140);
      return {
        quote,
        also: (Array.isArray(q.also) ? q.also : []).map((x) => String(x || "").replace(/\s+/g, " ").trim().slice(0, 400)).filter((x) => x && norm(x) !== norm(quote) && quoteInSource(x, sourceText)).slice(0, 2),
        ref: ref && norm(sourceText).includes(norm(ref)) ? ref : "",
      };
    });
    // only the pages chosen for a screenshot are photographed, so only their sentences have to be found;
    // a sentence on another page that the source lacks is dropped (a screenshot turned on later for that
    // page is then taken unmarked)
    const bad = out.filter((q, i) => shots.includes(i + 1) && !quoteInSource(q.quote, sourceText));
    for (const q of out) if (q.quote && !quoteInSource(q.quote, sourceText)) q.quote = "";
    if (!bad.length) return { picks: out, caption: String(parsed.caption || "").trim() };
    problem = `${bad.length} quote(s) are not in the source text`;
  }
  throw new Error("the story's screenshots could not be grounded: " + problem);
}

export async function storyFromScript(script, count, sourceText, lang = "fa", shots = [1]) {
  const pages = scriptPages(script, count);
  if (!pages.length) return null;
  const { picks, caption } = await quotesForPages(pages, sourceText, shots);
  return {
    pages: pages.map((p, i) => ({ num: i + 1, headline: p.headline, body: p.body, ...picks[i], from_script: true })),
    caption: cleanText(caption, { lang }) || pages[0].headline,
  };
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
  const m = text.match(/^\s*(?:\d+\.\s*)?([A-Z][A-Z .,'’\-]{2,80}?)\s+((?:IMM|T|A|DES)-\d+-\d+)/);
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
        const shot = await pdfQuoteShot(pdfs, p.quote, { also: p.also || [], ratio: SHOT_RATIO, item: it ? { title: it.title, text: it.text } : null });
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
        // marked: the source page itself, the post (its own page is a login wall, so the network's public
        // embed, Nov 12 2026), the pages the post links to, then the trusted pages added to the source
        // text when the topic's own page did not answer it (lib/supplement.js)
        if (others(source) && !used.has(pageKey(source, p.quote))) take(await pageShot(source, p).catch(() => ""), pageKey(source, p.quote));
        if (!got && post && !used.has("post:" + post)) {
          let shot = await socialPostShot(post, marks, { ratio: SHOT_RATIO, name: shotName }).catch((e) => {
            console.log("[story] post embed failed:", post, String(e?.message || e).slice(0, 160));
            return null;
          });
          // X's embed did not load or held nothing: the post drawn from its own public data (xPostCard)
          if ((!shot || !shot.marked) && socialNetwork(post) === "x") {
            const card = await xPostCard(post, marks, { ratio: SHOT_RATIO, name: shotName }).catch((e) => {
              console.log("[story] post card failed:", post, String(e?.message || e).slice(0, 160));
              return null;
            });
            if (card && (card.marked || !shot)) shot = card;
          }
          if (shot && shot.marked) take(shot.url, "post:" + post);
          else if (shot) postPlain = shot;
        }
        for (const u of [...linked.slice(0, 3), ...extraPages]) if (!got && others(u) && !used.has(pageKey(u, p.quote))) take(await pageShot(u, p).catch(() => ""), pageKey(u, p.quote));
        // unmarked, still the real source: the post as it is, else a page from its headline down (Nov 16 2026)
        if (!got && postPlain && !used.has("post:" + post)) take(postPlain.url, "post:" + post);
        // a page no other page shows at all comes before another look at one that already shows it
        const seen = (u) => [...used].some((k) => k.startsWith(u + "|"));
        const plainOrder = [source, ...linked.slice(0, 3), ...extraPages].filter(others);
        for (const u of [...plainOrder.filter((u) => !seen(u)), ...plainOrder.filter(seen)]) {
          if (got || used.has(pageKey(u, ""))) continue;
          take(await webArticleShot(u, [], { ratio: SHOT_RATIO, name: shotName, plain: true }).catch(() => ""), pageKey(u, ""));
        }
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
import { headlineSize, bodySize } from "./type.js";
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
  <h1 style="${at(m.headline, true)}">${esc(digits(page.headline))}</h1>
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
  // a page made from the script can carry more words: the type steps down so it still fits
  // a text-only page (every page after the first) has the screenshot's room too, so its type is larger
  const roomy = page.shot_url ? 1 : 1.15;
  const h = Math.round(headlineSize(page.headline) * roomy);
  const b = Math.round(bodySize(page.body) * roomy);
  // No site header on any story (the team: a news site's logo and buttons
  // above the fact look weird), stories saved with one included.
  const mast = "";
  return `<div class="s" style="--bg:${c.bg}${dir};--text:${c.text};--box:${c.box};--boxText:${c.boxText};--edge:${c.edge || "transparent"};--h:${h}px;--b:${b}px">
  <h1>${esc(digits(page.headline))}</h1>
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
