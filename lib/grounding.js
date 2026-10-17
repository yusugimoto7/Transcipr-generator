// The text a topic's material is written from, in one place. Order:
//   1. a Lexbase item's own text (the newsletter is not on the web)
//   2. an official page the harvester already fetched (general ideas are
//      grounded on canada.ca pages, which block bursts and go slow; the
//      stored copy is at most a day old)
//   3. the page(s) behind the topic's link(s), fetched now — every link for
//      a topic the editor made from their own links
//   4. the excerpt stored on the card
// Every writing step — scripts, Telegram post, article, carousel — uses this,
// so they can never disagree about what a topic rests on.

import { fetchArticleText } from "./news.js";
import { getLexbaseItems, findLexbaseItem } from "./newsletter/lexbase.js";
import { officialPageText } from "./ideas/index.js";
import { readLinks, joinSources } from "./custom-news.js";

export async function sourceTextFor(topic, { maxChars = 6000 } = {}) {
  if (!topic) return "";
  if (topic.newsletter === "lexbase" || /\/api\/lexbase\//.test(topic.source_url || "")) {
    await getLexbaseItems({ waitMs: 8000 }).catch(() => {});
    const it = findLexbaseItem(topic);
    if (it && it.text) return it.text;
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
  return text;
}
