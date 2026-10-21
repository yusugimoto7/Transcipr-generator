import OpenAI from "openai";

// Model IDs are env-overridable so you can bump them without a code change.
// Defaults are chosen per job, spending where quality is permanent and saving
// where the work is mechanical (prices are per 1M tokens, short context):
//
//   ARTICLE  gpt-5.6-sol   ($5 / $30)   ~8.6c per article. Blog posts live on
//            sugimotovisa.com forever, are written in Farsi (a mid-resource
//            language where model tier matters more), and must satisfy ~8
//            stacked constraints (focus keyword placement, H2/H3 hierarchy,
//            a 600-900 character limit, 2-3 relevant internal links, mixed Persian/technical terminology,
//            delimiter output). Worth the flagship.
//   SCRIPT   gpt-5.6-terra ($2 / $12)   Newer generation AND cheaper than the
//            gpt-5.4 ($2.50 / $15) it replaces.
//   REWRITE  gpt-5.6-luna  ($0.20 / $1.20)  Topic hooks, channel posts and
//            related-link picking are mechanical rewriting of text we already
//            fetched — newer generation and 73% cheaper than gpt-5.4-mini.
const TOPICS_MODEL = process.env.OPENAI_TOPICS_MODEL || "gpt-4o-mini-search-preview";
const SCRIPT_MODEL = process.env.OPENAI_SCRIPT_MODEL || "gpt-5.6-terra";
const ARTICLE_MODEL = process.env.OPENAI_ARTICLE_MODEL || "gpt-5.6-sol";
// Plain (no web search) rewrite model — turns real fetched news articles into
// Farsi topic hooks, channel posts, and link choices. Cheapest tier.
const REWRITE_MODEL = process.env.OPENAI_REWRITE_MODEL || "gpt-5.6-luna";
// The Telegram post: short, colloquial and still exact is the hardest writing in the app (Oct
// 2026, the team: "این مدل نوشتن خیلی نیاز به هوشمندی داره"), so it gets the flagship. A post
// is a few hundred tokens: a few cents.
const POST_MODEL = process.env.OPENAI_POST_MODEL || "gpt-5.6-sol";
// Voice notes anywhere in the app (app/VoiceDictation.jsx): Farsi, English or both in one note.
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || "gpt-4o-transcribe";

let client = null;
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

// OpenAI is used only when explicitly turned on AND a key is present, so the
// default deployment is unchanged and this is fully reversible from Render by
// unsetting USE_OPENAI.
export function openaiEnabled() {
  return process.env.USE_OPENAI === "true" && !!process.env.OPENAI_API_KEY;
}

// Topics: a search-preview model performs its own web search and answers in
// one Chat Completions call.
export async function openaiTopics(prompt) {
  const c = getClient();
  const completion = await c.chat.completions.create({
    model: TOPICS_MODEL,
    messages: [{ role: "user", content: prompt }],
    web_search_options: {},
  });
  return (completion.choices?.[0]?.message?.content || "").trim();
}

// Rewrite: given real fetched articles, write Farsi topic hooks. Plain chat
// completion on a cheap model — NO web search, so it is fast and inexpensive.
export async function openaiRewrite(prompt) {
  const c = getClient();
  const completion = await c.chat.completions.create({
    model: REWRITE_MODEL,
    messages: [{ role: "user", content: prompt }],
  });
  return (completion.choices?.[0]?.message?.content || "").trim();
}

// Scripts: premium model via the Responses API. max_output_tokens is generous
// because reasoning models spend part of the budget on hidden reasoning before
// the visible answer.
export async function openaiScript(prompt, { maxOutputTokens = 4000 } = {}) {
  const c = getClient();
  const resp = await c.responses.create({
    model: SCRIPT_MODEL,
    input: prompt,
    max_output_tokens: maxOutputTokens,
  });
  return (resp.output_text || "").trim();
}

// Blog article: a 600-900 character Farsi SEO news piece (a few hundred visible tokens).
// The ceiling is deliberately far above that: reasoning-tier models spend part
// of the budget on hidden reasoning BEFORE the visible answer, so a tight cap
// silently truncates the article mid-sentence. Raising the ceiling costs
// nothing extra — billing is on tokens actually produced, and the prompt caps
// the article's length. Overridable via OPENAI_ARTICLE_MAX_TOKENS.
export async function openaiArticle(prompt) {
  const c = getClient();
  const resp = await c.responses.create({
    model: ARTICLE_MODEL,
    input: prompt,
    max_output_tokens: Number(process.env.OPENAI_ARTICLE_MAX_TOKENS || 16000),
  });
  return (resp.output_text || "").trim();
}

export async function openaiPost(prompt) {
  const c = getClient();
  const resp = await c.responses.create({ model: POST_MODEL, input: prompt, max_output_tokens: 8000 });
  return (resp.output_text || "").trim();
}

// Speech to text. No language is set: the team speaks Farsi and English, often in one sentence,
// and the prompt only teaches the spelling of the terms they use.
export async function openaiTranscribe(file, prompt = "") {
  const c = getClient();
  const r = await c.audio.transcriptions.create({ file, model: TRANSCRIBE_MODEL, ...(prompt ? { prompt } : {}) });
  return (r.text || "").trim();
}

// A small structured answer from text we already have (a transcribed note). JSON mode keeps it
// parseable; the caller checks every field.
export async function openaiJson(prompt) {
  const c = getClient();
  const completion = await c.chat.completions.create({
    model: REWRITE_MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });
  return JSON.parse(completion.choices?.[0]?.message?.content || "{}");
}
