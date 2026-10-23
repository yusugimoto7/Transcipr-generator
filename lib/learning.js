// What Hamed (and whoever he lets teach) teaches the app through his notes. When he ticks "learn from this note" on an edit,
// a model reads the note and decides whether it holds a rule for future content (not a one-off
// fix of this picture or this story); a rule is stored on the editing-data branch
// (`learned/<id>.json`) and from then on goes into the prompts of that kind of content.
// The skill files in .claude/skills are where these rules are written down for the developers;
// a session working on that part copies the rules listed in Video Editing -> Lessons -> Content
// into the matching skill (see CLAUDE.md). Rules never carry facts about a particular story.

import { list, put, get, newId, storeConfigured } from "./editing/store.js";
import { openaiEnabled, openaiScript } from "./openai.js";
import { callClaude } from "./anthropic.js";
import { tenseRule } from "./today.js";

export const SCOPES = {
  design: { name: "Pictures (carousel slides, Telegram picture)", skill: "carousel-design" },
  carousel: { name: "Carousel text and caption", skill: "carousel-design" },
  telegram: { name: "Telegram news post", skill: "content-playbook" },
  story: { name: "Instagram story", skill: "instagram-story" },
  script: { name: "Video scripts", skill: "content-playbook" },
  article: { name: "Blog article", skill: "content-playbook" },
  visa: { name: "Visa-result stories (what is covered, which dates are marked, the story text and look)", skill: "content-playbook" },
};

const DIR = "learned/"; // the store allows only a plain word as the first path part
let cache = { at: 0, items: [] };

export async function allLessons({ fresh = false } = {}) {
  if (!storeConfigured()) return [];
  if (!fresh && Date.now() - cache.at < 5 * 60 * 1000) return cache.items;
  const items = (await list(DIR).catch(() => [])).map((x) => x.data).filter(Boolean);
  items.sort((a, b) => (b.at || 0) - (a.at || 0));
  cache = { at: Date.now(), items };
  return items;
}

// A rule applies to every kind it names: a note written under a picture can be about the words
// (the tense of a date, a phrase never to use), and kept only for pictures it never reached the
// text prompts. Older rules have just `scope`; an old picture rule also goes to the slide text,
// since the notes under a slide's picture were as often about its words.
function kindsOf(l) {
  if (Array.isArray(l.scopes) && l.scopes.length) return l.scopes;
  return l.scope === "design" ? ["design", "carousel"] : [l.scope];
}

// The block added to a prompt. Writing prompts always get today's date with the tense rule; the
// taught rules follow. A store that cannot be read never stops the content from being made.
export async function lessonsBlock(scope, lang = "en") {
  const dated = scope === "design" || scope === "visa" ? "" : tenseRule(lang);
  const rules = (await allLessons().catch(() => [])).filter((l) => l.active !== false && kindsOf(l).includes(scope)).slice(0, 25);
  if (!rules.length) return dated;
  const lines = rules.map((l) => `- ${lang === "fa" ? l.rule_fa || l.rule_en : l.rule_en || l.rule_fa}`).join("\n");
  return dated + (lang === "fa"
    ? `\n\nقانون‌هایی که تیم از روی بازخوردهای قبلی یاد داده (همیشه رعایتشان کن؛ هیچ‌کدام منبع فکت نیست):\n${lines}`
    : `\n\nRules the team has taught from earlier feedback (always follow them; none of them is a source of facts):\n${lines}`);
}

function parseJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

async function ask(prompt) {
  if (openaiEnabled()) {
    try {
      return await openaiScript(prompt, { maxOutputTokens: 1500 });
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
    }
  }
  return callClaude([{ role: "user", content: prompt }], false, 1200);
}

// Read one note and keep a rule if there is one. Returns { learned, lesson?, why }.
export async function learnFromNote({ scope, note, context = "", topicTitle = "", by = "" }) {
  if (!storeConfigured()) throw new Error("lessons need the editing store (EDITING_GITHUB_TOKEN)");
  if (!SCOPES[scope]) throw new Error("unknown kind of content");
  const text = String(note || "").trim().slice(0, 1500);
  if (!text) throw new Error("write the note first");
  const known = (await allLessons({ fresh: true })).filter((l) => kindsOf(l).includes(scope) && l.active !== false).map((l) => `- ${l.rule_en}`).join("\n");
  const prompt = `The owner of Sugimoto Visa, a Persian-language Canadian immigration brand, wrote this note while correcting one piece of content (${SCOPES[scope].name}).

NOTE (may be Persian): ${text}
${context ? `\nTHE CONTENT IT WAS ABOUT:\n${String(context).slice(0, 1500)}\n` : ""}${topicTitle ? `\nTOPIC: ${topicTitle}\n` : ""}
RULES ALREADY KEPT FOR THIS KIND OF CONTENT:
${known || "(none)"}

Decide whether the note carries a rule worth applying to FUTURE content of this kind, or is only a one-off fix of this piece (e.g. "replace this photo with a passport", "change the 3 to a 5", "make this title shorter" with nothing general behind it).
A rule must be general (no facts, names, numbers or dates of this particular story), short, and something a writer or designer can follow. If it repeats or contradicts a kept rule, say so instead of adding a near-duplicate.

Also decide which kinds of content the rule is about, from: ${Object.entries(SCOPES).map(([k, v]) => `${k} (${v.name})`).join(", ")}. A note written under a picture may be about the wording (tense, phrases, the call to action): then it belongs to every kind that writes text, not only to pictures.

Answer with JSON only:
{"general": true|false, "scopes": ["the kinds it applies to"], "rule_en": "the rule in one English sentence", "rule_fa": "the same rule in one Persian sentence", "duplicate_of": "the kept rule it repeats, or empty", "why": "one short sentence, in Persian, explaining your decision"}`;
  const out = parseJson(await ask(prompt));
  if (!out) throw new Error("the model's answer could not be read; try again");
  if (!out.general || !String(out.rule_en || "").trim()) return { learned: false, why: String(out.why || "این یک تغییر یک‌باره بود، نه یک قانون کلی.") };
  if (String(out.duplicate_of || "").trim()) return { learned: false, why: String(out.why || "این قانون از قبل ثبت شده است."), duplicate: out.duplicate_of };
  const scopes = [...new Set([scope, ...(Array.isArray(out.scopes) ? out.scopes : [])].filter((k) => SCOPES[k]))];
  const lesson = {
    id: newId("cl"),
    scope,
    scopes,
    skill: SCOPES[scope].skill,
    rule_en: String(out.rule_en).trim().slice(0, 400),
    rule_fa: String(out.rule_fa || "").trim().slice(0, 400),
    note: text,
    topic: String(topicTitle || "").slice(0, 200),
    by,
    at: Date.now(),
    active: true,
  };
  await put(`${DIR}${lesson.id}.json`, lesson, null, `app: content lesson ${lesson.id}`);
  cache.at = 0;
  return { learned: true, lesson, why: String(out.why || "") };
}

export async function setLessonActive(id, active) {
  if (!/^cl-[a-f0-9]{12}$/.test(String(id))) throw new Error("not found");
  const rec = await get(`${DIR}${id}.json`);
  if (!rec) throw new Error("not found");
  await put(`${DIR}${id}.json`, { ...rec.data, active: !!active }, rec.sha, `app: content lesson ${id} ${active ? "on" : "off"}`);
  cache.at = 0;
}
