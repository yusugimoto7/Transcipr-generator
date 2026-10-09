// Lexbase (Richard Kurland's monthly immigration newsletter) as a topic
// source. It is a paid subscription that only arrives by email as a PDF, so
// the app reads it from the owner's Gmail over IMAP with an App Password:
// read-only, and only mail from the Lexbase sender is ever opened.
//
// Each issue is split into its items (policy notes and Federal Court
// summaries) and each item becomes one candidate. Court items link to the
// public decision on CanLII, built from the neutral citation; the rest link to
// /api/lexbase/<issue>/<n>, which shows that item's text. The newsletter's
// text drives ideas and grounds the card; the pipeline writes original Farsi
// from it and never reproduces it.
//
// State is in memory and rebuilt from the mailbox on start (a daily refresh
// after that). Splitting costs one cheap model call per issue, so a rebuild
// is about a cent.

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { openaiEnabled, openaiRewrite } from "../openai.js";
import { callClaude } from "../anthropic.js";
import { focusOf } from "../candidates.js";

export const LEXBASE_SENDER = process.env.LEXBASE_SENDER || "lexbase@canimmigrate.com";
const LOOKBACK_DAYS = 75; // two issues: the current one and the one before
const TTL_MS = 24 * 60 * 60 * 1000;

export function lexbaseEnabled() {
  return !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function publicBase() {
  return (process.env.PUBLIC_BASE_URL || "https://sugimoto-topic-engine.onrender.com").replace(/\/+$/, "");
}

// ── mailbox ──────────────────────────────────────────────────────────────────
// Returns [{ id, date, subject, pdfs: [{ filename, buffer }] }] for Lexbase mail
// in the look-back window. "All Mail" so an archived issue is still found.
async function fetchIssuesFromGmail() {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: String(process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, "") },
    logger: false,
  });
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);
  const out = [];
  await client.connect();
  try {
    let box = "[Gmail]/All Mail";
    try {
      await client.mailboxOpen(box, { readOnly: true });
    } catch (_) {
      box = "INBOX";
      await client.mailboxOpen(box, { readOnly: true });
    }
    const uids = await client.search({ from: LEXBASE_SENDER, since }, { uid: true });
    for (const uid of uids || []) {
      const msg = await client.fetchOne(String(uid), { source: true, envelope: true }, { uid: true });
      if (!msg || !msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const pdfs = (parsed.attachments || [])
        .filter((a) => /pdf/i.test(a.contentType || "") || /\.pdf$/i.test(a.filename || ""))
        .map((a) => ({ filename: a.filename || "lexbase.pdf", buffer: a.content }));
      if (!pdfs.length) continue;
      out.push({ id: String(uid), date: parsed.date || msg.envelope?.date || new Date(), subject: parsed.subject || "", pdfs });
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}

async function pdfText(buffer) {
  // The package's index.js runs a debug read of a test file when it thinks it
  // is the entry point; importing the library file directly avoids that.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdf = mod.default || mod;
  const data = await pdf(buffer, { max: 0 });
  return String(data.text || "");
}

// ── splitting ────────────────────────────────────────────────────────────────
const CITATION_RE = /\b(20\d\d)\s+(FC|FCA|SCC)\s+(\d{1,5})\b/;

export function canliiUrl(citation) {
  const m = String(citation || "").match(CITATION_RE);
  if (!m) return "";
  const [, year, court, num] = m;
  const path = { FC: "ca/fct", FCA: "ca/fca", SCC: "ca/scc" }[court];
  const slug = `${year}${court.toLowerCase()}${num}`;
  return `https://www.canlii.org/en/${path}/doc/${year}/${slug}/${slug}.html`;
}

function splitPrompt(text) {
  return `Below is the text of one issue of a Canadian immigration law newsletter. It contains short policy/operations notes and summaries of Federal Court decisions.

Split it into its separate items. For EACH item return:
- "title": a short English title (max 90 characters) naming the specific development or ruling
- "kind": "court" if it summarizes a court decision, otherwise "policy"
- "citation": the neutral citation if present (e.g. "2026 FC 1199"), else ""
- "excerpt": the item's own text copied EXACTLY as written, up to 1500 characters, with no words added or changed

Skip the masthead, subscription notices, table of contents, editor's notes and anything that is not a substantive item. Keep every substantive item, however short: a one-paragraph policy or operations note is its own item. Never merge two notes or two decisions into one item, and never drop one.

Return ONLY a JSON array of these objects, in the order they appear. No other text.

===== NEWSLETTER TEXT =====
${text.slice(0, 120000)}
===== END =====`;
}

function parseItems(raw) {
  const t = String(raw || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      return Array.isArray(v) ? v : null;
    } catch (_) {
      return null;
    }
  };
  // Trailing commas are removed first: models emit them, and the array
  // regex below cannot match "},]" otherwise.
  const tidy = t.replace(/,\s*([\]}])/g, "$1");
  let v = tryParse(tidy);
  if (!v) {
    const m = tidy.match(/\[\s*\{[\s\S]*\}\s*\]/);
    v = m ? tryParse(m[0]) : null;
  }
  // A short policy note is still a development; only fragments are dropped.
  return (v || []).filter((o) => o && o.title && o.excerpt && String(o.excerpt).trim().length >= 30);
}

