// The firm's date rules for documents (lib/dateRules.js).
//   node test/dates.test.mjs
import { loadLib } from './_load.mjs';

const { dateFindings, applyDateRules } = await loadLib('dateRules.js');
let bad = 0;
const check = (ok, m) => { if (!ok) bad++; console.log(ok ? 'PASS ' : 'FAIL ', m); };

const NOW = Date.UTC(2026, 8, 28);
const day = (n) => new Date(NOW - n * 86400000).toISOString().slice(0, 10); // n days ago (negative = ahead)
const sev = (cat, facts, data = {}, type = '') => dateFindings({ category: cat }, facts, data, { now: NOW, type }).map((f) => f.severity).join(',');

check(sev('proof-of-funds', { issueDate: day(35) }) === 'high', 'a bank letter older than 1 month is serious');
check(sev('proof-of-funds', { issueDate: day(25) }) === 'medium', 'a bank letter older than 20 days needs attention');
check(sev('supporter-bank', { issueDate: day(10) }) === '', "a fresh bank letter (the sponsor's too) is fine");
check(sev('employment-letter', { issueDate: day(40) }) === 'medium', 'an employment letter older than 1 month is flagged');
check(sev('employment-letter', { issueDate: day(20) }) === '', 'a recent employment letter is fine');
check(sev('national-id', { translationDate: day(200) }) === 'medium', 'a translation older than 6 months is flagged, on any document');
check(sev('language', { testDate: day(760) }) === 'high', 'a language test older than 2 years is serious');
check(sev('language', { testDate: day(680) }) === 'medium', 'a language test expiring within 3 months needs attention');
check(sev('language', { testDate: day(300) }) === '', 'a recent language test is fine');
check(sev('medical', { examDate: day(380) }) === 'high', 'a medical exam older than 1 year is serious');
check(sev('passport', { expiryDate: day(-240) }) === 'medium', 'a passport with less than a year left needs attention');
check(sev('passport', { expiryDate: day(-90) }) === 'high', 'a passport with less than 6 months left is serious');
check(sev('passport', { expiryDate: day(3) }) === 'high', 'an expired passport is serious');
check(sev('passport', { expiryDate: day(-500) }, { visitTo: day(-600) }) === 'medium', 'a passport ending before the planned stay ends is flagged');
check(sev('spouse-status', { expiryDate: day(-100) }) === 'medium', "a spouse's permit with less than 6 months left needs attention");
check(sev('police-clearance', { issueDate: day(200) }) === 'medium' && sev('police-clearance', { issueDate: day(400) }) === 'high', 'police clearance: 6 months attention, 1 year serious');
check(sev('invitation-letter', { issueDate: day(120) }) === 'medium', 'an invitation letter older than 3 months is flagged');
check(sev('loa', { programStart: day(5) }) === 'high', 'a letter of acceptance whose program already started is serious');
check(sev('flight', { travelDate: day(2) }) === 'medium', 'a flight booking in the past is flagged');
check(sev('medical-insurance', { validFrom: day(-10), validTo: day(-200) }, {}, 'super-visa') === 'high', 'super visa insurance with less than a year of cover is serious');
check(sev('national-id', { issueDate: day(10), translationDate: day(40) }) === 'high', 'a translation dated before the original is serious');
check(sev('proof-of-funds', { issueDate: day(-30) }) === 'medium', 'a date in the future is flagged (likely a calendar slip)');

// Re-applied daily: replaces the rule's (and older platform validity) findings and recomputes the colour.
const statusOf = (fs) => (fs.some((f) => f.severity === 'high') ? 'red' : fs.some((f) => f.severity === 'medium') ? 'orange' : fs.length ? 'yellow' : 'green');
const app = { type: 'trv-outside', data: {}, documents: [
  { id: 'b', category: 'proof-of-funds', verification: { status: 'green', facts: { issueDate: day(25) }, findings: [] } },
  { id: 'p', category: 'passport', verification: { status: 'red', facts: { expiryDate: day(-800) }, findings: [{ severity: 'high', kind: 'validity', text: 'Expired on 2020-01-01.', by: 'platform' }, { severity: 'low', kind: 'typo', text: 'x', by: 'ai' }] } },
] };
check(applyDateRules(app, statusOf, NOW) === true && app.documents[0].verification.status === 'orange', 'a bank letter that aged past 20 days turns orange');
check(app.documents[1].verification.status === 'yellow' && app.documents[1].verification.findings.length === 1, 'an old platform validity finding that no longer applies is replaced; other findings stay');
check(applyDateRules(app, statusOf, NOW) === false, 'applying again the same day changes nothing');
check(applyDateRules(app, statusOf, NOW + 10 * 86400000) === true && app.documents[0].verification.status === 'red', 'ten days later the same letter is red');

console.log(bad ? `\n${bad} problem(s)` : '\nALL DATE RULE CHECKS PASS');
process.exit(bad ? 1 : 0);
