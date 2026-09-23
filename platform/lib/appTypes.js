/**
 * Application-type registry — the single place that says, for each kind of
 * application the firm handles, which intake steps to ask, which IRCC forms
 * apply, which documents to collect (with the firm's 1xx document codes), how
 * the submission packages are assembled, and which letters the platform drafts.
 *
 * Derived from the firm's last ~50 client files: every file follows
 *   01 - Documents → 02 - Final Files → 03 - Post Visa (→ Webform / Request /
 *   Reconsider / ATIP), with study cases adding an Admission stage first.
 * Final packages are numbered per applicant: forms first (main form, IMM 5257b
 * Schedule 1 / 5645 family, IMM 5476 use of representative), then the compiled
 * "Client Information", financial proof, passport, photo, supporting proofs,
 * and the Submission Letter last.
 *
 * This module is pure data (no server imports) so client components can read it.
 */

const has = (v) => String(v || '').trim().length > 0;
const isMale = (d) => String(d.sex || '').toLowerCase().startsWith('m');
const married = (d) => /married|common/i.test(String(d.maritalStatus || ''));

// ---------------------------------------------------------------------------
// Document checklist items (firm codes in parentheses). `key` is the upload
// category the classifier assigns; `code` mirrors the firm's file naming.
// ---------------------------------------------------------------------------
const DOC = {
  passport: { key: 'passport', code: 103, label: 'Passport (all used pages)', hint: 'Bio page plus every page with a visa or stamp.' },
  photo: { key: 'photo', code: 104, label: 'Digital photo', hint: 'IRCC photo specifications.' },
  birthCert: { key: 'national-id', code: 101, label: 'Birth certificate & national ID card', hint: 'Certified translation if not in English/French.' },
  marriage: { key: 'marriage-cert', code: 116, label: 'Marriage certificate', hint: 'Certified translation.', when: married },
  transcripts: { key: 'transcripts', code: 105, label: 'Degrees, diplomas & transcripts', hint: 'Most recent completed education (105 degree / 106 transcripts).' },
  language: { key: 'language', code: 110, label: 'Language test result', hint: 'IELTS / TOEFL / CELPIP / Duolingo, as applicable.' },
  employment: { key: 'employment-letter', code: 113, label: 'Employment letter, pay slips & leave of absence', hint: 'Current job proof and approved leave / job to return to.' },
  insurance: { key: 'insurance', code: 114, label: 'Social insurance records', hint: 'Work-history insurance printout (shows continuous employment).' },
  police: { key: 'police-clearance', code: 115, label: 'Police clearance certificate', hint: 'From the country of residence, translated.' },
  military: { key: 'military', code: 130, label: 'Military service card (completion / exemption)', hint: 'Male applicants from countries with conscription.', when: isMale },
  cv: { key: 'cv', code: 127, label: 'CV / résumé', hint: 'Up to date, in English.' },
  funds: { key: 'proof-of-funds', code: 112, label: 'Bank statements / proof of funds', hint: 'Balance letter plus recent transaction history.' },
  sourceOfFunds: { key: 'source-of-funds', code: 112, label: 'Source of funds evidence', hint: 'Bill of sale, salary account history, business records.' },
  deeds: { key: 'title-deeds', code: 120, label: 'Title deeds / assets', hint: 'Property, vehicle, business ownership.' },
  supporterBank: { key: 'supporter-bank', code: 123, label: "Supporter's bank statements", hint: 'Sponsor/parent accounts.', when: (d) => d.fundingSource && d.fundingSource !== 'Self' },
  supporterIncome: { key: 'supporter-income', code: 123, label: "Supporter's employment / pay slips / tax", hint: 'Shows the sponsor can fund the stay.', when: (d) => d.fundingSource && d.fundingSource !== 'Self' },
  supporterId: { key: 'supporter-id', code: 123, label: "Supporter's ID / birth certificate", hint: 'Proves the relationship to the sponsor.', when: (d) => d.fundingSource && d.fundingSource !== 'Self' },
  affidavit: { key: 'affidavit-support', code: 123, label: 'Affidavit of financial support', hint: 'Signed by the sponsor.', when: (d) => d.fundingSource && d.fundingSource !== 'Self' },
  loa: { key: 'loa', code: 107, label: 'Letter of Acceptance (LOA)', hint: 'From the DLI, with DLI number.' },
  pal: { key: 'pal', code: 107, label: 'Provincial Attestation Letter (PAL/TAL) or exemption', hint: 'The platform drafts a PAL exemption letter when exempt.' },
  deposit: { key: 'deposit', code: 109, label: 'Tuition deposit / payment receipt', hint: 'Payment to the institution.', when: (d) => Number(d.tuitionPaid) > 0 },
  gic: { key: 'gic', code: 112, label: 'GIC certificate', hint: 'If used.', when: (d) => Number(d.gicAmount) > 0 },
  flight: { key: 'flight', code: 121, label: 'Flight reservation', hint: 'Tentative booking.' },
  accommodation: { key: 'accommodation', code: 138, label: 'Accommodation arrangement', hint: 'Rental, host letter or homestay.' },
  medical: { key: 'medical', code: 113, label: 'Medical exam (if applicable)', hint: 'Upfront IME confirmation.' },
  spouseStatus: { key: 'spouse-status', code: 132, label: "Spouse's Canadian permit (study/work permit)", hint: 'The permit that makes the applicant eligible.' },
  spouseDocs: { key: 'inviter-docs', code: 134, label: "Spouse's documents in Canada", hint: 'Employment letter, pay slips, NOA/tax, enrolment letter, lease — bundled as "Inviter\'s Documents".' },
  spouseId: { key: 'supporter-id', code: 133, label: "Spouse's passport & ID", hint: 'Bio page and Canadian ID.' },
  statusInCanada: { key: 'status-in-canada', code: 107, label: 'Current permit in Canada (study/work permit)', hint: 'The permit being extended or relied on.' },
  lastEntry: { key: 'last-entry', code: 129, label: 'Proof of last entry to Canada', hint: 'Entry stamp or travel history.' },
  completion: { key: 'completion-letter', code: 105, label: 'Completion of studies letter', hint: 'Official letter from the DLI confirming program completion.' },
  finalTranscript: { key: 'transcripts', code: 106, label: 'Final transcript', hint: 'Official transcript showing completion.' },
  tuitionPayments: { key: 'deposit', code: 106, label: 'Tuition payment history', hint: 'Shows full-time enrolment throughout.' },
  invitation: { key: 'invitation-letter', code: 107, label: 'Invitation letter from host', hint: 'The platform drafts this for the host to sign.' },
  hostDocs: { key: 'host-docs', code: 107, label: "Host's status & supporting documents", hint: 'Host passport/PR card/citizenship, employment, NOA, lease.' },
  itinerary: { key: 'flight', code: 121, label: 'Travel itinerary / hotel', hint: 'Flight and accommodation plan.' },
  consent: { key: 'consent-letter', code: 101, label: 'Parents\' consent letter', hint: 'Both parents consent to the child studying abroad.' },
  custody: { key: 'custody-doc', code: 101, label: 'Custody / guardianship document', hint: 'Custodianship declaration (IMM 5646) when required.' },
  schoolLetter: { key: 'loa', code: 107, label: 'School enrolment letter / LOA', hint: 'From the Canadian school board or school.' },
  refusal: { key: 'refusal-letter', code: 131, label: 'Previous refusal letter & GCMS notes', hint: 'Every previous refusal, plus ATIP notes if obtained.' },
  prevApplication: { key: 'refusal-letter', code: 131, label: 'Previous application forms', hint: 'What was submitted before, for consistency.' },
  newLoa: { key: 'loa', code: 107, label: 'New Letter of Acceptance / continuing enrolment letter', hint: 'Extension: a letter from the DLI confirming continued enrolment. Change of school: the new LOA with its DLI number.' },
  academicRecord: { key: 'transcripts', code: 106, label: 'Current transcript / proof of satisfactory academic standing', hint: 'Shows you actively pursued studies on the permit you now want to extend.' },
  reasonDocs: { key: 'ties-docs', code: 111, label: 'Documents supporting the reason to stay longer', hint: 'Medical letter, event invitation, family circumstances — whatever justifies the extension.' },
  fundsForStay: { key: 'proof-of-funds', code: 112, label: 'Proof of funds for the extended stay', hint: 'Bank statements covering living costs for the period requested.' },
};

