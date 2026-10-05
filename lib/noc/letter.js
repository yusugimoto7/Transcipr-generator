// Employment-letter review against a NOC 2021 unit group, for Express Entry.
//
// The model reads and judges; everything that can be checked mechanically is
// checked here instead, so a confident-sounding model can't paper over it:
//   - every quote the model attributes to the letter must actually be in it;
//   - duties copied from the NOC text are detected by n-gram overlap;
//   - creditable hours are computed from the extracted dates and hours;
//   - a rewritten letter may not introduce a number, or a duty, that is not
//     in the original letter or the applicant's own answers.
// The rewrite exists to fix presentation (missing elements, vague wording,
// order), never to add experience. Misrepresentation under IRPA s.40 carries
// a five-year ban, and the applicant, not this tool, signs the declaration.

import { getUnit } from "./data.js";

export const PROGRAMS = {
  fsw: {
    name: "Federal Skilled Worker",
    hours: 1560,
    years: 10,
    rule: "At least 1 year (1,560 hours) of continuous paid skilled work (TEER 0-3) in the same NOC within the last 10 years.",
  },
  cec: {
    name: "Canadian Experience Class",
    hours: 1560,
    years: 3,
    rule: "At least 1 year (1,560 hours) of paid skilled work (TEER 0-3) in Canada, with authorization, within the 3 years before applying. Self-employment and work during full-time study do not count.",
  },
  fst: {
    name: "Federal Skilled Trades",
    hours: 3120,
    years: 5,
    rule: "At least 2 years (3,120 hours) of paid work in an eligible skilled trade within the 5 years before applying, while qualified to practise it, and meeting the NOC employment requirements for that trade.",
  },
};

// What IRCC's Express Entry document checklist asks a work reference letter
// to contain.
export const REQUIRED = [
  { key: "letterhead", label: "Official company letterhead" },
  { key: "contact", label: "Company address, phone number and email" },
  { key: "signatory", label: "Name, job title and signature of the supervisor or HR officer" },
  { key: "positions", label: "Every position held at the company" },
  { key: "job_title", label: "Job title for each position" },
  { key: "duties", label: "Duties and responsibilities for each position" },
  { key: "dates", label: "Start and end dates for each position" },
  { key: "status", label: "Whether the job is current" },
  { key: "hours", label: "Hours worked per week" },
  { key: "salary", label: "Annual salary plus benefits" },
];

// ---------------------------------------------------------------- text utils

const words = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[‘’]/g, "'").replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
const flat = (s) => words(s).join(" ");

function sentences(text) {
  return text
    .split(/\n+|(?<=[.;:])\s+|^\s*[-•*●▪]\s*/m)
    .map((s) => s.replace(/^\s*[-•*●▪\d.)]+\s*/, "").trim())
    .filter((s) => words(s).length >= 6);
}

// A quote "is in" a source if, ignoring case, punctuation and spacing, every
// piece of it (split on an ellipsis) appears there.
export function quoteFound(quote, ...sources) {
  if (!quote || !quote.trim()) return false;
  const hay = sources.filter(Boolean).map(flat).join(" | ");
  return quote
    .split(/\.\.\.|…/)
    .map(flat)
    .filter(Boolean)
    .every((piece) => hay.includes(piece));
}

// ----------------------------------------------------- NOC text in the letter

const N = 6;
function shingles(s) {
  const w = words(s);
  const out = [];
  for (let i = 0; i + N <= w.length; i++) out.push(w.slice(i, i + N).join(" "));
  return out;
}

function nocSentences(unit) {
  return [unit.lead, ...unit.duties.flatMap((s) => s.items)];
}

// Officers treat duties lifted from the NOC description as a sign the letter
// was written to fit the code rather than to describe the job. Flags any line
// of the letter where at least half of its six-word runs come from the NOC.
export function copiedFromNoc(text, unit) {
  const index = new Map();
  for (const ns of nocSentences(unit)) for (const g of shingles(ns)) if (!index.has(g)) index.set(g, ns);
  const flagged = [];
  for (const line of sentences(text)) {
    const grams = shingles(line);
    if (!grams.length) continue;
    const hits = grams.filter((g) => index.has(g));
    const ratio = hits.length / grams.length;
    if (ratio >= 0.5) flagged.push({ line, noc: index.get(hits[0]), ratio: Math.round(ratio * 100) });
  }
  return flagged;
}

