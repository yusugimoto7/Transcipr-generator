// Research for the Topic Engine (lib/research.js is the Content Wizard's own): from an idea or a subject, beyond the daily news. The search model only FINDS pages;
// the pages are then read by this app and every card is written from their text alone, exactly
// like a card made from the editor's own links (lib/custom-news.js), so grounding holds. A card
// is kept only when its pages actually answer the idea (`supported`).
//
//   researchIdea(idea)      one idea the editor had -> the best pages about it -> one card
//   findIdeas(subject, n)   a subject (or the default subjects) -> n different angles for posts,
//                           each on its own page -> one card per angle

import { openaiEnabled, openaiSearch, openaiScript } from "./openai.js";
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

// Research is only worth the editor's time when the pages found hold the answer. A search can
// return a page about the subject that never says what the idea asks (a court decision page that
// showed only its menu once became a card on "why the bid failed", its reasons taken from the
// search's own pitch, and the script then had to say the reasons were unknown). So every card is
// read again against the text it came from, and kept only when that text carries the post.
async function supported({ idea, topic, sources }) {
  const prompt = `You check a topic card before an editor spends time on it. The card and the post idea must be fully backed by the SOURCE TEXT below. Be strict.

POST IDEA (what the editor wants the post to tell people): ${idea}

CARD:
- title (Persian): ${topic.title_fa}
- title (English): ${topic.title_en}
- what it says (Persian): ${topic.why_now}

Answer two questions from the SOURCE TEXT alone:
1. Does the text itself give the substance this post needs — the actual answer, outcome, rule, reasons or numbers the idea and the card promise — and not only a mention of the subject, a title, a case name or menus?
2. Is every fact the card states found in the text?
If either answer is no, the card is not usable.

===== SOURCE TEXT =====
${String(sources || "").slice(0, 16000)}
===== END =====

Return JSON only: {"usable": true or false, "missing": "if not usable: what the text does not say, one short English line"}`;
  const out = await openaiScript(prompt);
  const m = String(out || "").match(/\{[\s\S]*\}/);
  let v = null;
  try {
    v = m ? JSON.parse(m[0]) : null;
  } catch {}
  // An unreadable answer counts as a no: a doubtful card costs more than a missing one.
  if (!v || typeof v.usable !== "boolean") return { ok: false, missing: "the check could not be read" };
  return { ok: v.usable, missing: String(v.missing || "").slice(0, 200) };
}

function needSearch() {
  if (!openaiEnabled()) throw new Error("research needs the web search model (USE_OPENAI + OPENAI_API_KEY)");
}

// What a thorough post on the idea has to cover, before any page is looked for (Oct 26 2026:
// "cheapest and most expensive cities in Canada" found one StatCan page and became a script on
// two-bedroom rents; the search had asked for pages "about the idea", not for each part of it).
async function outlineOf(idea) {
  const out = await openaiScript(`An editor of a Persian-language Canadian / European immigration channel wants a post on this idea. List the parts a thorough, useful post on it needs, so that each part can be looked up on the web separately.

IDEA (may be Persian): ${idea}

Rules: 3 to 6 parts; each one a concrete thing to find (a figure, a list, a rule, a comparison), named in English, specific enough to search for ("average rent by city, 2026", "home prices by city", "which cities cost least overall and why"), never vague ("background", "tips"). A narrow idea (one rule, one date) gets 3 parts at most.

Return JSON only: {"parts": ["...", "..."]}`).catch(() => "");
  const m = String(out || "").match(/\{[\s\S]*\}/);
  try {
    const v = m ? JSON.parse(m[0]) : null;
    const parts = Array.isArray(v && v.parts) ? v.parts.map((x) => String(x).trim()).filter(Boolean).slice(0, 6) : [];
    return parts;
  } catch {
    return [];
  }
}

// One idea -> its parts -> a page or two for each part -> one card grounded on all of them.
export async function researchIdea(idea) {
  needSearch();
  const q = String(idea || "").trim().slice(0, 600);
  if (q.length < 4) throw new Error("write the idea first");
  const parts = await outlineOf(q);
  const want = parts.length ? parts.map((x, i) => `${i + 1}. ${x}`).join("\n") : "(the idea itself)";
  const { text, citations } = await openaiSearch(`Find web pages that give the real, current facts for EACH part of this post, for a Persian-language Canadian / European immigration channel. Prefer ${TRUSTED}, and official statistics (Statistics Canada, CMHC, provincial sites) for figures. Prefer the most recent pages. One or two pages per part; a page may serve several parts.

IDEA (may be Persian): ${q}
PARTS TO COVER:
${want}

Answer with a JSON array only: [{"part": 1, "url": "...", "why": "one line on what this page has for that part"}]. Real URLs you actually found, no others, up to 8.`);
  const links = [...new Set([...parseJsonArray(text).map((x) => x && x.url), ...citations.map((c) => c.url), ...urlsIn(text)].filter(Boolean).map((u) => String(u).replace(/#.*$/, "")))].slice(0, 8);
  if (!links.length) throw new Error("no page about this idea was found; write it differently or add a link yourself");
  const note = `The editor's idea, researched: ${q}.${parts.length ? ` A thorough post on it covers: ${parts.join("; ")}. The card is about the WHOLE idea (its title and summary name the subject and what the sources give across these parts), never one page's narrow point.` : ""}`;
  const { topic, skipped, sources } = await buildCustomTopic({ links: links.join("\n"), note, maxLinks: 6, whole: parts.length > 0 });
  const check = await supported({ idea: parts.length ? `${q}\nA useful post covers: ${parts.join("; ")} (most of these, with real figures or rules; one part with no data is acceptable if the text says so).` : q, topic, sources });
  if (!check.ok) {
    throw new Error(`the pages found do not answer this idea${check.missing ? ` (${check.missing})` : ""}, so no card was made; write it differently or add a link yourself`);
  }
  return { topics: [{ ...topic, researched: true, idea: q, ...(parts.length ? { outline: parts } : {}) }], skipped };
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
      items.slice(i, i + 3).map(async (x) => {
        const built = await buildCustomTopic({ links: x.url, note: `Post idea found by research: ${x.angle}` });
        const check = await supported({ idea: x.angle, topic: built.topic, sources: built.sources });
        if (!check.ok) throw new Error(`does not answer "${String(x.angle).slice(0, 90)}"${check.missing ? `: ${check.missing}` : ""}`);
        return built;
      })
    );
    done.forEach((d, k) => {
      const x = items[i + k];
      if (d.status === "fulfilled") topics.push({ ...d.value.topic, researched: true, idea: x.angle, ...(subj ? { subject: subj } : {}) });
      else skipped.push({ url: x.url, error: String(d.reason && d.reason.message ? d.reason.message : d.reason).slice(0, 220) });
    });
  }
  if (!topics.length) throw new Error("none of the pages found held enough to make a post, so no card was made: " + skipped.map((s) => `${s.url} (${s.error})`).join("; "));
  return { topics, skipped };
}
