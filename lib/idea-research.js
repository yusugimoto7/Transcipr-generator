// Research for the Topic Engine (lib/research.js is the Content Wizard's own): from an idea or a subject, beyond the daily news. The search model only FINDS pages;
// the pages are then read by this app and every card is written from their text alone, exactly
// like a card made from the editor's own links (lib/custom-news.js), so grounding holds.
//
//   researchIdea(idea)      one idea the editor had -> the best pages about it -> one card
//   findIdeas(subject, n)   a subject (or the default subjects) -> n different angles for posts,
//                           each on its own page -> one card per angle

import { openaiEnabled, openaiSearch } from "./openai.js";
import { buildCustomTopic, parseLinks } from "./custom-news.js";

// What the brand covers when the editor gives no subject. Express Entry draw results are covered
// elsewhere and stay out.
export const DEFAULT_SUBJECTS = [
  "Canada study permits and international students (rules, caps, PGWP)",
  "Canadian work permits and LMIA, including spousal open work permits",
  "Canada permanent residence pathways other than Express Entry draw results (PNP, CEC rules, high-wage occupations)",
  "Family sponsorship in Canada (spouse, parents, super visa)",
  "Canada Start-up Visa and self-employed / business immigration",
  "Federal Court of Canada immigration decisions that matter to applicants (refusals, procedural fairness, mandamus)",
  "Canadian visitor visas and refusals for Iranian applicants",
  "Moving to Europe for work or study (EU Blue Card, Germany Opportunity Card, Netherlands, Ireland)",
];

const TRUSTED = "official government pages (canada.ca, gc.ca, provincial government sites, europa.eu, national immigration agencies), court decisions (CanLII, decisions.fct-cf.gc.ca), and established immigration news outlets (CIC News, Immigration.ca, Moving2Canada, CBC, Globe and Mail)";

function urlsIn(text) {
  return parseLinks(String(text || "").match(/https?:\/\/[^\s)"'\]>]+/gi)?.join("\n") || "");
}

function parseJsonArray(text) {
  const m = String(text || "").match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const v = JSON.parse(m[0]);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function needSearch() {
  if (!openaiEnabled()) throw new Error("research needs the web search model (USE_OPENAI + OPENAI_API_KEY)");
}

// One idea -> the best 2-4 pages -> one grounded card.
export async function researchIdea(idea) {
  needSearch();
  const q = String(idea || "").trim().slice(0, 600);
  if (q.length < 4) throw new Error("write the idea first");
  const { text, citations } = await openaiSearch(`Find the best 2 to 4 web pages that give the real, current facts about this idea for a Persian-language Canadian / European immigration channel. Prefer ${TRUSTED}. Prefer the most recent pages.

IDEA (may be Persian): ${q}

Answer with a JSON array only: [{"url": "...", "why": "one line on what this page has"}]. Real URLs you actually found, no others.`);
  const links = [...new Set([...parseJsonArray(text).map((x) => x && x.url), ...citations.map((c) => c.url), ...urlsIn(text)].filter(Boolean))].slice(0, 4);
  if (!links.length) throw new Error("no page about this idea was found; write it differently or add a link yourself");
  const { topic, skipped } = await buildCustomTopic({ links: links.join("\n"), note: `The editor's idea, researched: ${q}` });
  return { topics: [{ ...topic, researched: true, idea: q }], skipped };
}

// A subject -> n different post angles, each grounded on its own page.
export async function findIdeas(subject, n = 6) {
  needSearch();
  const want = Math.max(2, Math.min(8, Number(n) || 6));
  const subj = String(subject || "").trim().slice(0, 400);
  const subjects = subj ? [subj] : DEFAULT_SUBJECTS.slice().sort(() => Math.random() - 0.5).slice(0, 2);
  const { text, citations } = await openaiSearch(`You find ideas for posts and short videos for Sugimoto Visa, a Persian-language Canadian and European immigration channel for Iranians. Not today's headlines only: useful developments, rules people misunderstand, court decisions, official guidance, numbers from official reports, recent changes, things the audience keeps asking about. Never Express Entry draw results.

SUBJECT${subjects.length > 1 ? "S" : ""}: ${subjects.join(" | ")}

Search the web and give ${want} DIFFERENT ideas, each with the ONE page that holds its facts. Prefer ${TRUSTED}; prefer recent pages.
Answer with a JSON array only: [{"angle": "the post idea in one English sentence", "url": "the page"}]. Real URLs you actually found, no others.`);
  let items = parseJsonArray(text).filter((x) => x && x.url && x.angle);
  if (!items.length) items = citations.map((c) => ({ url: c.url, angle: c.title }));
  const seen = new Set();
  items = items.filter((x) => {
    const u = String(x.url).replace(/[#?].*$/, "");
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  }).slice(0, want);
  if (!items.length) throw new Error("no ideas were found for this subject; try another wording");

  // A few at a time: each card reads its page and has one write call.
  const topics = [];
  const skipped = [];
  for (let i = 0; i < items.length; i += 3) {
    const done = await Promise.allSettled(
      items.slice(i, i + 3).map((x) => buildCustomTopic({ links: x.url, note: `Post idea found by research: ${x.angle}` }))
    );
    done.forEach((d, k) => {
      const x = items[i + k];
      if (d.status === "fulfilled") topics.push({ ...d.value.topic, researched: true, idea: x.angle, ...(subj ? { subject: subj } : {}) });
      else skipped.push({ url: x.url, error: String(d.reason && d.reason.message ? d.reason.message : d.reason).slice(0, 160) });
    });
  }
  if (!topics.length) throw new Error("the pages found could not be read: " + skipped.map((s) => s.url).join(", "));
  return { topics, skipped };
}
