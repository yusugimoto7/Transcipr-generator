/**
 * The firm's date rules for documents: how old a document may be, how long
 * before an expiry it becomes a problem. Applied by the platform itself (not
 * left to the AI) from the dates the document check reads, and applied again
 * every day (applyDateRules), so a bank letter that was fine last week turns
 * orange, then red, as it ages.
 *
 *   Financial documents (bank letters, statements, balance certificates)
 *                                  older than 1 month: serious · older than 20 days: attention
 *   Employment letters, leave letters, pay slips
 *                                  older than 1 month: attention
 *   Any certified translation      older than 6 months: attention
 *   Language test (IELTS, CELPIP…) older than 2 years: serious (results expire) · within 3 months of that: attention
 *   Medical exam                   older than 1 year: serious · within 2 months of that: attention
 *   Passport                       expired or less than 6 months left: serious · less than 1 year: attention
 *                                  · expires before the planned end of stay: attention
 *   Any document with an expiry    expired: serious
 *   Permits / status documents     less than 6 months left: attention
 *   Police clearance               older than 6 months: attention · older than 1 year: serious
 *   Invitation, enrolment, school and completion letters
 *                                  older than 3 months: attention
 *   Letter of acceptance / PAL     program start date passed: serious
 *   Flight booking                 travel date passed: attention
 *   Travel insurance (super visa)  less than 1 year of cover, or ends within 1 year: serious
 *   Any date in the future (issue, translation, test, exam): attention — usually a Persian↔Gregorian slip
 *   A translation dated before the original was issued: serious
 *
 * Findings made here carry rule: 'date', so a re-run replaces them.
 */

const DAY = 86400000;
const MONTH = 30.44 * DAY;
const YEAR = 365.25 * DAY;

const FINANCIAL = new Set(['proof-of-funds', 'supporter-bank', 'gic', 'business-financials']);
const EMPLOYMENT = new Set(['employment-letter', 'leave-of-absence', 'supporter-income']);
const LETTERS_3M = new Set(['invitation-letter', 'enrolment-letter', 'completion-letter', 'co-op-letter', 'consent-letter']);
const PERMITS = new Set(['spouse-status', 'status-in-canada', 'residence-abroad', 'last-entry']);
const INSURANCE = new Set(['insurance', 'medical-insurance']);

/** "YYYY-MM-DD" (or longer ISO) → UTC ms; null when not a date. */
export function toTime(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(t) ? null : t;
}
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const ago = (t, now) => {
  const days = Math.round((now - t) / DAY);
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  return months < 24 ? `${months} months ago` : `${(days / 365.25).toFixed(1)} years ago`;
};
const left = (t, now) => {
  const days = Math.round((t - now) / DAY);
  return days < 60 ? `${days} days` : `${Math.round(days / 30.44)} months`;
};

/**
 * Date findings for one document.
 * @param {{category?: string}} doc
 * @param {object} facts   dates read from the document (lib/verify.js)
 * @param {object} data    the intake (planned stay, program dates)
 * @param {object} [opts]  now (ms), type (application type)
 */
