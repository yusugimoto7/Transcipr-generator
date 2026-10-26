// The text a topic's material is written from, in one place. Order:
//   1. a Lexbase item's own text (the newsletter is not on the web)
//   2. an official page the harvester already fetched (general ideas are
//      grounded on canada.ca pages, which block bursts and go slow; the
//      stored copy is at most a day old)
//   3. the page(s) behind the topic's link(s), fetched now — every link for
//      a topic the editor made from their own links
//   4. the excerpt stored on the card
//   — and for a provincial draw, the province's own results page ahead of
//     the news report (lib/provinces.js)
// Every writing step — scripts, Telegram post, article, carousel — uses this,
// so they can never disagree about what a topic rests on.

import { fetchArticleText } from "./news.js";
import { getLexbaseItems, findLexbaseItem } from "./newsletter/lexbase.js";
import { officialPageText } from "./ideas/index.js";
import { readLinks, joinSources } from "./custom-news.js";
import { getRecords, keyOf } from "./workspace.js";
import { officialDrawSource } from "./provinces.js";

// The topic's source text plus any trusted pages added because that text alone did not answer
// what the card promises (lib/supplement.js). The added pages come after the main source and
// are labelled, so a fact can always be traced to its page.
export async function sourceTextFor(topic, { maxChars = 6000 } = {}) {
  const main = await mainSourceText(topic, { maxChars });
  const extra = await supplementText(topic).catch(() => "");
  return extra ? `${main}\n\n${extra}` : main;
}

async function supplementText(topic) {
  if (!topic) return "";
  const id = "supplement:" + keyOf(topic);
  const rec = (await getRecords(id)).find((r) => r.id === id);
  const urls = ((rec && rec.sources) || []).map((x) => x.url).filter(Boolean).slice(0, 3);
  if (!urls.length) return "";
  const read = await readLinks(urls, { perLink: 3000 });
  return read
    .filter((r) => !r.error)
    .map((r, i) => `[Additional source ${i + 1}: ${r.host} (${r.url})]\n${r.text}`)
    .join("\n\n");
}

export async function mainSourceText(topic, { maxChars = 6000 } = {}) {
  if (!topic) return "";
  if (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || "")) {
    await getLexbaseItems({ waitMs: 8000 }).catch(() => {});
    const it = findLexbaseItem(topic);
    if (it && it.text) return it.text;
    // The card keeps the item's own text; the CanLII page is the whole decision, and a wrong
    // link there once had a card's material written about another person's case.
    if (String(topic.snippet || "").length >= 200) return String(topic.snippet);
  }
  if (topic.evergreen || topic.page_id) {
    const t = await officialPageText(topic).catch(() => "");
    if (t) return t.slice(0, maxChars);
  }
  // A topic made from the editor's pictures rests on their transcription,
  // plus any links that came with them.
  if (topic.image_text) {
    const pages = Array.isArray(topic.links) && topic.links.length ? joinSources(await readLinks(topic.links.slice(0, 5), { perLink: 3000 }).catch(() => [])) : "";
    return [pages, topic.image_text].filter(Boolean).join("\n\n").slice(0, Math.max(maxChars, 9000));
  }
  // A topic made from the editor's own links rests on all of them.
  if (Array.isArray(topic.links) && topic.links.length > 1) {
    const t = joinSources(await readLinks(topic.links.slice(0, 5), { perLink: Math.ceil(maxChars / Math.min(topic.links.length, 5)) }).catch(() => []));
    if (t) return t.slice(0, maxChars);
  }
  let text = "";
  if (topic.source_url) text = await fetchArticleText(topic.source_url, { maxChars }).catch(() => "");
  if (!text && topic.snippet) text = String(topic.snippet);
  // A provincial draw: the province's own results page comes first, the
  // news report after it (it may add context, never contradict the original).
  const official = await officialDrawSource(topic).catch(() => null);
  if (official) {
    const own = official.text.slice(0, Math.max(3000, maxChars - 1500));
    return `[Official source: ${official.name} — ${official.url}]\n${own}${text ? `\n\n[News report]\n${text.slice(0, 1500)}` : ""}`;
  }
  return text;
}