// --------------------------------------------------------------------- hours

function parseDate(s, today) {
  if (!s) return null;
  if (/present|current|ongoing|now/i.test(s)) return today;
  const m = String(s).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
}

// IRCC counts at most 30 hours a week (30 h × 52 weeks = 1,560 h = one year),
// and only inside the program's look-back window, so older time is clipped.
// Overlapping jobs are counted separately, as IRCC allows for part-time work;
// two full-time jobs at once still cap at 30 h/week each, which may overstate.
export function creditedHours(roles, program, today = new Date()) {
  const p = PROGRAMS[program] || PROGRAMS.fsw;
  const windowStart = new Date(Date.UTC(today.getUTCFullYear() - p.years, today.getUTCMonth(), today.getUTCDate()));
  const rows = (roles || []).map((r) => {
    const base = { title: r.title, start: r.start, end: r.end, hoursPerWeek: r.hoursPerWeek ?? null, credited: null };
    const start = parseDate(r.start, today);
    const end = parseDate(r.end, today);
    const h = Number(r.hoursPerWeek);
    if (!start || !end || !(h > 0) || end <= start) return base;
    const from = start < windowStart ? windowStart : start;
    const weeks = end > from ? (end - from) / (7 * 24 * 3600 * 1000) : 0;
    return {
      ...base,
      hoursPerWeek: h,
      weeks: Math.floor(weeks),
      clipped: start < windowStart,
      credited: Math.floor(weeks * Math.min(h, 30)),
    };
  });
  const known = rows.filter((r) => r.credited != null);
  const total = known.reduce((a, r) => a + r.credited, 0);
  return {
    rows,
    total,
    need: p.hours,
    years: p.years,
    complete: known.length === rows.length && rows.length > 0,
    meets: total >= p.hours,
  };
}

// ------------------------------------------------------------------- prompts

function dutyList(unit) {
  const out = [];
  let n = 0;
  for (const s of unit.duties) {
    if (s.role) out.push(`  [Sub-role: ${s.role}]`);
    for (const d of s.items) out.push(`  D${++n}. ${d}`);
  }
  return out.join("\n");
}

export function dutyIndex(unit) {
  const out = {};
  let n = 0;
  for (const s of unit.duties) for (const d of s.items) out[`D${++n}`] = { text: d, role: s.role };
  return out;
}

function nocBlock(unit) {
  return `NOC 2021 V1.0 unit group ${unit.code} — ${unit.title} (TEER ${unit.teer})
Lead statement:
  ${unit.lead}
Main duties (IDs are for your answer):
${dutyList(unit)}
Employment requirements:
${unit.requirements.map((r) => `  - ${r}`).join("\n") || "  (none listed)"}
Exclusions (occupations that belong to OTHER unit groups):
${unit.exclusions.map((r) => `  - ${r}`).join("\n") || "  (none listed)"}`;
}

export function analysisPrompt({ letter, unit, program, today }) {
  const p = PROGRAMS[program];
  return `You are a meticulous reviewer preparing an Express Entry application. You review an employment reference letter the way an IRCC officer would, so the applicant can fix problems BEFORE submitting. Today is ${today}.

Program: ${p.name}. ${p.rule}
An officer must be satisfied the applicant performed the actions in the NOC lead statement and most of the main duties. Officers also question letters whose duties are copied from the NOC text, are generic, or describe a different occupation.

${nocBlock(unit)}

THE LETTER (verbatim, between the markers):
<<<LETTER
${letter}
LETTER>>>

Rules:
- Judge ONLY what the letter says. Do not assume facts that are not written. If something is missing, it is missing.
- Every "quote" you give MUST be copied exactly from the letter (it will be machine-checked). Use "" if there is none.
- A NOC duty is "covered" only if the letter describes the applicant actually doing that work. Matching keywords is not enough.
- Where the unit group lists sub-roles, decide which sub-role the letter describes and judge against that sub-role's duties.
- For "otherCodes", only use five-digit codes from the Exclusions list above, and only if the letter's duties fit that code clearly better.
- "questions" are things the applicant or employer must confirm or supply to fix a gap. Ask about facts, never suggest adding work the applicant did not do.

Return ONLY a JSON object with exactly this shape:
{
  "language": "en" | "fr" | "other",
  "elements": { ${REQUIRED.map((r) => `"${r.key}": {"status": "present"|"missing"|"unclear", "quote": "..."}`).join(", ")} },
  "signatory": {"name": string|null, "title": string|null},
  "roles": [ {"title": string, "start": "YYYY-MM-DD"|"YYYY-MM"|null, "end": "YYYY-MM-DD"|"YYYY-MM"|"present"|null, "hoursPerWeek": number|null, "salary": string|null, "quote": "..."} ],
  "subRole": string|null,
  "lead": {"status": "covered"|"partial"|"absent", "quote": "...", "note": "one sentence"},
  "duties": [ {"id": "D1", "status": "covered"|"partial"|"absent", "quote": "...", "note": "one short sentence"} ],
  "otherCodes": [ {"code": "12345", "reason": "one sentence"} ],
  "concerns": [ {"severity": "high"|"medium"|"low", "issue": "short title", "detail": "what an officer would think and why", "fix": "what to change, using only true facts"} ],
  "questions": [ "..." ],
  "verdict": "two or three plain sentences: does this letter, as written, support this NOC for this program?"
}
Include every duty ID that applies to the sub-role the letter describes (or all IDs if there are no sub-roles).`;
}