export function dateFindings(doc, facts = {}, data = {}, { now = Date.now(), type = '' } = {}) {
  const out = [];
  const add = (severity, text) => out.push({ severity, kind: 'validity', text, page: null, by: 'platform', rule: 'date' });
  const cat = doc.category || '';
  const issued = toTime(facts.issueDate);
  const expiry = toTime(facts.expiryDate);
  const translated = toTime(facts.translationDate);
  const tested = toTime(facts.testDate) ?? (cat === 'language' ? issued : null);
  const examined = toTime(facts.examDate) ?? (cat === 'medical' ? issued : null);

  // Dates that cannot be right.
  for (const [label, t] of [['issue date', issued], ['translation date', translated], ['test date', tested], ['exam date', examined]]) {
    if (t && t > now + DAY) add('medium', `The ${label} ${iso(t)} is in the future — check the Persian→Gregorian conversion.`);
  }
  if (translated && issued && translated < issued - DAY) add('high', `The translation is dated ${iso(translated)}, before the original was issued (${iso(issued)}) — one of the dates is wrong.`);

  // Freshness by kind of document.
  if (FINANCIAL.has(cat) && issued && issued <= now) {
    const age = now - issued;
    if (age > MONTH) add('high', `Financial document issued ${iso(issued)} (${ago(issued, now)}) — the firm needs financial documents issued within the last month. Ask for an updated one.`);
    else if (age > 20 * DAY) add('medium', `Financial document issued ${iso(issued)} (${ago(issued, now)}) — more than 20 days old; it will need updating if submission slips past one month.`);
  }
  if (EMPLOYMENT.has(cat) && issued && issued <= now && now - issued > MONTH) {
    add('medium', `${cat === 'supporter-income' ? 'Pay slip' : cat === 'leave-of-absence' ? 'Leave letter' : 'Employment letter'} dated ${iso(issued)} (${ago(issued, now)}) — older than one month; ask for a recent one.`);
  }
  if (translated && translated <= now && now - translated > 6 * MONTH) {
    add('medium', `The certified translation is dated ${iso(translated)} (${ago(translated, now)}) — older than 6 months; consider a fresh translation.`);
  }
  if (cat === 'language' && tested && tested <= now) {
    if (now - tested > 2 * YEAR) add('high', `Language test taken ${iso(tested)} (${ago(tested, now)}) — results are valid for 2 years; a new test is needed.`);
    else if (now - tested > 2 * YEAR - 3 * MONTH) add('medium', `Language test taken ${iso(tested)} — the results expire on ${iso(tested + 2 * YEAR)}, within 3 months; they may lapse before a decision.`);
  }
  if (cat === 'medical' && examined && examined <= now) {
    if (now - examined > YEAR) add('high', `Medical exam done ${iso(examined)} (${ago(examined, now)}) — medical results are valid for 1 year; a new exam is needed.`);
    else if (now - examined > YEAR - 2 * MONTH) add('medium', `Medical exam done ${iso(examined)} — it expires on ${iso(examined + YEAR)}, within 2 months.`);
  }
  if (cat === 'police-clearance' && issued && issued <= now) {
    if (now - issued > YEAR) add('high', `Police clearance issued ${iso(issued)} (${ago(issued, now)}) — older than a year; a new certificate is needed.`);
    else if (now - issued > 6 * MONTH) add('medium', `Police clearance issued ${iso(issued)} (${ago(issued, now)}) — older than 6 months.`);
  }
  if (LETTERS_3M.has(cat) && issued && issued <= now && now - issued > 3 * MONTH) {
    add('medium', `Letter dated ${iso(issued)} (${ago(issued, now)}) — older than 3 months; ask for an updated letter.`);
  }

  // Expiry.
  if (expiry) {
    if (expiry < now) add('high', `Expired on ${iso(expiry)}.`);
    else if (cat === 'passport') {
      if (expiry - now < 6 * MONTH) add('high', `Passport expires on ${iso(expiry)} — only ${left(expiry, now)} left; renew the passport before applying.`);
      else if (expiry - now < YEAR) add('medium', `Passport expires on ${iso(expiry)} — less than a year left; IRCC issues the visa only up to the passport's expiry.`);
      const stayEnd = toTime(data.visitTo) ?? toTime(data.programEnd) ?? toTime(data.permitEndRequested);
      if (stayEnd && expiry < stayEnd) add('medium', `Passport expires on ${iso(expiry)}, before the planned end of stay (${iso(stayEnd)}); the permit or visa will be cut to the passport's expiry.`);
    } else if (PERMITS.has(cat) && expiry - now < 6 * MONTH) {
      add('medium', `Expires on ${iso(expiry)} — only ${left(expiry, now)} left; check it stays valid through processing.`);
    }
  }
  if ((cat === 'loa' || cat === 'pal') && toTime(facts.programStart) && toTime(facts.programStart) < now) {
    add('high', `The program start date ${iso(toTime(facts.programStart))} has passed — ask the school for an updated letter or deferral.`);
  }
  if (cat === 'flight' && toTime(facts.travelDate) && toTime(facts.travelDate) < now) {
    add('medium', `The booking is for ${iso(toTime(facts.travelDate))}, which has passed — update the reservation.`);
  }
  if (INSURANCE.has(cat) && /super/i.test(type)) {
    const from = toTime(facts.validFrom);
    const to = toTime(facts.validTo) ?? expiry;
    if (from && to && to - from < YEAR - DAY) add('high', `Insurance covers ${iso(from)} to ${iso(to)} — less than the one year a super visa requires.`);
    else if (to && to - now < YEAR) add('high', `Insurance ends on ${iso(to)} — a super visa needs at least one year of cover from entry.`);
  }
  return out;
}

/**
 * Re-apply the rules to every checked document of a file (today's date).
 * Mutates the documents; returns true when any status or finding changed.
 * `statusOf` is passed in to avoid a circular import with lib/verify.js.
 */
export function applyDateRules(app, statusOf, now = Date.now()) {
  let changed = false;
  for (const d of app.documents || []) {
    const v = d.verification;
    if (!v?.facts) continue;
    // Date findings from this module (and the platform's older validity checks it replaces).
    const isDateRule = (f) => f.rule === 'date' || (f.by === 'platform' && f.kind === 'validity');
    const kept = (v.findings || []).filter((f) => !isDateRule(f));
    const fresh = dateFindings(d, v.facts, app.data || {}, { now, type: app.type });
    const before = JSON.stringify((v.findings || []).filter(isDateRule).map((f) => f.text));
    if (before === JSON.stringify(fresh.map((f) => f.text))) continue;
    v.findings = [...kept, ...fresh];
    v.status = statusOf(v.findings);
    changed = true;
  }
  return changed;
}
