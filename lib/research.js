// Verified-fact research for the Content Wizard (Path B). Runs a real web
// search before generation so prompts are grounded in current facts + source
// URLs rather than model memory alone — mirrors topic-engine's script/article
// grounding pattern (lib/news.js's fetchArticleText), but via OpenAI's
// Responses API web_search_preview tool instead of a fetched article, since
// Path B has no single news article behind it.
import OpenAI from "openai";

const MODEL = "gpt-4o";

let client = null;
function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set on the server.");
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

// Official sources to search first, per country — keeps the model from
// wandering into unreliable secondary sources for the countries the wizard
// covers.
const PREFERRED_SOURCES = {
  finland: ["migri.fi", "infofinland.fi", "studyinfinland.fi", "kela.fi"],
  canada: ["canada.ca/immigration", "ircc.canada.ca"],
  germany: ["bamf.de", "make-it-in-germany.com"],
  netherlands: ["ind.nl", "studyinholland.nl"],
  spain: ["exteriores.gob.es", "educacion.gob.es"],
  france: ["france-visas.gouv.fr", "campusfrance.org"],
};

// Matches a free-text country name, Farsi label, or country code (as used
// elsewhere in this app) to its preferred-sources entry.
function matchCountryKey(country) {
  const c = String(country || "").toLowerCase();
  if (!c) return null;
  const table = [
    ["finland", ["finland", "فنلاند", "fi"]],
    ["canada", ["canada", "کانادا", "ca"]],
    ["germany", ["germany", "آلمان", "de"]],
    ["netherlands", ["netherlands", "هلند", "nl"]],
    ["spain", ["spain", "اسپانیا", "es"]],
    ["france", ["france", "فرانسه", "fr"]],
  ];
  for (const [key, aliases] of table) {
    if (aliases.some((a) => c.includes(a))) return key;
  }
  return null;
}

function systemPrompt(country) {
  const key = matchCountryKey(country);
  const sourcesLine = key
    ? `For this country, search these official sources first: ${PREFERRED_SOURCES[key].join(", ")}. Only use other official government immigration portals if these don't cover the topic.`
    : "Search official government immigration portals only.";
  return `You are a research assistant for an immigration company. Search only official and reliable sources. For the given topic, return: 5-8 verified facts, each with a source URL and publication date. Do not invent any numbers. If you cannot find a figure, write 'بسته به شرایط' (Persian) or 'subject to conditions' (English). Return JSON only: { facts: [{ fact: string, source_url: string, date: string }] } ${sourcesLine}`;
}

// Search-grounded responses often wrap JSON in commentary or code fences
// despite being told "JSON only" — parse defensively rather than trust it.
function parseFactsJson(text) {
  let t = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v?.facts)) return v.facts;
  } catch (_) {
    // fall through to salvage below
  }
  const m = t.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const v = JSON.parse(m[0]);
      if (Array.isArray(v?.facts)) return v.facts;
    } catch (_) {
      // give up — caller treats this as "no facts found"
    }
  }
  return [];
}

// topic = { country, title, language }. Returns an array of
// { fact, source_url, date } — empty if search/parsing fails, never throws
// for a bad model response (only for missing credentials).
export async function researchTopic(topic) {
  const openai = getClient();
  const response = await openai.responses.create({
    model: MODEL,
    tools: [{ type: "web_search_preview" }],
    input: [
      { role: "system", content: systemPrompt(topic?.country) },
      {
        role: "user",
        content: `Research the topic: "${topic?.title || ""}" for country: "${topic?.country || ""}". Language: ${topic?.language || "persian"}.`,
      },
    ],
  });
  return parseFactsJson(response.output_text);
}
