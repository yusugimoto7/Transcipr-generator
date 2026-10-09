// The newsletter section: one topic card for EVERY item of a Lexbase issue
// (each policy note and each court decision), unlike the main deck, which
// takes only the few the selector rates best. An issue is ~40 items, so the
// cards are written once per issue in the background and kept in memory; a
// restart rewrites them (about 14 cheap model calls).
//
// Items about Iranians, study permits or the Start-up Visa are written first
// and listed first: they are the brand's standing priorities.

import { getLexbaseItems, getLexbaseIssues } from "./lexbase.js";
import { writeCardsPrompt, parseTopics } from "../prompts.js";
import { openaiEnabled, openaiRewrite } from "../openai.js";
import { callClaude } from "../anthropic.js";

const BATCH = 3;
const PARALLEL = 4;
const RETRY_AFTER_MS = 5 * 60 * 1000;

async function rewrite(prompt) {
  if (openaiEnabled()) {
    try {
      return await openaiRewrite(prompt);
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
    }
  }
  return callClaude([{ role: "user", content: prompt }], false, 2000);
}

function fieldFor(it) {
  if (it.kind === "court") return "Court";
  if ((it.focus || []).includes("study")) return "Study";
  return "Policy";
}

function toCard(it, w) {
  const focus = it.focus || [];
  return {
    title_fa: w.title_fa,
    title_en: w.title_en || it.title,
    field: fieldFor(it),
    page: "CA",
    why_now: w.why_now || "",
    date: it.published ? it.published.slice(0, 10) : "",
    source_url: it.source_url,
    source_name: "Lexbase",
    snippet: (it.text || "").slice(0, 1500),
    grounding: "full",
    score: focus.length ? 92 : it.kind === "court" ? 76 : 82,
    newsletter: "lexbase",
    citation: it.citation || "",
    kind: it.kind,
    focus,
    issue: it.issue,
    n: it.n,
  };
}

// Priority items first, then policy notes, then decisions, each in the
// newsletter's own order.
function order(items) {
  const g = (it) => ((it.focus || []).length ? 0 : it.kind === "court" ? 2 : 1);
  return items.slice().sort((a, b) => g(a) - g(b) || a.n - b.n);
}

const decks = new Map(); // issue key -> { mailId, cards: Map(n -> card), writing, lastTry, errors }

async function writeMissing(d, issue) {
  d.writing = true;
  d.lastTry = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const todo = order(issue.items.filter((it) => !d.cards.has(it.n)));
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const input = batch.map((it) => ({ ...it, groundText: it.text }));
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const written = parseTopics(await rewrite(writeCardsPrompt(input, today))) || [];
          for (const w of written) {
            const it = batch[Number(w.id)];
            if (it && w.title_fa && !d.cards.has(it.n)) d.cards.set(it.n, toCard(it, w));
          }
          if (batch.every((it) => d.cards.has(it.n))) break;
        } catch (e) {
          d.errors++;
          console.log("[lexbase-deck] write failed:", String(e?.message || e).slice(0, 160));
        }
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  } finally {
    d.writing = false;
  }
}

// Cards for one issue (the latest by default). Starts or resumes writing as
// needed and returns whatever is ready; the page polls until `writing` ends.
export async function getLexbaseDeck({ issue: wanted = "", waitMs = 6000 } = {}) {
  const { status } = await getLexbaseItems({ waitMs });
  const issues = getLexbaseIssues();
  const issue = (wanted && issues.find((i) => i.key === wanted)) || issues[0];
  const list = issues.map((i) => ({ key: i.key, subject: i.subject, total: i.items.length }));
  if (!issue) {
    return { issues: list, issue: null, cards: [], writing: false, pending: !!(status && status.pending), mailbox: status?.mailbox || "" };
  }
  let d = decks.get(issue.key);
  if (!d || d.mailId !== issue.mailId) {
    d = { mailId: issue.mailId, cards: new Map(), writing: false, lastTry: 0, errors: 0 };
    decks.set(issue.key, d);
  }
  const missing = issue.items.length - d.cards.size;
  if (!d.writing && missing > 0 && (!d.lastTry || Date.now() - d.lastTry > RETRY_AFTER_MS)) {
    writeMissing(d, issue).catch(() => {});
  }
  const cards = order(issue.items)
    .map((it) => d.cards.get(it.n))
    .filter(Boolean);
  return {
    issues: list,
    issue: {
      key: issue.key,
      subject: issue.subject,
      date: issue.date,
      total: issue.items.length,
      court: issue.items.filter((it) => it.kind === "court").length,
      policy: issue.items.filter((it) => it.kind !== "court").length,
      priority: issue.items.filter((it) => (it.focus || []).length).length,
    },
    cards,
    writing: d.writing,
    missing: issue.items.length - d.cards.size,
  };
}
