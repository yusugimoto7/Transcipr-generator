// News from the editor's own links and/or pictures: paste article links,
// drop screenshots (a news page, an IRCC letter, a post), add an optional
// note, and the app writes a topic card from what those pages and pictures
// say. Pictures are transcribed word for word first (lib/image-text.js); the
// transcription is a source like any page.
// The note sets the angle (who it matters to, what to stress); the facts come
// only from the pages. A link that cannot be read is reported, never guessed.
//
// The card is saved to the shared workspace as a new topic, so it sits in the
// News list for the whole team and every later step (scripts, Telegram post,
// article, carousel) is written from the same pages (lib/grounding.js reads
// `links`).

import { fetchArticleText, hasSubstance } from "./news.js";
import { FARSI_TERMS, parseTopics } from "./prompts.js";
import { openaiEnabled, openaiScript } from "./openai.js";
import { callClaude } from "./anthropic.js";
import { cleanImages, transcribeImages } from "./image-text.js";

export const MAX_LINKS = 5;
const PER_LINK_CHARS = 6000;
const MIN_TEXT = 200;

// Only public web pages: never an internal address, so pasted links cannot
// be used to reach the server's own network.
export function publicHttpUrl(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
    if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(h) || h.includes(":")) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function host(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (_) {
    return u;
  }
}