export function rewritePrompt({ letter, unit, program, analysis, answers, today }) {
  const p = PROGRAMS[program];
  return `You are revising an employment reference letter for an Express Entry (${p.name}) application, NOC ${unit.code} — ${unit.title}. Today is ${today}.

${nocBlock(unit)}

ORIGINAL LETTER (verbatim):
<<<LETTER
${letter}
LETTER>>>

FACTS CONFIRMED BY THE APPLICANT OR EMPLOYER (may be empty):
<<<FACTS
${answers || "(none)"}
FACTS>>>

PROBLEMS FOUND IN REVIEW:
${(analysis?.concerns || []).map((c) => `- [${c.severity}] ${c.issue}: ${c.fix}`).join("\n") || "- (none)"}

Write a revised letter that an officer will find complete, specific and credible.

ABSOLUTE RULES — the applicant signs a declaration that this is true:
1. Use ONLY facts stated in the ORIGINAL LETTER or the FACTS block. Never invent or embellish a duty, tool, client, team size, achievement, date, hour count, salary, benefit, name, address or phone number.
2. If a NOC main duty is not supported by the letter or FACTS, do NOT add it. List it in "notAdded".
3. Do NOT copy sentences from the NOC description. Describe each duty in the employer's own concrete terms (what was built, handled, managed, for whom, with what) using details from the inputs. It should still be clear which NOC duty each line corresponds to.
4. Where a required element is missing and not in FACTS, insert a placeholder in square brackets, e.g. [CONFIRM: hours per week], [CONFIRM: annual salary and benefits], [COMPANY EMAIL]. Never guess.
5. Keep the letter in the employer's voice, addressed "To whom it may concern" or to IRCC, ready to go on company letterhead, ending in a signature block (name, title, contact, signature, company seal if applicable).
6. Required content: letterhead line, company address/phone/email, every position held with its own dates, job title, duties as a bulleted list, current/past status, hours per week, annual salary plus benefits, signatory name and title.
7. Put duties that reflect the NOC lead statement first. Use present tense for a current job and past tense for a past one.

Return ONLY a JSON object:
{
  "letter": "the full revised letter as plain text, duties as lines starting with '- '",
  "trace": [ {"duty": "a duty line exactly as it appears in your letter (without the '- ')", "source": "exact supporting quote from the ORIGINAL LETTER or FACTS", "nocId": "D3" | null} ],
  "changes": [ "each change you made and why, one line each" ],
  "notAdded": [ {"id": "D4", "reason": "not supported by the letter or facts"} ],
  "placeholders": [ "each [ ... ] placeholder you inserted" ]
}`;
}

// ------------------------------------------------------------- verification

