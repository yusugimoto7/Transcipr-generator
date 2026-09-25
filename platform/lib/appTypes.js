/**
 * Application-type registry — one entry per service the TR Visa team offers,
 * keyed to the team's own checklists (Drive: "100-3xx" = applying from
 * outside Canada, "100-4xx" = applying from inside Canada).
 *
 * Each type declares: intake steps, IRCC forms, the document checklist with
 * the SERVICE'S OWN document codes (codes are not global — in Super Visa 101
 * is the invitation letter, in PGWP 104 is the graduation letter), compiled
 * packages, the letters the platform drafts, and the process stages.
 *
 * Checklist items: { code, key, label, hint?, cond?, when?, tr?, party?, by? }
 *   code   the service's document code ('103', '107-1', '119-3')
 *   key    upload category the item is satisfied by (the classifier target)
 *   cond   condition shown to the client ("if married", "if available")
 *   when   (data) => bool — hide the item when the intake says it can't apply
 *   tr     needs the firm's translation bundle [TR]: English translation with
 *          the translator's seal + Persian copy with seal + Persian original
 *   party  'applicant' (default) | 'principal' (the spouse / parent / host /
 *          sponsor's document) | 'firm' (the firm prepares it)
 *
 * Pure data (no server imports) so client components can read it.
 */

const married = (d) => /married|common/i.test(String(d.maritalStatus || ''));
const notFemale = (d) => !String(d.sex || '').toLowerCase().startsWith('f');

const I = (code, key, label, o = {}) => ({ code: String(code), key, label, ...o });

// ---- items shared (by meaning) across the team's checklists ----------------
const FORM100 = I(100, 'internal', 'Form 100 — eligibility confirmation, signed and dated', { hint: 'Read it first, sign by hand, date it and send it with the documents.' });
const BIRTH = I(101, 'national-id', 'Birth certificate (all pages)', { tr: true });
const NID = I(102, 'national-id', 'National ID card (front and back)', { tr: true });
const NID_OPT = I(102, 'national-id', 'National ID card (front and back)', { tr: true, cond: 'if available' });
const passport = (years, minor = false) => I(103, 'passport', 'Passport — every page with a stamp or visa (current and previous)', {
  hint: `Scanned, no glare, all corners visible. A new passport is needed if it expires in less than ${years} year${years > 1 ? 's' : ''}. ${minor ? 'No signature needed under 18.' : 'Sign page 1 and use that signature on every form.'}`,
});
const PHOTO = I(104, 'photo', 'Digital photo', { hint: '3.5 × 4.5 cm, taken in the last 6 months, white or light background, neutral expression, not used on any other document.' });
const DEGREE = I(105, 'transcripts', 'Degree certificate — highest level of study', { tr: true, hint: 'If that degree was non-continuous, include the previous level too.' });
const TRANSCRIPT = I(106, 'transcripts', 'Transcripts — highest level of study', { tr: true });
const DEGREE_IF_JOB = I(105, 'transcripts', 'Degree certificate — highest level of study', { tr: true, cond: 'if related to your job' });
const TRANSCRIPT_IF_JOB = I(106, 'transcripts', 'Transcripts — highest level of study', { tr: true, cond: 'if related to your job' });
const SCHOOL_ENROL = I(105, 'enrolment-letter', 'Current school enrolment certificate', { tr: true, cond: 'if available' });
const REPORT_CARD = I(106, 'transcripts', 'Latest report card with transcripts', { tr: true });
const LANGUAGE_OPT = I(110, 'language', 'Language test result (IELTS / TOEFL / Duolingo)', { cond: 'if available — not required but better to provide' });
const FINANCIAL = I(112, 'proof-of-funds', 'Financial documents — bank balance certificate + 6-month statement', {
  hint: 'Issued by the bank in English, amount converted to CAD. Preferably not Sepah, Ansar or Ghavamin. The balance certificate is valid 1 month — get it last, in coordination with your case officer. Cash, gold and crypto are not accepted.',
});
const WORK_LETTER = I(113, 'employment-letter', 'Employment certificate and leave letter + last 3 pay slips', {
  hint: 'On letterhead: full name, date of birth, exact start/end dates ("to date" for the current job), title, main duties, salary. Your case officer reviews the text before it is printed.',
});
const WORK_LETTER_OFFER = I(113, 'employment-letter', 'Employment certificate, leave letter and job offer + last 3 pay slips', {
  hint: 'Three separate letters on letterhead: employment certificate, approved leave, and a job offer for your return (ideally a higher related position). Reviewed by your case officer before printing.',
});
const INSURANCE = I(114, 'insurance', 'Social insurance (work history) record', { tr: true });
const POLICE_SEALED = I(115, 'police-clearance', 'Police clearance certificate', { tr: true, hint: 'Ministry of Foreign Affairs and Judiciary stamps are REQUIRED on this one.' });
const MARRIAGE = I(116, 'marriage-cert', 'Marriage certificate', { tr: true, cond: 'if married', when: married });
const COURSES = I(117, 'certificates', 'Certificates of academic or professional courses', { tr: true, hint: 'No translation needed if bilingual.' });
const COURSES_OPT = I(117, 'certificates', 'Certificates of academic or professional courses', { tr: true, cond: 'if available' });
const RESIDENCE_ABROAD = I(118, 'residence-abroad', 'Residence certificate for another country', { cond: 'if you live or have lived outside your home country' });
const BUSINESS = I(119, 'business-docs', 'Business documents', {
  cond: 'if you own a business',
  hint: 'Establishment and latest-changes notices (Official Gazette), business licence, tax receipts for the last 3 years, staff insurance, professional licences.',
});
const TIES = I(120, 'ties-docs', 'Proof of ties to home country', { hint: 'Property deeds, car, other assets, or circumstances that require you at home.' });
const FLIGHT_FIRM = I(121, 'flight', 'Flight reservation', { party: 'firm' });
const HOTEL_FIRM = I(122, 'accommodation', 'Hotel reservation', { party: 'firm' });
const SPONSOR = I(123, 'supporter-bank', "Sponsor's documents", {
  cond: 'if someone sponsors you',
  hint: "All the sponsor's financial documents, a notarized undertaking of support (not needed if the sponsor is your spouse), the sponsor's passport and birth certificate, employment documents and assets.",
});
const PROFILE = I(124, 'internal', 'Form 124 — Personal Profile (completed in Word)', { hint: 'Errors in names, spelling or dates can lead to refusal.' });
const CV = I(127, 'cv', 'Resume / CV', { hint: 'Use the 127 Word template.' });
const BACKGROUND = I(128, 'internal', 'Form 128 — Background Information (dated and signed)');
const MILITARY = I(130, 'military', 'Military service completion or exemption card', { tr: true, when: notFemale });
const PREVIOUS = I(131, 'refusal-letter', 'Previous Canadian applications', {
  cond: 'if you ever applied to Canada before',
  hint: 'Submission confirmation, approval or refusal, and every form and document submitted. If refused, the officer notes (GCMS) are required — tell us right away if you do not have them.',
});
const REP = I('imm5476', 'rep-form', 'IMM 5476 — Use of a Representative (dated and signed)');
const FAMILY_REP = I('imm5713', 'rep-form', 'IMM 5713 — Use of a Family Member Representative (consent to the principal applicant)');
const POT_Q = I(111, 'questionnaire', 'Form 111 — Purpose of Travel questionnaire', { hint: 'Send it first — the firm writes the Purpose of Travel letter from it.' });
const SOP_Q = I(111, 'questionnaire', 'Form 111 — SOP questionnaire', { hint: 'Send it first — the firm writes the Statement of Purpose from it.' });
const LAST_ENTRY = (code) => I(code, 'last-entry', 'Proof of last entry to Canada', { hint: 'Entry stamp, boarding pass or flight ticket.' });