// Pulls the links out of whatever was pasted (one per line, or mixed with text).
export function parseLinks(input) {
  const raw = Array.isArray(input) ? input.join("\n") : String(input || "");
  const found = raw.match(/https?:\/\/[^\s<>"'،]+/gi) || [];
  const out = [];
  for (const u of found) {
    const clean = u.replace(/[).,;]+$/, "");
    if (!out.includes(clean)) out.push(clean);
  }
  return out.slice(0, MAX_LINKS);
}

// The text of each link, in order. Shared with lib/grounding.js so the card
// and everything made from it rest on the same text.
export async function readLinks(links, { perLink = PER_LINK_CHARS } = {}) {
  return Promise.all(
    links.map(async (url) => {
      if (!publicHttpUrl(url)) return { url, host: host(url), text: "", error: "not a public web link" };
      const text = await fetchArticleText(url, { timeoutMs: 15000, maxChars: perLink }).catch(() => "");
      if (!text || text.length < MIN_TEXT) return { url, host: host(url), text, error: "the page could not be read (blocked, login wall or too little text)" };
      // Menus and links only (a page that loads its text later): nothing to write from.
      if (!hasSubstance(text)) return { url, host: host(url), text: "", error: "the page shows only menus and links, not its text" };
      return { url, host: host(url), text, error: "" };
    })
  );
}

export function joinSources(read) {
  return read
    .filter((r) => r.text && !r.error)
    .map((r, i) => `[Source ${i + 1}: ${r.host}]\n${r.text}`)
    .join("\n\n");
}

function cardPrompt(sourcesText, note, todayStr) {
  return `You write a short-video topic card for Sugimoto Visa, a Persian-language immigration brand for Iranians aiming for Canada or Europe. TODAY IS ${todayStr}.

The editor gave the sources below (web pages and/or text transcribed from pictures) and wants ONE topic card about them.${note ? `

EDITOR'S NOTE (sets the angle and emphasis only — it is not a source of facts):
${note}` : ""}

⛔️ GROUNDING (non-negotiable): every fact in the card — numbers, dates, programmes, rules, who it applies to — must be stated in the SOURCES. Never add anything that is not there, even if the editor's note suggests it. If the sources report several related developments, the card covers the main one and may mention the others.

Voice: specific and honest; name Iranians only when the sources make it relevant. No sales lines, never "according to the source".
${FARSI_TERMS}

===== SOURCES =====
${sourcesText.slice(0, 18000)}
===== END =====

Return ONLY a JSON array with one object: [{"title_fa": Farsi on-screen hook, "title_en": short English title, "why_now": ONE Farsi sentence on what changed and for whom, "field": one of "PNP","Study","Work Permit","LMIA","Policy","Citizenship","Family","Court","Europe", "page": "CA" or "EU", "date": the development's date as YYYY-MM-DD if the sources give one, else ""}]. No other text.`;
}

async function write(prompt) {
  if (openaiEnabled()) {
    try {
      return await openaiScript(prompt);
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
    }
  }
  return callClaude([{ role: "user", content: prompt }], false, 1500);
}

// Reads the links and writes the card. Throws with a message the page can
// show when nothing usable could be read.
export async function buildCustomTopic({ links: input, note = "", images: rawImages = [] }) {
  const links = parseLinks(input);
  const images = cleanImages(rawImages);
  if (!links.length && !images.length) throw new Error("add at least one link (https://…) or picture");
  const [read, pics] = await Promise.all([links.length ? readLinks(links) : [], images.length ? transcribeImages(images) : []]);
  const ok = read.filter((r) => !r.error);
  const picsOk = pics.filter((p) => p.text && p.text.replace(/\[unreadable\]/g, "").trim().length >= 40);
  if (!ok.length && !picsOk.length) {
    const why = [
      ...read.map((r) => `${r.host} — ${r.error}`),
      ...pics.map((p) => `${p.name} — no readable text`),
    ];
    throw new Error("nothing could be read: " + why.join("; "));
  }
  const imageText = picsOk.map((p, i) => `[Picture ${i + 1}: ${p.name}]\n${p.text}`).join("\n\n");
  const sources = [joinSources(read), imageText].filter(Boolean).join("\n\n");
  // A screenshot of a short notice can hold the whole fact in a few lines;
  // pages need more, since their text includes menus and boilerplate.
  if (sources.length < (ok.length ? MIN_TEXT : 80)) throw new Error("the pages and pictures have too little text to write from");
  const cleanNote = String(note || "").trim().slice(0, 1500);
  const today = new Date().toISOString().slice(0, 10);
  const [card] = parseTopics(await write(cardPrompt(sources, cleanNote, today))) || [];
  if (!card || !card.title_fa) throw new Error("the card could not be written; try again");
  // A development that takes effect later (e.g. "from November 3") is today's news, not a future
  // one: the list is ordered by date, and a future date would hold the card at the top for weeks.
  const given = /^\d{4}-\d{2}-\d{2}$/.test(String(card.date || "")) ? card.date : "";
  const date = given && given <= today ? given : today;
  return {
    // The text the card was written from, for a caller that checks the card against it
    // (research, lib/idea-research.js).
    sources,
    topic: {
      title_fa: String(card.title_fa).trim().slice(0, 160),
      title_en: String(card.title_en || "").trim().slice(0, 160),
      field: card.field || "Policy",
      page: card.page === "EU" ? "EU" : "CA",
      why_now: String(card.why_now || "").trim().slice(0, 400),
      date,
      ...(given > today ? { effective_date: given } : {}),
      source_url: ok.length ? ok[0].url : "",
      source_name: ok.length ? ok[0].host : "uploaded pictures",
      snippet: sources.slice(0, 1500),
      grounding: "full",
      score: 85,
      custom: true,
      links: ok.map((r) => r.url),
      // The transcription is the source for every later step (lib/grounding.js).
      ...(imageText ? { image_text: imageText.slice(0, 12000), images_count: picsOk.length } : {}),
      ...(cleanNote ? { note: cleanNote } : {}),
      ...(ok.length > 1 ? { coverage: ok.length, outlets: ok.map((r) => r.host) } : {}),
    },
    skipped: [
      ...read.filter((r) => r.error).map((r) => ({ url: r.url, error: r.error })),
      ...pics.filter((p) => !picsOk.includes(p)).map((p) => ({ url: p.name, error: "no readable text in the picture" })),
    ],
  };
}

// For prompts: the editor's note, as framing only.
export function editorNoteBlock(topic, lang = "en") {
  const note = topic && topic.note ? String(topic.note).trim() : "";
  if (!note) return "";
  return lang === "fa"
    ? `\n\nیادداشت ویراستار برای این موضوع (فقط زاویه و تأکید؛ منبع فکت نیست — هر فکتی فقط از متن منبع):\n${note}`
    : `\n\nEDITOR'S NOTE for this topic (angle and emphasis only, not a source of facts — every fact still comes from the source text):\n${note}`;
}