async function splitIssue(text) {
  const prompt = splitPrompt(text);
  let raw = "";
  if (openaiEnabled()) {
    try {
      raw = await openaiRewrite(prompt);
    } catch (e) {
      if (!process.env.ANTHROPIC_API_KEY) throw e;
      raw = await callClaude([{ role: "user", content: prompt }], false, 8000);
    }
  } else {
    raw = await callClaude([{ role: "user", content: prompt }], false, 8000);
  }
  return parseItems(raw);
}

function issueKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toCandidate(issue, n, it) {
  const citation = String(it.citation || "").trim();
  const url = canliiUrl(citation) || `${publicBase()}/api/lexbase/${issue.key}/${n}`;
  const excerpt = String(it.excerpt || "").replace(/\s+/g, " ").trim();
  const ms = new Date(issue.date).getTime();
  const title = String(it.title || "").trim().slice(0, 140);
  return {
    key: `lexbase/${issue.key}/${n}`,
    source_url: url,
    title,
    snippet: excerpt.slice(0, 900),
    text: excerpt,
    source_name: "Lexbase",
    published: new Date(ms).toISOString(),
    published_ms: ms,
    newsletter: "lexbase",
    kind: it.kind === "court" ? "court" : "policy",
    citation,
    issue: issue.key,
    n,
    focus: focusOf({ title, text: excerpt }),
  };
}

// ── cache ─────────────────────────────────────────────────────────────────────
const cache = { at: 0, issues: [], items: [], status: null, inflight: null };

async function refresh() {
  const status = { checkedAt: new Date().toISOString(), mailbox: "", issues: [] };
  try {
    const mails = await fetchIssuesFromGmail();
    status.mailbox = `ok (${mails.length} Lexbase email${mails.length === 1 ? "" : "s"} in the last ${LOOKBACK_DAYS} days)`;
    const issues = [];
    for (const m of mails) {
      const key = issueKey(m.date);
      // Reuse a split already done for this issue (restarts aside).
      const prev = cache.issues.find((i) => i.key === key && i.mailId === m.id);
      if (prev) {
        issues.push(prev);
        status.issues.push({ key, subject: m.subject, items: prev.items.length, cached: true });
        continue;
      }
      let text = "";
      for (const p of m.pdfs) {
        try {
          text += "\n\n" + (await pdfText(p.buffer));
        } catch (e) {
          status.issues.push({ key, subject: m.subject, error: "PDF could not be read: " + String(e.message || e).slice(0, 120) });
        }
      }
      if (text.trim().length < 500) {
        status.issues.push({ key, subject: m.subject, error: "PDF text too short to use" });
        continue;
      }
      let split = [];
      try {
        split = await splitIssue(text);
      } catch (e) {
        status.issues.push({ key, subject: m.subject, error: "split failed: " + String(e.message || e).slice(0, 120) });
        continue;
      }
      const issue = { key, mailId: m.id, date: m.date, subject: m.subject, items: [] };
      issue.items = split.map((it, i) => toCandidate(issue, i + 1, it));
      issues.push(issue);
      status.issues.push({ key, subject: m.subject, items: issue.items.length, court: issue.items.filter((x) => x.kind === "court").length });
    }
    cache.issues = issues;
    cache.items = issues.flatMap((i) => i.items);
  } catch (e) {
    status.mailbox = "error: " + String(e.message || e).slice(0, 200);
  }
  cache.at = Date.now();
  cache.status = status;
}

// Items from recent issues plus a status report. A due refresh runs in the
// background; the first call after start returns nothing until it is done
// (or waits, when asked).
export async function getLexbaseItems({ wait = false, waitMs = 0 } = {}) {
  if (!lexbaseEnabled()) {
    return { items: [], status: { mailbox: "GMAIL_USER / GMAIL_APP_PASSWORD not set", issues: [] } };
  }
  if (Date.now() - cache.at > TTL_MS && !cache.inflight) {
    cache.inflight = refresh().finally(() => (cache.inflight = null));
  }
  if (wait && cache.inflight) await cache.inflight;
  else if (waitMs && cache.inflight) await Promise.race([cache.inflight, new Promise((r) => setTimeout(r, waitMs))]);
  return { items: cache.items, status: cache.status || { pending: true, issues: [] } };
}

// Issues newest first, each with its items, for the newsletter section.
export function getLexbaseIssues() {
  return cache.issues
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((i) => ({ key: i.key, mailId: i.mailId, date: i.date, subject: i.subject, items: i.items }));
}

export function getLexbaseItem(issueKeyStr, n) {
  return cache.items.find((it) => it.issue === issueKeyStr && String(it.n) === String(n)) || null;
}

export const _test = {
  parseItems,
  splitPrompt,
  issueKey,
  toCandidate,
  // Load issues without a mailbox, for local checks of what consumes them.
  seed(issues) {
    cache.issues = issues;
    cache.items = issues.flatMap((i) => i.items);
    cache.at = Date.now();
    cache.status = { mailbox: "seeded", issues: [] };
  },
};