// ---------------------------------------------------------------------------
// Package layouts (compiled PDFs with a table of contents), per package key.
// `categories` are upload categories; `generatedKey` pulls a generated letter.
// ---------------------------------------------------------------------------
const PKG = {
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

// ---------------------------------------------------------------------------
// Letters the platform drafts. `primary` = the narrative letter built with the
// guided questions tab (stored under generated key 'sop' for every type).
// ---------------------------------------------------------------------------
const LETTER = {
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

// Forms: `rep` forms only apply when the firm represents the applicant.
const F = {
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

export const APP_TYPES = {
  'study-permit': {
    key: 'study-permit', title: 'Study Permit (outside Canada)', group: 'Study', where: 'outside',
    description: 'Adult applicant applying from abroad with a Letter of Acceptance.',
    steps: ['personal', 'passport', 'contact', 'family', 'study', 'finances', 'education', 'language', 'history', 'ties'],
    forms: [F.imm1294, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.loa, DOC.pal, DOC.birthCert, DOC.marriage, DOC.transcripts, DOC.language, DOC.cv, DOC.employment, DOC.insurance, DOC.funds, DOC.sourceOfFunds, DOC.deeds, DOC.affidavit, DOC.supporterBank, DOC.supporterIncome, DOC.supporterId, DOC.deposit, DOC.gic, DOC.police, DOC.military, DOC.flight, DOC.accommodation, DOC.medical, DOC.refusal],
    packages: [PKG.clientInfoStudy, PKG.financialProof],
    letters: [LETTER.sop, LETTER.finCover, LETTER.finSummary, LETTER.palExemption, LETTER.explanation, LETTER.submission],
    stages: STAGES_STUDY,
  },
  'study-permit-minor': {
    key: 'study-permit-minor', title: 'Study Permit — minor child', group: 'Study', where: 'outside',
    description: 'Dependent child studying in Canada (parent on a study/work permit, or with a custodian).',
    steps: ['personal', 'passport', 'contact', 'family', 'minor', 'study', 'finances', 'education', 'history'],
    forms: [F.imm1294, F.imm5645, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.schoolLetter, DOC.pal, DOC.birthCert, DOC.consent, DOC.custody, DOC.transcripts, DOC.police, DOC.spouseStatus, DOC.funds, DOC.affidavit, DOC.supporterBank, DOC.supporterIncome, DOC.supporterId],
    packages: [PKG.clientInfoMinor, PKG.financialProof],
    letters: [LETTER.studyPlanMinor, LETTER.finCover, LETTER.finSummary, LETTER.palExemption, LETTER.submission],
    stages: STAGES_STUDY,
  },
  'sowp-inside': {
    key: 'sowp-inside', title: 'Spousal Open Work Permit (inside Canada)', group: 'Work', where: 'inside',
    description: 'Spouse of a student or worker already in Canada, applying from inside (IMM 5710).',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'spouseInCanada', 'education', 'history', 'finances', 'ties'],
    forms: [F.imm5710, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.statusInCanada, DOC.lastEntry, DOC.marriage, DOC.spouseStatus, DOC.spouseDocs, DOC.spouseId, DOC.medical, DOC.birthCert, DOC.cv, DOC.transcripts, DOC.employment, DOC.military, DOC.funds, DOC.refusal],
    packages: [PKG.clientInfoOwpInside, PKG.familyMemberStatus],
    letters: [LETTER.sopOwp, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'owp-outside': {
    key: 'owp-outside', title: 'Spousal Open Work Permit (outside Canada)', group: 'Work', where: 'outside',
    description: 'Accompanying spouse of a student or worker in Canada, applying from abroad (IMM 1295 + Schedule 1).',
    steps: ['personal', 'passport', 'contact', 'family', 'spouseInCanada', 'education', 'history', 'finances', 'ties'],
    forms: [F.imm1295, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.birthCert, DOC.marriage, DOC.spouseStatus, DOC.spouseDocs, DOC.spouseId, DOC.cv, DOC.transcripts, DOC.employment, DOC.insurance, DOC.funds, DOC.sourceOfFunds, DOC.deeds, DOC.police, DOC.military, DOC.flight, DOC.refusal],
    packages: [PKG.clientInfoOwpOutside, PKG.inviterDocs, PKG.financialProof],
    letters: [LETTER.pot, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  pgwp: {
    key: 'pgwp', title: 'Post-Graduation Work Permit', group: 'Work', where: 'inside',
    description: 'Graduate of a DLI applying inside Canada (IMM 5710).',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'pgwp', 'history', 'ties'],
    forms: [F.imm5710, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.statusInCanada, DOC.completion, DOC.finalTranscript, DOC.loa, DOC.tuitionPayments, DOC.lastEntry, DOC.language, DOC.employment, DOC.marriage, DOC.birthCert, DOC.military, DOC.refusal],
    packages: [PKG.clientInfoPgwp],
    letters: [LETTER.sopPgwp, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'trv-outside': {
    key: 'trv-outside', title: 'Visitor Visa (TRV, outside Canada)', group: 'Visit', where: 'outside',
    description: 'Tourism or family visit, with or without an inviting host in Canada.',
    steps: ['personal', 'passport', 'contact', 'family', 'visit', 'host', 'education', 'history', 'finances', 'ties'],
    forms: [F.imm5257, F.imm5257b, F.imm5645, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.birthCert, DOC.marriage, DOC.invitation, DOC.hostDocs, DOC.itinerary, DOC.employment, DOC.insurance, DOC.cv, DOC.transcripts, DOC.funds, DOC.sourceOfFunds, DOC.deeds, DOC.police, DOC.military, DOC.refusal],
    packages: [PKG.clientInfoVisit, PKG.inviterDocs, PKG.financialProof],
    letters: [LETTER.pot, LETTER.invitation, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'study-permit-inside': {
    key: 'study-permit-inside', title: 'Study Permit — extend / change conditions (inside Canada)', group: 'Study', where: 'inside',
    description: 'Already studying in Canada: extend the study permit, change school or level, or change conditions (IMM 5709). Decided inside Canada — no visa counterfoil.',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'studyInside', 'study', 'finances', 'education', 'language', 'history', 'ties'],
    forms: [F.imm5709, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.statusInCanada, DOC.lastEntry, DOC.newLoa, DOC.academicRecord, DOC.tuitionPayments, DOC.funds, DOC.sourceOfFunds, DOC.affidavit, DOC.supporterBank, DOC.language, DOC.medical, DOC.marriage, DOC.birthCert, DOC.refusal],
    packages: [PKG.clientInfoStudyInside, PKG.financialProof],
    letters: [LETTER.sopStudyInside, LETTER.finCover, LETTER.finSummary, LETTER.explanation, LETTER.submission],
    stages: STAGES_STUDY,
  },
  'trv-inside': {
    key: 'trv-inside', title: 'Visitor Visa (TRV) — applying from inside Canada', group: 'Visit', where: 'inside',
    description: 'A permit holder in Canada who needs a valid visa counterfoil to re-enter after travelling (IMM 5257). Decided by a visa office abroad; the passport is mailed in for the sticker. Does NOT change status in Canada.',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'visit', 'history', 'finances', 'ties'],
    forms: [F.imm5257, F.imm5645, F.imm5476],
    checklist: [DOC.passport, DOC.photo, DOC.statusInCanada, DOC.lastEntry, DOC.employment, DOC.loa, DOC.marriage, DOC.birthCert, DOC.funds, DOC.itinerary, DOC.refusal],
    packages: [PKG.clientInfoTrvInside],
    letters: [LETTER.pot, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  'visitor-record': {
    key: 'visitor-record', title: 'Visitor Record — extend stay as a visitor (inside Canada)', group: 'Visit', where: 'inside',
    description: 'Extend a stay or change conditions as a visitor while in Canada (IMM 5708). Decided by IRCC inside Canada; issues a Visitor Record status document, not a visa. No passport is mailed and no photo is needed.',
    steps: ['personal', 'passport', 'contact', 'family', 'statusInCanada', 'visitorRecord', 'history', 'finances', 'ties'],
    forms: [F.imm5708, F.imm5476],
    checklist: [DOC.passport, DOC.statusInCanada, DOC.lastEntry, DOC.reasonDocs, DOC.fundsForStay, DOC.hostDocs, DOC.medical, DOC.marriage, DOC.birthCert, DOC.refusal],
    packages: [PKG.clientInfoVisitorRecord],
    letters: [LETTER.potVisitorRecord, LETTER.explanation, LETTER.submission],
    stages: STAGES_DEFAULT,
  },
  reconsideration: {
    key: 'reconsideration', title: 'Reconsideration request (after refusal)', group: 'After a decision', where: 'any',
    description: 'Ask IRCC to reconsider a refusal: a rebuttal letter plus the webform text.',
    steps: ['personal', 'passport', 'contact', 'refusal'],
    forms: [F.imm5744],
    checklist: [DOC.refusal, DOC.prevApplication, DOC.passport],
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
