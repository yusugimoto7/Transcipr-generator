// The text a topic's material is written from, in one place. Order:
//   1. a Lexbase item's own text (the newsletter is not on the web)
//   2. an official page the harvester already fetched (general ideas are
//      grounded on canada.ca pages, which block bursts and go slow; the
//      stored copy is at most a day old)
//   3. the page behind the topic's link, fetched now
//   4. the excerpt stored on the card
// Every writing step — scripts, Telegram post, article, carousel — uses this,
// so they can never disagree about what a topic rests on.

import { fetchArticleText } from "./news.js";
import { getLexbaseItems, findLexbaseItem } from "./newsletter/lexbase.js";
import { officialPageText } from "./ideas/index.js";

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
  let text = "";
  if (topic.source_url) text = await fetchArticleText(topic.source_url, { maxChars }).catch(() => "");
  if (!text && topic.snippet) text = String(topic.snippet);
  return text;
}
