// More material when the topic's own page is not enough (Hamed, Oct 26 2026: a card on proving a
// genuine relationship rested on a canada.ca page that lists no documents, and the script could
// only say so. "If that page doesn't have it, search related pages, on IRCC's site or other
// reliable sites, and name the sources at the bottom").
//
// Once per topic, before the first piece is written: a model reads the topic's question against
// its own source text. Enough: nothing more happens. Not enough: the search model looks for the
// missing part on trusted sites only, the pages are read here (never the search's summary), pages
// with no real text are dropped, and the list is stored as `supplement:<topic key>`. Every writing
// step then reads them after the main source (lib/grounding.js), and the topic page names them.

import { openaiEnabled, openaiScript, openaiSearch } from "./openai.js";
import { readLinks } from "./custom-news.js";
import { mainSourceText } from "./grounding.js";
import { getRecords, saveRecord, keyOf } from "./workspace.js";

// The sites the team trusts for immigration facts: government first, then the established
// outlets it follows (the same ones the news feeds read).
export const TRUSTED_HOSTS = [
  "canada.ca", "gc.ca", "canlii.org", "welcomebc.ca", "gov.bc.ca", "ontario.ca", "alberta.ca", "immigratemanitoba.com",
  "novascotia.ca", "liveinnovascotia.com", "saskatchewan.ca", "quebec.ca", "gnb.ca", "princeedwardisland.ca", "gov.nl.ca",
  "cicnews.com", "canadavisa.com", "immigration.ca", "immigrationnewscanada.ca", "cimmigrationnews.com", "canadim.com",
  "canadianimmigrant.ca", "moving2canada.com", "europa.eu", "bamf.de", "schengenvisainfo.com",
];

export function trustedHost(url) {
  let h = "";
  try {
    h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return TRUSTED_HOSTS.some((t) => h === t || h.endsWith("." + t));
}

function parseJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  try {
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

export async function getSupplement(topic) {
  const id = "supplement:" + keyOf(topic);
  return (await getRecords(id)).find((r) => r.id === id) || null;
}

// Whether the topic's own text answers what the card promises. A failed check counts as enough:
// it only adds work, and the writing steps stay grounded on the main source either way.
async function judge(topic, text) {
  const ask = topic.question || topic.title_en || topic.title_fa;
  const out = await openaiScript(`You check whether a source text is enough to make a short, useful immigration post for Iranians.

THE POST (what it promises to explain): ${ask}
Card title: ${topic.title_en || ""} / ${topic.title_fa || ""}
${topic.why_now ? `Card summary: ${topic.why_now}` : ""}

Read the SOURCE TEXT below. It is ENOUGH only if the text itself gives the substance the post promises: the actual rules, lists, documents, numbers, steps or outcome, not just a mention of the subject or a statement that details are not listed here.

===== SOURCE TEXT =====
${String(text || "").slice(0, 9000) || "(empty)"}
===== END =====

Return JSON only: {"enough": true or false, "missing": "if not enough: what the post needs that the text does not give, one English line", "search": "if not enough: one English web search query for exactly that"}`).catch(() => "");
  const v = parseJson(out);
  if (!v || typeof v.enough !== "boolean") return { enough: true };
  return { enough: v.enough, missing: String(v.missing || "").slice(0, 300), search: String(v.search || ask || "").slice(0, 300) };
}

// Runs once per topic; `onStage` tells the page it is searching. Returns the stored record.
export async function ensureSupplement(topic, onStage = () => {}) {
  if (!topic || !openaiEnabled()) return null;
  // Lexbase items rest on the newsletter's own text, pictures on their transcription.
  if (topic.newsletter === "lexbase" || topic.image_text) return null;
  const have = await getSupplement(topic).catch(() => null);
  if (have) return have;
  const main = await mainSourceText(topic, { maxChars: 9000 }).catch(() => "");
  const verdict = await judge(topic, main);
  const base = { id: "supplement:" + keyOf(topic), type: "supplement", checked_at: Date.now() };
  if (verdict.enough) return saveRecord({ ...base, enough: true, sources: [] });

  onStage("supplement");
  const own = [topic.source_url, ...(topic.links || [])].filter(Boolean);
  let found = [];
  try {
    const { text, citations } = await openaiSearch(`Find 2 to 4 web pages that give the real, current facts for this, for a licensed Canadian / European immigration firm's post.

NEEDED: ${verdict.missing}
TOPIC: ${topic.title_en || topic.title_fa}
SEARCH FOR: ${verdict.search}

Use ONLY these sites: ${TRUSTED_HOSTS.join(", ")}. Official government pages first, then the established news outlets in that list. Never forums, blogs of unknown firms or AI content farms.

Answer with a JSON array only: [{"url": "...", "why": "what this page gives, one line"}]. Real URLs you actually found, no others.`);
    const fromJson = (() => {
      const m = String(text || "").match(/\[[\s\S]*\]/);
      try {
        return m ? JSON.parse(m[0]).map((x) => x && x.url) : [];
      } catch {
        return [];
      }
    })();
    found = [...new Set([...fromJson, ...(citations || []).map((c) => c.url)].filter(Boolean).map((u) => String(u).replace(/[#].*$/, "")))];
  } catch {}
  const urls = found.filter((u) => trustedHost(u) && !own.some((o) => o && u.replace(/\/$/, "") === String(o).replace(/\/$/, ""))).slice(0, 5);
  const read = urls.length ? await readLinks(urls, { perLink: 3000 }).catch(() => []) : [];
  const sources = read.filter((r) => !r.error).slice(0, 3).map((r) => ({ url: r.url, host: r.host }));
  // Whether the main text and the pages found now hold what the post needs, so the page can say
  // plainly when even trusted sites did not.
  let after = { enough: false };
  if (sources.length) {
    const extra = read.filter((r) => !r.error).slice(0, 3).map((r, i) => `[Additional source ${i + 1}: ${r.host}]\n${r.text}`).join("\n\n");
    after = await judge(topic, `${main.slice(0, 5000)}\n\n${extra}`);
  }
  return saveRecord({ ...base, enough: !!after.enough, missing: after.enough ? "" : verdict.missing, sources, searched: true });
}