export function verifyAnalysis(raw, { letter, unit, program }) {
  const index = dutyIndex(unit);
  const check = (q) => (q && q.trim() ? quoteFound(q, letter) : null);

  const elements = REQUIRED.map((r) => {
    const e = raw?.elements?.[r.key] || {};
    let status = ["present", "missing", "unclear"].includes(e.status) ? e.status : "unclear";
    const found = check(e.quote);
    // A "present" claim the letter doesn't back up is not present.
    if (status === "present" && found === false) status = "unclear";
    return { ...r, status, quote: found ? e.quote : "" };
  });

  // Score against every duty of the sub-role the letter describes, not just
  // the ones the model chose to mention: an omitted duty is a duty not shown.
  const section = unit.duties.find((s) => s.role && raw?.subRole && flat(s.role) === flat(raw.subRole));
  const relevant = Object.keys(index).filter((id) => !section || index[id].role === section.role);
  const given = new Map((raw?.duties || []).filter((d) => index[d.id]).map((d) => [d.id, d]));
  const duties = relevant
    .map((id) => given.get(id) || { id, status: "absent", quote: "", note: "" })
    .map((d) => {
      const found = check(d.quote);
      let status = ["covered", "partial", "absent"].includes(d.status) ? d.status : "absent";
      if (status !== "absent" && !found) status = "unverified";
      return { id: d.id, text: index[d.id].text, role: index[d.id].role, status, quote: found ? d.quote : "", note: d.note || "" };
    });

  const leadFound = check(raw?.lead?.quote);
  let leadStatus = raw?.lead?.status || "absent";
  if (leadStatus !== "absent" && !leadFound) leadStatus = "unverified";

  const allowed = new Set(unit.exclusions.map((x) => (x.match(/\b(\d{5})\b/) || [])[1]).filter(Boolean));
  const otherCodes = (raw?.otherCodes || [])
    .filter((o) => allowed.has(String(o.code)))
    .map((o) => ({ code: String(o.code), title: getUnit(o.code)?.title || "", teer: getUnit(o.code)?.teer, reason: o.reason }));

  const copied = copiedFromNoc(letter, unit);
  const concerns = [...(raw?.concerns || [])];
  if (copied.length) {
    concerns.unshift({
      severity: "high",
      issue: "Duties copied from the NOC description",
      detail: `${copied.length} line(s) of the letter reproduce the NOC text almost word for word. Officers read this as a letter written to fit the code, not to describe the job, and may doubt the whole letter.`,
      fix: "Describe the same work in the employer's own concrete terms: the actual systems, products, clients or tasks.",
      source: "check",
    });
  }

  const roles = (raw?.roles || []).map((r) => ({ ...r, quoteOk: check(r.quote) }));
  const hours = creditedHours(roles, program);

  const counted = duties.filter((d) => d.status === "covered").length;
  const partial = duties.filter((d) => d.status === "partial").length;

  return {
    language: raw?.language || "en",
    elements,
    signatory: raw?.signatory || {},
    roles,
    hours,
    subRole: raw?.subRole || null,
    lead: { status: leadStatus, quote: leadFound ? raw.lead.quote : "", note: raw?.lead?.note || "" },
    duties,
    dutyScore: { covered: counted, partial, total: duties.length },
    copied,
    otherCodes,
    concerns,
    questions: raw?.questions || [],
    verdict: raw?.verdict || "",
  };
}

const NUM = /\d[\d,.]*\d|\d/g;
function numbersIn(s) {
  return new Set((s.replace(/\[[^\]]*\]/g, " ").match(NUM) || []).map((n) => n.replace(/[,.]/g, "")));
}

export function verifyRewrite(raw, { letter, answers, unit }) {
  const revised = String(raw?.letter || "");
  const known = numbersIn(`${letter}\n${answers || ""}`);
  const newNumbers = [...numbersIn(revised)].filter((n) => !known.has(n) && n !== unit.code);

  const trace = (raw?.trace || []).map((t) => ({
    ...t,
    supported: quoteFound(t.source, letter, answers),
  }));
  const traced = new Set(trace.map((t) => flat(t.duty)));
  const dutyLines = revised.split("\n").filter((l) => /^\s*[-•*]\s+/.test(l)).map((l) => l.replace(/^\s*[-•*]\s+/, ""));
  const untraced = dutyLines.filter((l) => !traced.has(flat(l)));

  return {
    letter: revised,
    trace,
    unsupported: trace.filter((t) => !t.supported),
    untraced,
    newNumbers,
    copied: copiedFromNoc(revised, unit),
    changes: raw?.changes || [],
    notAdded: (raw?.notAdded || []).map((n) => ({ ...n, text: dutyIndex(unit)[n.id]?.text || "" })),
    placeholders: raw?.placeholders || (revised.match(/\[[^\]]+\]/g) || []),
  };
}
