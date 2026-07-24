import OpenAI from "openai";

// Model IDs are env-overridable so you can bump them without a code change.
// Defaults reflect the intended split:
//   - topics/news + web search: a cheap search-capable model
//   - full scripts: a premium model
const TOPICS_MODEL = process.env.OPENAI_TOPICS_MODEL || "gpt-4o-mini-search-preview";
const SCRIPT_MODEL = process.env.OPENAI_SCRIPT_MODEL || "gpt-5.4";
const ARTICLE_MODEL = process.env.OPENAI_ARTICLE_MODEL || "gpt-5.4-mini";
// Plain (no web search) rewrite model — used to turn real fetched news articles
// into Farsi topic hooks. Cheap; no search cost.
const REWRITE_MODEL = process.env.OPENAI_REWRITE_MODEL || "gpt-4o-mini";

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
export async function openaiScript(prompt) {
  const c = getClient();
  const resp = await c.responses.create({
    model: SCRIPT_MODEL,
    input: prompt,
    max_output_tokens: 4000,
  });
  return (resp.output_text || "").trim();
}

// Blog article: a longer 500-800 word SEO piece, so a larger output budget.
export async function openaiArticle(prompt) {
  const c = getClient();
  const resp = await c.responses.create({
    model: ARTICLE_MODEL,
    input: prompt,
    max_output_tokens: 6000,
  });
  return (resp.output_text || "").trim();
}