// Principal (spouse / parent) in Canada — codes 132-138.
const P_PERMIT = (who) => I(132, 'spouse-status', `${who}'s work permit`, { party: 'principal' });
const P_ID = (who) => I(133, 'supporter-id', `${who}'s birth certificate, national ID and passport (with Canadian visa label)`, { party: 'principal', tr: true });
const P_WORK = (who) => I(134, 'inviter-docs', `${who}'s employment letter${who === 'Parent' ? ' and last 3 pay slips' : ''}`, { party: 'principal', hint: 'Letterhead, full name, date of birth, exact dates, title, duties, salary — reviewed before printing.' });
const P_FUNDS = (who) => I(135, 'supporter-bank', `${who}'s proof of funds + 6-month statement`, { party: 'principal', hint: 'Valid 1 month — get it last, in coordination with your case officer.' });

// ---------------------------------------------------------------------------
// Package layouts (compiled PDFs with a table of contents).
// ---------------------------------------------------------------------------
const PKG = {
  clientInfoChildVisit: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Purpose of Travel', generatedKey: 'sop' },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'School Enrolment and Report Card', categories: ['transcripts', 'enrolment-letter'] },
      { name: 'Certificates', categories: ['certificates'] },
      { name: 'Residence in Another Country', categories: ['residence-abroad'] },
      { name: 'Flight and Hotel Reservation', categories: ['flight', 'accommodation'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoBusinessVisit: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Purpose of Travel', generatedKey: 'sop' },
      { name: 'Business Invitation Letter', generatedKey: 'business-invitation' },
      { name: 'Curriculum Vitae', categories: ['cv'] },
      { name: 'Employment Letter, Pay Slips and Leave of Absence', categories: ['employment-letter', 'leave-of-absence'] },
      { name: 'Business Documents', categories: ['business-docs'] },
      { name: 'Social Insurance Records', categories: ['insurance'] },
      { name: 'Degree Certificate and Transcripts', categories: ['transcripts'] },
      { name: 'Ties to Home Country', categories: ['ties-docs', 'title-deeds'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Flight and Hotel Reservation', categories: ['flight', 'accommodation'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoC11: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Statement of Purpose — Significant Benefit', generatedKey: 'sop' },
      { name: 'Curriculum Vitae', categories: ['cv'] },
      { name: 'Degree Certificate and Transcripts', categories: ['transcripts'] },
      { name: 'Certificates', categories: ['certificates'] },
      { name: 'Employment Letter and Pay Slips', categories: ['employment-letter'] },
      { name: 'Social Insurance Records', categories: ['insurance'] },
      { name: 'Language Test Result', categories: ['language'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Marriage Certificate and Children', categories: ['marriage-cert'] },
      { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Ties to Home Country', categories: ['ties-docs', 'title-deeds'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  businessDocs: {
    key: 'business-docs', title: 'Business Documents', filename: 'Business Documents.pdf',
    sections: [
      { name: 'Company Registration, Gazette and Licences', categories: ['business-docs'] },
      { name: 'Financial Statements and Tax Returns (3 years)', categories: ['business-financials'] },
      { name: 'Contracts and Partnership Agreements', categories: ['business-contracts'] },
      { name: 'Employees and Employment Contracts', categories: ['business-employees'] },
      { name: 'Business Premises (Deeds and Leases)', categories: ['business-premises'] },
      { name: 'Canadian Business — Business Plan, Job Offer and Progress', categories: ['business-plan'] },
    ],
  },
  clientInfoSuperVisa: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Purpose of Travel', generatedKey: 'sop' },
      { name: 'Invitation Letter', categories: ['invitation-letter'] },
      { name: 'Proof of Relationship', categories: ['relationship-proof'] },
      { name: 'Medical Insurance (Canadian insurer, $100,000+)', categories: ['medical-insurance'] },
      { name: 'Medical Exam', categories: ['medical'] },
      { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
      { name: 'Ties to Home Country', categories: ['ties-docs', 'title-deeds'] },
      { name: 'Residence in Another Country', categories: ['residence-abroad'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Place of Stay', categories: ['accommodation'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  hostDocsSuperVisa: {
    key: 'inviter-docs', title: "Inviter's Documents", filename: "Inviter's Documents.pdf",
    sections: [
      { name: 'Status in Canada (Citizenship / PR)', categories: ['host-docs'] },
      { name: 'Income — Notice of Assessment, T4 or T1', categories: ['supporter-income'] },
      { name: 'Employment Letter and Pay Slips', categories: ['inviter-docs'] },
      { name: 'Bank Statements', categories: ['supporter-bank'] },
    ],
  },
  parentDocs: {
    key: 'inviter-docs', title: "Parent's Documents", filename: "Parent's Documents.pdf",
    sections: [
      { name: "Parent's Permit in Canada", categories: ['spouse-status'] },
      { name: "Parent's Passport, Birth Certificate and ID", categories: ['supporter-id'] },
      { name: "Parent's Employment Letter and Pay Slips", categories: ['inviter-docs', 'supporter-income'] },
      { name: "Parent's Proof of Funds", categories: ['supporter-bank'] },
      { name: 'Invitation Letter', categories: ['invitation-letter'] },
      { name: 'Custodianship and Consent', categories: ['custody-doc', 'consent-letter'] },
      { name: 'Residence in Canada', categories: ['accommodation'] },
    ],
  },
  clientInfoStudy: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Statement of Purpose', generatedKey: 'sop' },
      { name: 'Letter of Acceptance', categories: ['loa'] },
      { name: 'PAL / PAL Exemption', categories: ['pal'] },
      { name: 'Curriculum Vitae', categories: ['cv'] },
      { name: 'Degree Certificate and Transcripts', categories: ['transcripts'] },
      { name: 'Language Test Result', categories: ['language'] },
      { name: 'Employment Letter', categories: ['employment-letter'] },
      { name: 'Job Offer Letter', categories: ['job-offer'] },
      { name: 'Leave of Absence Letter', categories: ['leave-of-absence'] },
      { name: 'Internship Certificate', categories: ['internship'] },
      { name: 'Certificates', categories: ['certificates'] },
      { name: 'Ties to Home Country', categories: ['ties-docs'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
      { name: 'Flight Ticket', categories: ['flight'] },
      { name: 'Accommodation Arrangement', categories: ['accommodation'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoMinor: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Study Plan', generatedKey: 'sop' },
      { name: 'Letter of Acceptance / School Letter', categories: ['loa'] },
      { name: 'PAL / LOA Exemption', categories: ['pal'] },
      { name: "Parents' Consent Letter", categories: ['consent-letter'] },
      { name: 'Custody Document', categories: ['custody-doc'] },
      { name: 'School Records and Transcripts', categories: ['transcripts'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
      { name: "Parent's Status in Canada", categories: ['spouse-status', 'status-in-canada'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoOwpInside: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Statement of Purpose', generatedKey: 'sop' },
      { name: 'Current Permit in Canada', categories: ['status-in-canada'] },
      { name: 'Proof of Last Entry', categories: ['last-entry'] },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Curriculum Vitae', categories: ['cv'] },
      { name: 'Degree Certificate and Transcripts', categories: ['transcripts'] },
      { name: 'Employment Documents', categories: ['employment-letter', 'job-offer'] },
      { name: 'Medical Exam', categories: ['medical'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  familyMemberStatus: {
    key: 'family-status', title: "Family Member's Proof of Status", filename: "Family Member Proof of Status.pdf",
    sections: [
      { name: "Spouse's Study / Work Permit", categories: ['spouse-status'] },
      { name: "Spouse's Passport and ID", categories: ['supporter-id'] },
      { name: "Spouse's Enrolment / Employment Documents", categories: ['inviter-docs', 'supporter-income'] },
      { name: "Spouse's Financial Documents", categories: ['supporter-bank'] },
    ],
  },
  clientInfoOwpOutside: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Purpose of Travel', generatedKey: 'sop' },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Curriculum Vitae', categories: ['cv'] },
      { name: 'Degree Certificate and Transcripts', categories: ['transcripts'] },
      { name: 'Employment Letter, Pay Slips and Leave of Absence', categories: ['employment-letter', 'leave-of-absence', 'job-offer'] },
      { name: 'Social Insurance Records', categories: ['insurance'] },
      { name: 'Certificates', categories: ['certificates'] },
      { name: 'Ties to Home Country', categories: ['ties-docs', 'title-deeds'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
      { name: 'Flight Ticket', categories: ['flight'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  inviterDocs: {
    key: 'inviter-docs', title: "Inviter's Documents", filename: "Inviter's Documents.pdf",
    sections: [
      { name: 'Invitation Letter', categories: ['invitation-letter'] },
      { name: "Inviter's Status in Canada", categories: ['spouse-status', 'host-docs'] },
      { name: "Inviter's Passport and ID", categories: ['supporter-id'] },
      { name: "Inviter's Employment and Income", categories: ['inviter-docs', 'supporter-income'] },
      { name: "Inviter's Bank Statements", categories: ['supporter-bank'] },
      { name: "Inviter's Residence (Lease / Title Deed)", categories: ['supporter-deeds'] },
    ],
  },
  clientInfoPgwp: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Statement of Purpose', generatedKey: 'sop' },
      { name: 'Completion of Studies Letter', categories: ['completion-letter'] },
      { name: 'Final Transcript', categories: ['transcripts'] },
      { name: 'Study Permit and Letter of Acceptance', categories: ['status-in-canada', 'loa'] },
      { name: 'Tuition Payment History', categories: ['deposit'] },
      { name: 'Language Test Result', categories: ['language'] },
      { name: 'Employment / Job Offer', categories: ['employment-letter', 'job-offer'] },
      { name: 'Proof of Last Entry', categories: ['last-entry'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoVisit: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Purpose of Travel', generatedKey: 'sop' },
      { name: 'Travel Itinerary', categories: ['flight', 'accommodation'] },
      { name: 'Employment Letter, Pay Slips and Leave of Absence', categories: ['employment-letter', 'leave-of-absence'] },
      { name: 'Social Insurance Records', categories: ['insurance'] },
      { name: 'Curriculum Vitae', categories: ['cv'] },
      { name: 'Degree Certificate and Transcripts', categories: ['transcripts'] },
      { name: 'Ties to Home Country', categories: ['ties-docs', 'title-deeds'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Military Service Card', categories: ['military'] },
      { name: 'Police Clearance Certificate', categories: ['police-clearance'] },
      { name: 'Previous Travel History', categories: ['travel-history'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoStudyInside: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Statement of Purpose', generatedKey: 'sop' },
      { name: 'Current Study Permit', categories: ['status-in-canada'] },
      { name: 'Letter of Acceptance / Enrolment Letter', categories: ['loa'] },
      { name: 'Transcripts and Academic Standing', categories: ['transcripts'] },
      { name: 'Tuition Payment History', categories: ['deposit'] },
      { name: 'Proof of Last Entry', categories: ['last-entry'] },
      { name: 'Language Test Result', categories: ['language'] },
      { name: 'Medical Exam', categories: ['medical'] },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoVisitorRecord: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Reason for Extending My Stay', generatedKey: 'sop' },
      { name: 'Current Status in Canada', categories: ['status-in-canada'] },
      { name: 'Proof of Last Entry', categories: ['last-entry'] },
      { name: 'Documents Supporting the Reason to Stay', categories: ['ties-docs'] },
      { name: 'Proof of Funds for the Extended Stay', categories: ['proof-of-funds'] },
      { name: 'Host / Family Support in Canada', categories: ['host-docs', 'invitation-letter'] },
      { name: 'Medical Exam', categories: ['medical'] },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  clientInfoTrvInside: {
    key: 'client-info', title: 'Client Information', filename: 'Client Information.pdf',
    sections: [
      { name: 'Purpose of Travel', generatedKey: 'sop' },
      { name: 'Current Permit in Canada', categories: ['status-in-canada'] },
      { name: 'Proof of Last Entry', categories: ['last-entry'] },
      { name: 'Employment / Enrolment in Canada', categories: ['employment-letter', 'loa'] },
      { name: 'Marriage Certificate', categories: ['marriage-cert'] },
      { name: 'Birth Certificate and National Identity Card', categories: ['national-id'] },
      { name: 'Other Supporting Documents', catchAll: true },
    ],
  },
  financialProof: {
    key: 'financial-proof', title: 'Financial Support Proof', filename: 'Financial Support Proof.pdf',
    sections: [
      { name: 'Financial Cover Letter', generatedKey: 'financial-cover-letter' },
      { name: 'Financial Summary Report', generatedKey: 'financial-summary' },
      { name: 'Deposit Payment Confirmation', categories: ['deposit', 'gic'] },
      {
        name: 'My Bank Statement',
        categories: ['proof-of-funds'],
        children: [{ name: 'Source of My Money', categories: ['source-of-funds'] }],
      },
      { name: 'My Title Deeds', categories: ['title-deeds'] },
      {
        name: "My Supporter's Documents",
        supporter: true,
        children: [
          { name: 'Affidavit of Financial Support', categories: ['affidavit-support'] },
          { name: 'Bank Statements', categories: ['supporter-bank'] },
          { name: 'Pay Slips / Employment Letter', categories: ['supporter-income'] },
          { name: 'Title Deeds', categories: ['supporter-deeds'] },
          { name: 'Birth Certificate / National ID', categories: ['supporter-id'] },
        ],
      },
    ],
  },
};

// Letters the platform drafts. `primary` = the guided-questions letter, stored as 'sop'.
const LETTER = {
  potBusiness: { key: 'sop', title: 'Purpose of Travel', kind: 'business-visit', primary: true, word: true },
  businessInvitation: { key: 'business-invitation', title: 'Business Invitation Letter', kind: 'business-invitation', word: true },
  sopC11: { key: 'sop', title: 'Statement of Purpose — Significant Benefit', kind: 'c11', primary: true, word: true },
  potSuperVisa: { key: 'sop', title: 'Purpose of Travel', kind: 'super-visa', primary: true, word: true },
  sopIranianOwp: { key: 'sop', title: 'Purpose of Travel', kind: 'iranian-owp', primary: true, word: true },
  parentInvitation: { key: 'invitation-letter', title: 'Invitation Letter (for the parent in Canada to sign)', kind: 'invitation', word: true },
  sop: { key: 'sop', title: 'Statement of Purpose (Study Plan)', kind: 'study', primary: true, word: true },
  studyPlanMinor: { key: 'sop', title: 'Study Plan', kind: 'study-minor', primary: true, word: true },
  sopOwp: { key: 'sop', title: 'Statement of Purpose', kind: 'owp', primary: true, word: true },
  pot: { key: 'sop', title: 'Purpose of Travel', kind: 'visit', primary: true, word: true },
  sopStudyInside: { key: 'sop', title: 'Statement of Purpose', kind: 'study-inside', primary: true, word: true },
  potVisitorRecord: { key: 'sop', title: 'Letter of Explanation — Extension of Stay', kind: 'visitor-record', primary: true, word: true },
  sopPgwp: { key: 'sop', title: 'Statement of Purpose', kind: 'pgwp', primary: true, word: true },
  finCover: { key: 'financial-cover-letter', title: 'Financial Cover Letter', kind: 'financial-cover', word: true },
  finSummary: { key: 'financial-summary', title: 'Financial Summary Report', kind: 'financial-summary', word: true },
  submission: { key: 'submission-letter', title: 'Submission Letter', kind: 'submission', word: true, rep: true },
  palExemption: { key: 'pal-exemption', title: 'PAL / LOA Exemption Letter', kind: 'pal-exemption', word: true, when: (d) => d.palExempt === true || d.palExempt === 'yes' },
  invitation: { key: 'invitation-letter', title: 'Invitation Letter (for the host to sign)', kind: 'invitation', word: true },
  explanation: { key: 'letter-of-explanation', title: 'Letter of Explanation', kind: 'explanation', word: true, when: (d) => d.previousRefusal === true },
  reconsideration: { key: 'reconsideration-letter', title: 'Reconsideration Request Letter', kind: 'reconsideration', primary: true, word: true },
  webformText: { key: 'webform-text', title: 'IRCC Webform Text', kind: 'webform', word: true },
};

// IRCC forms. (The TR team's checklists list only IMM 5476 / 5713; the rest
// are filled by the firm from forms 124 and 128.)
const F = {
  imm5713: { key: 'imm5713', label: 'IMM 5713 — Use of a Family Member Representative' },
  imm5646: { key: 'imm5646', label: 'IMM 5646 — Custodianship Declaration' },
  imm1294: { key: 'imm1294', label: 'IMM 1294 — Study Permit (outside Canada)' },
  imm1295: { key: 'imm1295', label: 'IMM 1295 — Work Permit (outside Canada)' },
  imm5257: { key: 'imm5257', label: 'IMM 5257 — Temporary Resident Visa' },
  imm5257b: { key: 'imm5257b', label: 'IMM 5257B — Schedule 1 (background)' },
  imm5645: { key: 'imm5645', label: 'IMM 5645 — Family Information' },
  imm5476: { key: 'imm5476', label: 'IMM 5476 — Use of a Representative', rep: true },
  imm5710: { key: 'imm5710', label: 'IMM 5710 — Work Permit (inside Canada)' },
  imm5709: { key: 'imm5709', label: 'IMM 5709 — Study Permit (inside Canada)' },
  imm5708: { key: 'imm5708', label: 'IMM 5708 — Extend Stay / Change Conditions as a Visitor' },
  imm5744: { key: 'imm5744', label: 'IMM 5744 — ATIP consent' },
};

const STAGES_DEFAULT = ['documents', 'final-files', 'client-confirmation', 'submitted', 'post-visa', 'decision'];
const STAGES_STUDY = ['admission', ...STAGES_DEFAULT];

// Group order in the "new file" picker.
export const TYPE_GROUPS = [
  'Study — outside Canada',
  'Study — inside Canada',
  'Work — outside Canada',
  'Work — inside Canada',
  'Visit — outside Canada',
  'Visit — inside Canada',
  'After a decision',
];

export const APP_TYPES = {
  /* ---------------------------- 100-3xx: outside ---------------------------- */
  'study-permit': {
    key: 'study-permit', service: '100-301', title: 'Study Permit — Main Applicant', group: 'Study — outside Canada', where: 'outside',
    description: 'The student, applying from abroad with a Letter of Acceptance (IMM 1294).',
    steps: ['personal', 'passport', 'contact', 'family', 'study', 'finances', 'education', 'language', 'history', 'ties'],
    forms: [F.imm1294, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [FORM100, BIRTH, NID, passport(2), PHOTO, DEGREE, TRANSCRIPT,
      I(107, 'loa', 'Letter of Acceptance (final LOA)', { hint: 'A Pre-Offer Letter is accepted while the final LOA is pending.' }),
      I('107-1', 'pal', 'Provincial / Territorial Attestation Letter (PAL / TAL)'),
      I(108, 'scholarship', 'Funding or scholarship letter', { cond: 'if the school awarded funding' }),
      I(109, 'deposit', 'Official tuition deposit receipt from the school', { hint: "Issued by the school after the first-term payment. Your own bank receipt isn't accepted." }),
      I(110, 'language', 'Language test result (IELTS / TOEFL / Duolingo)', { hint: 'Valid for 2 years.' }),
      SOP_Q, FINANCIAL, WORK_LETTER_OFFER, INSURANCE, POLICE_SEALED, MARRIAGE, COURSES, RESIDENCE_ABROAD, BUSINESS, TIES,
      FLIGHT_FIRM, HOTEL_FIRM, SPONSOR, PROFILE,
      I(125, 'co-op-letter', 'Co-op letter', { cond: 'if the program has a co-op term' }),
      I(126, 'research-proposal', 'Research proposal', { cond: "PhD, postdoc and research master's only", hint: 'Topic, objectives, methods, relevance to your career, Canadian supervisor (name, title, university, email), previous supervisor, related papers.' }),
      CV, BACKGROUND, MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoStudy, PKG.financialProof],
    letters: [LETTER.sop, LETTER.finCover, LETTER.finSummary, LETTER.palExemption, LETTER.explanation, LETTER.submission],
    stages: STAGES_STUDY,
  },
  'owp-outside': {
    key: 'owp-outside', service: '100-302', title: 'Work Permit — Spouse of a Student', group: 'Work — outside Canada', where: 'outside',
    description: 'The spouse accompanying a student, applying from abroad for an open work permit (IMM 1295).',
    steps: ['personal', 'passport', 'contact', 'family', 'spouseInCanada', 'education', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm1295, F.imm5257b, F.imm5645, F.imm5476, F.imm5713],
    checklist: [FORM100, BIRTH, NID, passport(2), PHOTO, DEGREE, TRANSCRIPT,
      I(110, 'language', 'Language test result', { cond: 'not required for the spouse — better to provide if available' }),
      FINANCIAL, WORK_LETTER, INSURANCE, POLICE_SEALED,
      I(116, 'marriage-cert', 'Marriage certificate', { tr: true }),
      COURSES, RESIDENCE_ABROAD, BUSINESS, TIES, FLIGHT_FIRM, HOTEL_FIRM, PROFILE, CV, BACKGROUND,
      I(129, 'sop', 'Purpose of Travel', { party: 'firm', hint: 'Tailored to the applicant — the 129 sample is for ideas only.' }),
      MILITARY, PREVIOUS, REP, FAMILY_REP],
    packages: [PKG.clientInfoOwpOutside, PKG.financialProof],
    letters: [LETTER.pot, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'trv-child-of-student': {
    key: 'trv-child-of-student', service: '100-303', title: 'Visitor Visa — Child of a Student', group: 'Visit — outside Canada', where: 'outside',
    description: "A child accompanying a student on a visitor visa (IMM 5257).",
    steps: ['personal', 'passport', 'contact', 'family', 'minor', 'visit', 'history'],
    forms: [F.imm5257, F.imm5476, F.imm5713],
    checklist: [FORM100, BIRTH, NID_OPT, passport(1, true), PHOTO, SCHOOL_ENROL, RESIDENCE_ABROAD, FLIGHT_FIRM, HOTEL_FIRM, BACKGROUND, PREVIOUS, REP, FAMILY_REP],
    packages: [PKG.clientInfoChildVisit],
    letters: [LETTER.pot, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'owp-worker-spouse': {
    key: 'owp-worker-spouse', service: '100-304', title: 'Work Permit — Spouse of a Foreign Worker', group: 'Work — outside Canada', where: 'outside',
    description: 'The spouse of a worker already in Canada, applying from abroad for an open work permit (IMM 1295).',
    steps: ['personal', 'passport', 'contact', 'family', 'spouseInCanada', 'education', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm1295, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [FORM100, BIRTH, NID, passport(2), PHOTO,
      I(110, 'language', 'Language test result', { cond: 'not required for the spouse — better to provide if available' }),
      POT_Q, FINANCIAL, WORK_LETTER, INSURANCE, POLICE_SEALED,
      I(116, 'marriage-cert', 'Marriage certificate', { tr: true }),
      RESIDENCE_ABROAD, BUSINESS, TIES, FLIGHT_FIRM, PROFILE, CV, BACKGROUND,
      I(129, 'sop', 'Purpose of Travel', { party: 'firm' }),
      MILITARY, PREVIOUS, REP,
      P_PERMIT('Spouse'), P_ID('Spouse'), P_WORK('Spouse'), P_FUNDS('Spouse'),
      I(136, 'supporter-income', "Spouse's last 3 pay slips", { party: 'principal' }),
      I(137, 'invitation-letter', 'Invitation letter from your spouse in Canada', { party: 'principal', hint: 'From the firm sample. Notarization not required; reviewed with your case officer.' }),
      I(138, 'accommodation', "Spouse's residence in Canada — deed or lease", { party: 'principal' })],
    packages: [PKG.clientInfoOwpOutside, PKG.inviterDocs, PKG.financialProof],
    letters: [LETTER.pot, LETTER.invitation, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'study-permit-minor': {
    key: 'study-permit-minor', service: '100-305', title: 'Study Permit — Child of a Student', group: 'Study — outside Canada', where: 'outside',
    description: 'A school-age child accompanying a student, applying from abroad (IMM 1294).',
    steps: ['personal', 'passport', 'contact', 'family', 'minor', 'study', 'finances', 'education', 'history'],
    forms: [F.imm1294, F.imm5645, F.imm5476, F.imm5713],
    checklist: [FORM100, BIRTH, NID_OPT, passport(2, true), PHOTO, SCHOOL_ENROL, REPORT_CARD, RESIDENCE_ABROAD, FLIGHT_FIRM, HOTEL_FIRM, BACKGROUND, PREVIOUS, REP, FAMILY_REP],
    packages: [PKG.clientInfoMinor, PKG.financialProof],
    letters: [LETTER.studyPlanMinor, LETTER.finCover, LETTER.finSummary, LETTER.palExemption, LETTER.submission],
    stages: STAGES_STUDY,
  },
  'study-permit-child-of-worker': {
    key: 'study-permit-child-of-worker', service: '100-306', title: "Study Permit — Child of a Worker (parent's permit)", group: 'Study — outside Canada', where: 'outside',
    description: 'A school pupil joining a parent who works in Canada — travelling with the other parent, a relative, or alone (IMM 1294 + custodianship).',
    steps: ['personal', 'passport', 'contact', 'family', 'minor', 'study', 'finances', 'education', 'history'],
    forms: [F.imm1294, F.imm5645, F.imm5476, F.imm5646],
    checklist: [FORM100, BIRTH, NID_OPT, passport(1, true), PHOTO, SCHOOL_ENROL, REPORT_CARD,
      I(107, 'loa', 'Letter of Acceptance from the school', { cond: 'if available' }),
      COURSES_OPT, RESIDENCE_ABROAD, FLIGHT_FIRM,
      I(122, 'accommodation', "Parent's accommodation in Canada (or lease)"),
      SPONSOR, PROFILE, BACKGROUND,
      I(129, 'sop', 'Purpose of Travel', { party: 'firm' }),
      PREVIOUS, REP,
      I(138, 'consent-letter', 'Consent to travel — signed by the parent who is not accompanying the child'),
      P_PERMIT('Parent'), P_ID('Parent'), P_WORK('Parent'), P_FUNDS('Parent'),
      I(136, 'invitation-letter', 'Invitation letter from the parent in Canada', { party: 'principal', hint: 'From the firm sample. Notarization not required.' }),
      I(137, 'custody-doc', 'Custodianship declaration (IMM 5646)', { party: 'principal', hint: 'Completed and signed by the parent in Canada — for a child travelling with one parent, relatives, or alone. Notarization recommended.' })],
    packages: [PKG.clientInfoMinor, PKG.parentDocs, PKG.financialProof],
    letters: [LETTER.studyPlanMinor, LETTER.parentInvitation, LETTER.finCover, LETTER.finSummary, LETTER.palExemption, LETTER.submission],
    stages: STAGES_STUDY,
  },
  'trv-outside': {
    key: 'trv-outside', service: '100-307', title: 'Visitor Visa (TRV)', group: 'Visit — outside Canada', where: 'outside',
    description: 'A visit invited by a relative or friend in Canada (IMM 5257).',
    steps: ['personal', 'passport', 'contact', 'family', 'visit', 'host', 'education', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm5257, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [FORM100, BIRTH, NID, passport(2), PHOTO, DEGREE_IF_JOB, TRANSCRIPT_IF_JOB,
      I(107, 'host-docs', 'Invitation letter and the inviter\'s documents', { party: 'principal', hint: "Inviter's passport, Canadian status (PR card / study or work permit), birth certificate, employment letter, 6 months of bank statements, pay slips, property documents, NOA / T4 / T1, and anything explaining the reason for the trip." }),
      I(108, 'relationship-proof', 'Proof of relationship to the inviter', { tr: true, hint: 'Birth certificates showing the relationship, plus 4–5 family or friendship photos.' }),
      LANGUAGE_OPT, POT_Q, FINANCIAL, WORK_LETTER, INSURANCE, MARRIAGE, RESIDENCE_ABROAD, BUSINESS, TIES, FLIGHT_FIRM,
      I(122, 'accommodation', "Accommodation — the host's house deed or lease in Canada", { party: 'principal' }),
      SPONSOR, PROFILE, BACKGROUND, MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoVisit, PKG.inviterDocs, PKG.financialProof],
    letters: [LETTER.pot, LETTER.invitation, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'trv-spouse': {
    key: 'trv-spouse', service: '100-308', title: 'Visitor Visa — Accompanying Spouse', group: 'Visit — outside Canada', where: 'outside',
    description: "The spouse travelling with a visitor-visa applicant (IMM 5257). The inviter's documents sit in the principal's file.",
    steps: ['personal', 'passport', 'contact', 'family', 'visit', 'education', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm5257, F.imm5257b, F.imm5645, F.imm5476, F.imm5713],
    checklist: [FORM100, BIRTH, NID, passport(2), PHOTO, DEGREE_IF_JOB, TRANSCRIPT_IF_JOB, LANGUAGE_OPT, FINANCIAL, WORK_LETTER, INSURANCE,
      I(116, 'marriage-cert', 'Marriage certificate', { tr: true }),
      RESIDENCE_ABROAD, BUSINESS, TIES, FLIGHT_FIRM,
      I(122, 'accommodation', "Accommodation — the host's house deed or lease in Canada", { party: 'principal' }),
      PROFILE, BACKGROUND, MILITARY, PREVIOUS, REP, FAMILY_REP],
    packages: [PKG.clientInfoVisit, PKG.financialProof],
    letters: [LETTER.pot, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'trv-child': {
    key: 'trv-child', service: '100-309', title: 'Visitor Visa — Accompanying Child', group: 'Visit — outside Canada', where: 'outside',
    description: 'A dependent child travelling with a parent who is the principal visitor (IMM 5257).',
    steps: ['personal', 'passport', 'contact', 'family', 'minor', 'visit', 'history'],
    forms: [F.imm5257, F.imm5476, F.imm5713],
    checklist: [FORM100, BIRTH, NID_OPT, passport(2, true), PHOTO, SCHOOL_ENROL,
      I(106, 'transcripts', 'Latest report card with transcripts', { tr: true, cond: 'if applicable' }),
      I(113, 'employment-letter', 'Employment certificate and leave letter', { cond: 'if applicable' }),
      COURSES_OPT, RESIDENCE_ABROAD, FLIGHT_FIRM, HOTEL_FIRM, BACKGROUND,
      I(130, 'military', 'Military service card', { tr: true, cond: 'if applicable', when: notFemale }),
      PREVIOUS, REP, FAMILY_REP],
    packages: [PKG.clientInfoChildVisit],
    letters: [LETTER.pot, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'trv-business': {
    key: 'trv-business', service: '100-310', title: 'Visitor Visa — Business', group: 'Visit — outside Canada', where: 'outside',
    description: 'A business visit — meetings, conferences, trade events (IMM 5257). The firm drafts the business invitation.',
    steps: ['personal', 'passport', 'contact', 'family', 'visit', 'businessVisit', 'education', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm5257, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [FORM100, BIRTH, NID, passport(1), PHOTO, DEGREE_IF_JOB, TRANSCRIPT_IF_JOB,
      I(107, 'invitation-letter', 'Business invitation letter', { party: 'firm', hint: "Written by the firm to match the applicant's CV and work background." }),
      LANGUAGE_OPT, POT_Q, FINANCIAL, WORK_LETTER, INSURANCE, MARRIAGE, RESIDENCE_ABROAD, BUSINESS, TIES, FLIGHT_FIRM, HOTEL_FIRM,
      SPONSOR, PROFILE, CV, BACKGROUND, MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoBusinessVisit, PKG.financialProof],
    letters: [LETTER.potBusiness, LETTER.businessInvitation, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'imp-c11': {
    key: 'imp-c11', service: '100-311', title: 'Work Permit — IMP C11 (Entrepreneur / Significant Benefit)', group: 'Work — outside Canada', where: 'outside',
    description: 'A business owner starting or running a business in Canada that brings significant benefit (IMM 1295, LMIA-exempt C11).',
    steps: ['personal', 'passport', 'contact', 'family', 'c11', 'education', 'language', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm1295, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [FORM100, BIRTH, NID, passport(2), PHOTO, DEGREE, TRANSCRIPT,
      I(110, 'language', 'Language test result (IELTS / TOEFL / Duolingo)', { cond: 'not required but better to provide' }),
      POT_Q, FINANCIAL, WORK_LETTER, INSURANCE, POLICE_SEALED,
      I(116, 'marriage-cert', 'Marriage certificate and children\'s birth documents', { tr: true, cond: 'if married / if you have children' }),
      COURSES, RESIDENCE_ABROAD,
      I('119-1', 'business-docs', 'Existing business — registration, Gazette, licence, articles', { hint: 'Company Registration Certificate, establishment and changes notices, Articles of Incorporation.' }),
      I('119-1', 'business-financials', 'Existing business — financial statements and tax returns (last 3 years)', { hint: 'Balance sheet, profit and loss, company tax returns, company bank accounts.' }),
      I('119-2', 'business-contracts', 'Contracts and partnership agreements'),
      I('119-3', 'business-employees', 'Employees — list with duties + employment contracts'),
      I('119-4', 'business-premises', 'Business premises — ownership deeds or lease agreements'),
      I('119-5', 'business-plan', 'Canadian business — business plan, job offer, offer-of-employment number, proof of progress', { party: 'principal', hint: 'Include the link between your home company and the Canadian company, and evidence the plan is under way (e.g. invoices).' }),
      TIES, FLIGHT_FIRM,
      I(122, 'accommodation', 'Accommodation — hotel (firm) or the address and contact details of relatives/friends'),
      PROFILE, CV, BACKGROUND, MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoC11, PKG.businessDocs, PKG.financialProof],
    letters: [LETTER.sopC11, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'super-visa': {
    key: 'super-visa', service: '100-312', title: 'Super Visa (Parents & Grandparents)', group: 'Visit — outside Canada', where: 'outside',
    description: 'A parent or grandparent of a Canadian citizen or permanent resident — long stays, with Canadian medical insurance and a minimum income for the host (IMM 5257).',
    steps: ['personal', 'passport', 'contact', 'family', 'visit', 'host', 'superVisa', 'history', 'tiesReturn'],
    forms: [F.imm5257, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [FORM100,
      I(101, 'invitation-letter', 'Invitation letter from your child or grandchild (citizen / PR)', { party: 'principal', hint: 'Must promise financial support for the whole visit and list the people in their household.' }),
      I(102, 'supporter-income', "Inviter's financial documents — status, NOA / T4 / T1, employment letter, pay slips, bank balance", { party: 'principal', hint: "The inviter's income must meet the minimum for their household size (LICO)." }),
      passport(1), PHOTO, POT_Q,
      I(112, 'relationship-proof', "Proof of relationship — your and the inviter's birth certificates", { tr: true }),
      I(113, 'medical-insurance', 'Medical insurance from a Canadian insurance company — at least $100,000 coverage'),
      I(114, 'medical', 'Medical exam by an IRCC panel physician'),
      POLICE_SEALED, RESIDENCE_ABROAD, TIES, FLIGHT_FIRM,
      I(122, 'accommodation', "Place of stay — the host's address and property document", { party: 'principal' }),
      PROFILE, BACKGROUND, MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoSuperVisa, PKG.hostDocsSuperVisa],
    letters: [LETTER.potSuperVisa, LETTER.invitation, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },

  /* ---------------------------- 100-4xx: inside ---------------------------- */
  'iranian-owp': {
    key: 'iranian-owp', service: '100-401', title: 'Open Work Permit — Iranian Nationals (public policy)', group: 'Work — inside Canada', where: 'inside',
    description: 'An Iranian national in Canada applying for an open work permit under the public policy (IMM 5710).',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'education', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm5710, F.imm5476],
    checklist: [FORM100, BIRTH, passport(2), PHOTO,
      I(107, 'status-in-canada', 'Your current work permit'),
      I(108, 'employment-letter', 'Employment documents — employment letter, last 3 pay slips'),
      POT_Q,
      I(112, 'proof-of-funds', 'Proof of funds — bank balance + 6-month statement, pay slips, tax; support letter if sponsored'),
      I(116, 'marriage-cert', 'Marriage certificate', { tr: true, when: married }),
      PROFILE, BACKGROUND, LAST_ENTRY(129), MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoOwpInside],
    letters: [LETTER.sopIranianOwp, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  pgwp: {
    key: 'pgwp', service: '100-402', title: 'Post-Graduation Work Permit (PGWP)', group: 'Work — inside Canada', where: 'inside',
    description: 'A graduate of a Canadian DLI applying from inside Canada (IMM 5710).',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'pgwp', 'history', 'tiesReturn'],
    forms: [F.imm5710, F.imm5476],
    checklist: [FORM100, BIRTH,
      I(102, 'status-in-canada', 'Study permit'),
      I(103, 'passport', 'Passport (all pages) and valid TRV, plus any permit you hold in Canada', { hint: 'A new passport is needed if it expires in less than 2 years.' }),
      I(104, 'completion-letter', 'Graduation confirmation letter from the school'),
      I(105, 'transcripts', 'Transcripts of the program'),
      I(106, 'deposit', 'Tuition payment receipts for the completed terms'),
      I(107, 'loa', 'Original Letter of Acceptance'),
      I(110, 'language', 'Language test result (IELTS / TOEFL / CELPIP / Duolingo)'),
      PROFILE, BACKGROUND, MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoPgwp],
    letters: [LETTER.sopPgwp, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'trv-inside': {
    key: 'trv-inside', service: '100-403', title: 'Visitor Visa (TRV) — for Work / Study Permit Holders', group: 'Visit — inside Canada', where: 'inside',
    description: 'A permit holder in Canada who needs a visa counterfoil to re-enter after travelling (IMM 5257). Decided by a visa office abroad; does NOT change status in Canada.',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'visit', 'history', 'tiesReturn'],
    forms: [F.imm5257, F.imm5645, F.imm5476],
    checklist: [FORM100, BIRTH,
      I(103, 'passport', 'Passport — every page with a stamp or visa, plus the Canadian visa label', { hint: 'A new passport is needed if it expires in less than 2 years.' }),
      PHOTO,
      I(107, 'status-in-canada', 'Your study permit / work permit / visitor record (IRCC approval letter)', { cond: 'if applicable' }),
      I(108, 'enrolment-letter', 'Enrolment letter and up-to-date transcripts', { cond: 'if you are a student', hint: 'Name, student number, program, start and end dates, and confirmation of current-term registration.' }),
      I(109, 'employment-letter', 'Employment letter (+ 3 recent pay slips if available)', { cond: 'if you are employed', hint: 'Position, start date, full- or part-time, weekly hours — on letterhead and signed.' }),
      I(116, 'marriage-cert', 'Marriage certificate', { tr: true, when: married }),
      PROFILE, BACKGROUND, LAST_ENTRY(129), MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoTrvInside],
    letters: [LETTER.pot, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'visitor-record': {
    key: 'visitor-record', service: '100-404', title: 'Visitor Record — extend stay as a visitor', group: 'Visit — inside Canada', where: 'inside',
    description: 'Extend a stay or change conditions as a visitor while in Canada — often a family member of a permit holder (IMM 5708). Issues a status document, not a visa.',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'visitorRecord', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm5708, F.imm5476],
    checklist: [FORM100, BIRTH, passport(1, true), PHOTO,
      I(105, 'accommodation', 'Residence details — lease, hotel, or the address and contact details of relatives/friends'),
      I(106, 'spouse-status', "Parent's permit in Canada (IRCC approval letter)", { party: 'principal', cond: 'if applicable' }),
      I(112, 'proof-of-funds', 'Proof of funds — bank balance + 6-month statement, pay slips, tax; support letter if sponsored'),
      PROFILE, BACKGROUND, LAST_ENTRY(129), PREVIOUS, REP],
    packages: [PKG.clientInfoVisitorRecord],
    letters: [LETTER.potVisitorRecord, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'study-permit-inside-child': {
    key: 'study-permit-inside-child', service: '100-405', title: "Study Permit — Child, inside Canada (parent's permit)", group: 'Study — inside Canada', where: 'inside',
    description: "A school-age child in Canada studying on the strength of a parent's work permit — with or without an LOA (IMM 5709).",
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'minor', 'study', 'finances', 'education', 'history'],
    forms: [F.imm5709, F.imm5476],
    checklist: [FORM100, BIRTH, NID_OPT, passport(1, true), PHOTO, SCHOOL_ENROL, REPORT_CARD,
      I(107, 'loa', 'Letter of Acceptance from the school', { cond: 'if available' }),
      SOP_Q, COURSES_OPT, RESIDENCE_ABROAD,
      I(122, 'accommodation', "Parent's residence in Canada, or lease"),
      SPONSOR, PROFILE, BACKGROUND, PREVIOUS, REP,
      P_PERMIT('Parent'), P_ID('Parent'), P_WORK('Parent'), P_FUNDS('Parent')],
    packages: [PKG.clientInfoMinor, PKG.parentDocs],
    letters: [LETTER.studyPlanMinor, LETTER.explanation, LETTER.submission],
    stages: STAGES_STUDY,
  },
  'study-permit-inside': {
    key: 'study-permit-inside', service: '100-406', title: 'Study Permit — inside Canada (own LOA)', group: 'Study — inside Canada', where: 'inside',
    description: 'Someone already in Canada applying as a student with their own admission — or extending, changing school or level, or restoring status (IMM 5709).',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'studyInside', 'study', 'finances', 'education', 'language', 'history', 'ties'],
    forms: [F.imm5709, F.imm5476],
    checklist: [FORM100, BIRTH, passport(2), PHOTO,
      I(106, 'status-in-canada', 'Your study permit / work permit / visitor record (IRCC approval letter)', { cond: 'if applicable' }),
      I(107, 'loa', 'Letter of Acceptance (final; Pre-Offer accepted while pending)'),
      I(108, 'pal', 'Provincial / Territorial Attestation Letter (PAL / TAL)'),
      I(109, 'deposit', 'Official tuition deposit receipt from the school'),
      I(110, 'transcripts', 'Education — enrolment letter, last degree, transcripts of the two most recent levels'),
      SOP_Q, FINANCIAL,
      I(116, 'marriage-cert', 'Marriage certificate', { tr: true, when: married }),
      COURSES, RESIDENCE_ABROAD, TIES, LAST_ENTRY(121),
      I(122, 'accommodation', 'Residence details — lease or deed, or relatives/friends with contact details'),
      SPONSOR, PROFILE,
      I(125, 'co-op-letter', 'Co-op letter', { cond: 'if the program has a co-op term' }),
      CV, BACKGROUND, MILITARY, PREVIOUS, REP],
    packages: [PKG.clientInfoStudyInside, PKG.financialProof],
    letters: [LETTER.sopStudyInside, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_STUDY,
  },

  /* ----------------- no TR-team checklist yet (from past files) ----------------- */
  'sowp-inside': {
    key: 'sowp-inside', service: null, title: 'Spousal Open Work Permit (inside Canada)', group: 'Work — inside Canada', where: 'inside',
    description: 'Spouse of a student or worker, both already in Canada (IMM 5710). No TR-team checklist yet — built from past client files.',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'spouseInCanada', 'education', 'history', 'fundsStay', 'tiesReturn'],
    forms: [F.imm5710, F.imm5476],
    checklist: [FORM100, BIRTH, passport(2), PHOTO,
      I(107, 'status-in-canada', 'Your current permit in Canada'),
      I(116, 'marriage-cert', 'Marriage certificate', { tr: true }),
      I(113, 'medical', 'Medical exam', { cond: 'if applicable' }),
      PROFILE, BACKGROUND, LAST_ENTRY(129), MILITARY, PREVIOUS, REP,
      I(132, 'spouse-status', "Spouse's study or work permit", { party: 'principal' }),
      I(133, 'supporter-id', "Spouse's passport and ID", { party: 'principal' }),
      I(134, 'inviter-docs', "Spouse's enrolment or employment documents", { party: 'principal' })],
    packages: [PKG.clientInfoOwpInside, PKG.familyMemberStatus],
    letters: [LETTER.sopOwp, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  reconsideration: {
    key: 'reconsideration', service: null, title: 'Reconsideration request (after refusal)', group: 'After a decision', where: 'any',
    description: 'Ask IRCC to reconsider a refusal: a rebuttal letter plus the webform text.',
    steps: ['personal', 'passport', 'contact', 'refusal'],
    forms: [F.imm5744],
    checklist: [
      I(131, 'refusal-letter', 'Refusal letter and officer notes (GCMS)'),
      I(131, 'refusal-letter', 'The refused application — every form and document submitted'),
      I(103, 'passport', 'Passport bio page')],
    packages: [],
    letters: [LETTER.reconsideration, LETTER.webformText],
    stages: ['documents', 'final-files', 'submitted', 'decision'],
  },
};

export const APP_TYPE_LIST = Object.values(APP_TYPES);
export const DEFAULT_TYPE = 'study-permit';

export function getAppType(type) {
  return APP_TYPES[type] || APP_TYPES[DEFAULT_TYPE];
}

/** Letters applicable to this application (respecting `when` and representation). */
export function lettersFor(app) {
  const t = getAppType(app?.type);
  const d = app?.data || {};
  const rep = (app?.representation || 'self') === 'firm';
  return t.letters.filter((l) => (!l.rep || rep) && (!l.when || l.when(d)));
}

/** Official forms applicable to this application. */
export function formsFor(app) {
  const t = getAppType(app?.type);
  const rep = (app?.representation || 'self') === 'firm';
  return t.forms.filter((f) => !f.rep || rep);
}

/** The narrative letter this type builds with the guided questions tab. */
export function primaryLetter(type) {
  return getAppType(type).letters.find((l) => l.primary) || LETTER.sop;
}

/** Package definitions for a type, keyed by package key. */
export function packagesFor(type) {
  const out = {};
  for (const p of getAppType(type).packages) out[p.key] = p;
  return out;
}

/** Upload categories that belong to any of a type's packages (for the catch-all). */
export function packageCategories(type) {
  const out = {};
  for (const p of getAppType(type).packages) {
    const cats = new Set();
    const walk = (s) => {
      (s.categories || []).forEach((c) => cats.add(c));
      (s.children || []).forEach(walk);
    };
    p.sections.forEach(walk);
    out[p.key] = [...cats, 'other'];
  }
  return out;
}

/**
 * This service's own document-code table: code → upload category, for codes
 * that map to exactly one category within the service. Used by the
 * classifier, because the same code means different things in different
 * services.
 */
export function codeMapFor(type) {
  const seen = new Map();
  for (const item of getAppType(type).checklist) {
    if (!/^\d/.test(item.code)) continue;
    const prev = seen.get(item.code);
    seen.set(item.code, prev === undefined || prev === item.key ? item.key : null);
  }
  const out = {};
  for (const [code, key] of seen) if (key) out[code] = key;
  return out;
}

export const STAGE_LABELS = {
  admission: 'Admission',
  documents: 'Collecting documents',
  'final-files': 'Final files',
  'client-confirmation': "Client's confirmation",
  submitted: 'Submitted',
  'post-visa': 'Post-submission (BIL / webforms)',
  decision: 'Decision',
  reconsideration: 'Reconsideration',
};
