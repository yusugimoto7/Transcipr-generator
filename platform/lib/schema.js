/**
 * Study Permit intake schema (single / unmarried applicant, applying outside Canada).
 *
 * This is the single source of truth for:
 *   - the guided intake wizard (steps + fields)
 *   - what the model tries to extract from uploaded documents
 *   - what the generators (SOP, cover docs) and IMM form-fillers read
 *
 * Field types: text, textarea, date, number, select, tel, email, country, bool.
 */

import { getAppType } from './appTypes';

export const COUNTRIES_HINT =
  'Use the full country name in English (e.g. "Iran", "India", "Nigeria").';

export const STUDY_PERMIT_SCHEMA = {
  type: 'study-permit',
  title: 'Study Permit',
  steps: [
    {
      id: 'personal',
      title: 'Personal details',
      help: 'Exactly as they appear in your passport.',
      fields: [
        { id: 'familyName', label: 'Family name (surname)', type: 'text', required: true },
        { id: 'givenName', label: 'Given name(s)', type: 'text', required: true },
        { id: 'otherNames', label: 'Other names used (aliases, maiden)', type: 'text' },
        {
          id: 'sex',
          label: 'Sex',
          type: 'select',
          options: ['Female', 'Male', 'Another gender', 'Unknown'],
          required: true,
        },
        { id: 'dob', label: 'Date of birth', type: 'date', required: true },
        { id: 'cityOfBirth', label: 'City / town of birth', type: 'text', required: true },
        { id: 'countryOfBirth', label: 'Country of birth', type: 'country', required: true },
        { id: 'citizenship', label: 'Country of citizenship', type: 'country', required: true },
        {
          id: 'maritalStatus',
          label: 'Marital status',
          type: 'select',
          options: ['Never Married / Single', 'Married', 'Common-Law', 'Divorced', 'Separated', 'Widowed', 'Annulled Marriage'],
          default: 'Never Married / Single',
          required: true,
        },
        { id: 'uci', label: 'UCI / client ID (if you have one)', type: 'text' },
      ],
    },
    {
      id: 'passport',
      title: 'Passport & residence',
      fields: [
        { id: 'passportNumber', label: 'Passport number', type: 'text', required: true },
        { id: 'passportCountry', label: 'Passport country of issue', type: 'country', required: true },
        { id: 'passportIssue', label: 'Passport issue date', type: 'date', required: true },
        { id: 'passportExpiry', label: 'Passport expiry date', type: 'date', required: true },
        {
          id: 'countryOfResidence',
          label: 'Country of current residence',
          type: 'country',
          required: true,
        },
        {
          id: 'residenceStatus',
          label: 'Immigration status in country of residence',
          type: 'select',
          options: ['Citizen', 'Permanent resident', 'Visitor', 'Worker', 'Student', 'Other'],
          required: true,
        },
        { id: 'residenceFrom', label: 'Status valid from', type: 'date' },
        { id: 'residenceTo', label: 'Status valid to', type: 'date' },
      ],
    },
    {
      id: 'contact',
      title: 'Contact information',
      help: 'Your address broken into parts (this is how the official forms need it).',
      fields: [
        { id: 'mailingPobox', label: 'P.O. Box (if any)', type: 'text' },
        { id: 'mailingUnit', label: 'Apt / Unit', type: 'text' },
        { id: 'mailingStreetNo', label: 'Street number', type: 'text' },
        { id: 'mailingStreet', label: 'Street name', type: 'text', required: true },
        { id: 'mailingCity', label: 'City / town', type: 'text', required: true },
        { id: 'mailingProvince', label: 'Province / state / region', type: 'text' },
        { id: 'mailingCountry', label: 'Country', type: 'country', required: true },
        { id: 'mailingPostal', label: 'Postal / ZIP code', type: 'text' },
        {
          id: 'sameResidential',
          label: 'Residential address same as mailing?',
          type: 'bool',
          default: true,
          note: 'If different, note it — most forms need the residential address too.',
        },
        {
          id: 'phoneType',
          label: 'Phone type',
          type: 'select',
          options: ['Cellular', 'Residence', 'Business'],
        },
        { id: 'phoneCountryCode', label: 'Country calling code (e.g. 98)', type: 'text' },
        { id: 'phoneNumber', label: 'Phone number (without country code)', type: 'tel', required: true },
        { id: 'email', label: 'Email address', type: 'email', required: true },
      ],
    },
    {
      id: 'study',
      title: 'Intended study in Canada',
      help: 'From your Letter of Acceptance (LOA) and school documents.',
      fields: [
        { id: 'schoolName', label: 'School / DLI name', type: 'text', required: true },
        { id: 'dliNumber', label: 'DLI number (O-number)', type: 'text', required: true },
        { id: 'palNumber', label: 'PAL / TAL number (if you have one)', type: 'text', note: 'From your Provincial Attestation Letter.' },
        { id: 'palExempt', label: 'PAL-exempt?', type: 'bool', note: 'Yes for graduate degrees, minors in K-12, extensions at the same school, etc. The platform drafts the exemption letter.' },
        { id: 'palExemptReason', label: 'Reason for PAL exemption', type: 'text', placeholder: "e.g. Master's degree program; minor child in primary school" },
        { id: 'programName', label: 'Program / field of study', type: 'text', required: true },
        {
          id: 'levelOfStudy',
          label: 'Level of study',
          type: 'select',
          options: [
            'Secondary / high school',
            'College diploma / certificate',
            'Bachelor’s degree',
            'Post-graduate diploma',
            'Master’s degree',
            'Doctorate (PhD)',
            'Other',
          ],
          required: true,
        },
        { id: 'schoolCity', label: 'School city', type: 'text', required: true },
        { id: 'schoolProvince', label: 'School province', type: 'text', required: true },
        { id: 'programStart', label: 'Program start date', type: 'date', required: true },
        { id: 'programEnd', label: 'Program end date', type: 'date', required: true },
        { id: 'tuitionCost', label: 'Tuition cost (CAD / year)', type: 'number', required: true },
        {
          id: 'entryDate',
          label: 'Intended date of entry to Canada',
          type: 'date',
          required: true,
        },
      ],
    },
    {
      id: 'finances',
      title: 'Funds & finances',
      help: 'How you will pay for tuition and living costs.',
      fields: [
        { id: 'totalFunds', label: 'Total funds available (CAD)', type: 'number', required: true },
        {
          id: 'gicAmount',
          label: 'GIC amount (CAD), if you bought one',
          type: 'number',
          note: 'The Student Direct Stream / proof-of-funds GIC is commonly CAD 20,635.',
        },
        { id: 'tuitionPaid', label: 'Tuition already paid (CAD)', type: 'number' },
        {
          id: 'fundingSource',
          label: 'Who is paying for your studies?',
          type: 'select',
          options: ['Self', 'Parents / family', 'Scholarship', 'Sponsor', 'Loan', 'Combination'],
          required: true,
        },
        { id: 'sponsorName', label: 'Sponsor name & relationship (if any)', type: 'text' },
        {
          id: 'fundsDetails',
          label: 'Brief description of your funds',
          type: 'textarea',
          note: 'e.g. "Family savings account CAD 35,000, GIC CAD 20,635, education loan CAD 15,000."',
        },
      ],
    },
    {
      id: 'education',
      title: 'Education history',
      help: 'Most recent studies first.',
      fields: [
        { id: 'highestEducation', label: 'Highest level completed', type: 'text', required: true },
        { id: 'lastInstitution', label: 'Most recent institution', type: 'text', required: true },
        { id: 'lastFieldOfStudy', label: 'Field of study', type: 'text' },
        { id: 'lastEduFrom', label: 'From (year/month)', type: 'text' },
        { id: 'lastEduTo', label: 'To (year/month)', type: 'text' },
        { id: 'lastEduCountry', label: 'Country of study', type: 'country' },
        {
          id: 'gpa',
          label: 'GPA / final grade',
          type: 'text',
          note: 'As shown on your transcript (e.g. "16.8/20", "3.4/4.0", "First class").',
        },
      ],
    },
    {
      id: 'language',
      title: 'Language ability',
      fields: [
        { id: 'firstLanguage', label: 'Native language', type: 'text', required: true },
        {
          id: 'languageTest',
          label: 'English/French test taken',
          type: 'select',
          options: ['IELTS', 'TOEFL', 'PTE', 'CELPIP', 'TEF/TCF (French)', 'Duolingo', 'None yet'],
        },
        { id: 'languageScore', label: 'Overall test score', type: 'text' },
        { id: 'languageTestDate', label: 'Test date', type: 'date' },
      ],
    },
    {
      id: 'history',
      title: 'Travel & immigration history',
      fields: [
        {
          id: 'previousCanada',
          label: 'Have you been to Canada before?',
          type: 'bool',
        },
        {
          id: 'previousRefusal',
          label: 'Ever refused a visa/permit or removed from any country?',
          type: 'bool',
          note: 'If yes, describe below — this must be disclosed and explained.',
        },
        { id: 'refusalDetails', label: 'Refusal / removal details', type: 'textarea' },
        {
          id: 'countriesVisited',
          label: 'Countries visited in the last 10 years',
          type: 'textarea',
          note: 'List country + year(s), e.g. "UAE 2019, Turkey 2022".',
        },
        {
          id: 'currentOccupation',
          label: 'Current occupation / job title',
          type: 'text',
        },
        { id: 'employer', label: 'Current employer / institution', type: 'text' },
      ],
    },
    {
      id: 'ties',
      title: 'Ties & intent',
      help: 'Used to draft your Statement of Purpose and prove you will return home.',
      fields: [
        {
          id: 'homeTies',
          label: 'Your ties to your home country',
          type: 'textarea',
          note: 'Family, property, job offer, business, dependents — reasons you will return.',
        },
        {
          id: 'careerGoal',
          label: 'Career goal after graduation',
          type: 'textarea',
          required: true,
        },
        {
          id: 'whyProgram',
          label: 'Why this program & school?',
          type: 'textarea',
          required: true,
        },
        {
          id: 'whyCanada',
          label: 'Why Canada (vs. studying at home)?',
          type: 'textarea',
        },
      ],
    },
  ],
};


/* ------------------------------------------------------------------------ */
/* Step blocks shared across application types                              */
/* ------------------------------------------------------------------------ */

const STATUS_OPTIONS = ['Student (study permit)', 'Worker (work permit)', 'Visitor', 'Permanent resident', 'Citizen', 'No status / other'];

const EXTRA_STEPS = [
  {
    id: 'family',
    title: 'Family members',
    help: 'Needed for IMM 5645 (Family Information) and for spouse-based applications.',
    fields: [
      { id: 'spouseName', label: 'Spouse / partner full name', type: 'text' },
      { id: 'spouseDob', label: 'Spouse date of birth', type: 'date' },
      { id: 'spouseCitizenship', label: 'Spouse citizenship', type: 'country' },
      { id: 'spouseAccompanying', label: 'Is your spouse applying with you / accompanying you?', type: 'bool' },
      { id: 'fatherName', label: "Father's full name", type: 'text' },
      { id: 'fatherDob', label: "Father's date of birth", type: 'date' },
      { id: 'motherName', label: "Mother's full name", type: 'text' },
      { id: 'motherDob', label: "Mother's date of birth", type: 'date' },
      { id: 'children', label: 'Children (name, date of birth, country — one per line)', type: 'textarea' },
      { id: 'siblings', label: 'Brothers and sisters (name, date of birth, country — one per line)', type: 'textarea' },
    ],
  },
  {
    id: 'statusInCanada',
    title: 'Your status in Canada',
    help: 'For applications made from inside Canada.',
    fields: [
      { id: 'currentStatusCanada', label: 'Current status in Canada', type: 'select', options: STATUS_OPTIONS, required: true },
      { id: 'permitNumber', label: 'Current permit / document number', type: 'text' },
      { id: 'permitExpiry', label: 'Current permit expiry date', type: 'date', required: true },
      { id: 'lastEntryDate', label: 'Date of last entry to Canada', type: 'date', required: true },
      { id: 'lastEntryPlace', label: 'Port of entry (city)', type: 'text' },
      { id: 'canadaEmployerOrSchool', label: 'Current employer or school in Canada', type: 'text' },
      { id: 'sinNumber', label: 'SIN (if you have one)', type: 'text' },
    ],
  },
  {
    id: 'spouseInCanada',
    title: 'Spouse in Canada (the person you are joining)',
    help: 'Their status is what makes you eligible — be exact.',
    fields: [
      { id: 'inviterName', label: 'Spouse full name', type: 'text', required: true },
      { id: 'inviterStatus', label: 'Spouse status in Canada', type: 'select', options: ['Study permit holder', 'Work permit holder (skilled job)', 'Work permit holder (other)', 'PGWP holder', 'Permanent resident', 'Citizen'], required: true },
      { id: 'inviterPermitExpiry', label: "Spouse's permit expiry date", type: 'date' },
      { id: 'inviterInstitution', label: "Spouse's school (DLI) or employer", type: 'text', required: true },
      { id: 'inviterProgramOrJob', label: "Spouse's program (level) or job title (NOC/TEER)", type: 'text', required: true },
      { id: 'inviterIncome', label: "Spouse's annual income in Canada (CAD)", type: 'number' },
      { id: 'inviterAddress', label: "Spouse's address in Canada", type: 'text' },
      { id: 'marriageDate', label: 'Date of marriage / start of common-law', type: 'date', required: true },
      { id: 'relationshipHistory', label: 'How you met and your relationship history (dates, cohabitation)', type: 'textarea' },
    ],
  },
  {
    id: 'studyInside',
    title: 'What you are applying to change',
    help: 'You are already studying in Canada — this is what the extension asks for.',
    fields: [
      {
        id: 'studyInsideReason',
        label: 'Reason for this application',
        type: 'select',
        options: [
          'Extend my current study permit (same school and program)',
          'Change my school / DLI',
          'Change my level of study',
          'Change the conditions on my permit',
          'Restore my status as a student',
        ],
        required: true,
      },
      { id: 'currentDli', label: 'Current school and DLI number', type: 'text', required: true },
      { id: 'newDli', label: 'New school and DLI number (if changing)', type: 'text' },
      { id: 'semestersCompleted', label: 'Semesters completed so far', type: 'text' },
      { id: 'academicStanding', label: 'Current academic standing (GPA / good standing)', type: 'text' },
      { id: 'studyGapExplanation', label: 'Any break in full-time study to explain', type: 'textarea', note: 'Authorized leave, medical, reduced course load — the officer checks that you actively pursued studies.' },
      { id: 'newProgramEnd', label: 'New program end date', type: 'date', required: true },
      { id: 'restorationReason', label: 'If restoring status: how the status lapsed and when', type: 'textarea', note: 'Restoration must be applied for within 90 days of losing status.' },
    ],
  },
  {
    id: 'visitorRecord',
    title: 'Your extension as a visitor',
    help: 'This application extends your stay inside Canada — it does not issue a visa.',
    fields: [
      {
        id: 'extendReason',
        label: 'Why do you need to stay longer?',
        type: 'select',
        options: [
          'Continue visiting family in Canada',
          'Medical treatment / recovery',
          'Caring for a family member',
          'Waiting for a decision on another application',
          'Continuing tourism / travel plans changed',
          'Accompanying a family member who is studying or working',
          'Other',
        ],
        required: true,
      },
      { id: 'extendReasonDetail', label: 'Explain the reason in your own words', type: 'textarea', required: true },
      { id: 'extendUntil', label: 'Date you are asking to stay until', type: 'date', required: true },
      {
        id: 'extendSupport',
        label: 'Who supports you during the extended stay?',
        type: 'select',
        options: ['My own funds', 'My host / family in Canada', 'My spouse', 'My parents', 'My employer abroad'],
        required: true,
      },
      { id: 'extendFunds', label: 'Funds available for the extended stay (CAD)', type: 'number', required: true },
      { id: 'extendDeparturePlan', label: 'Your plan to leave Canada (ticket, commitments at home)', type: 'textarea', required: true },
    ],
  },
  {
    id: 'visit',
    title: 'Your visit',
    fields: [
      { id: 'visitPurpose', label: 'Purpose of the visit', type: 'select', options: ['Tourism', 'Visiting family', 'Visiting a friend', 'Business', 'Attending an event (graduation, wedding)', 'Accompanying a family member', 'Other'], required: true },
      { id: 'visitFrom', label: 'Planned arrival date', type: 'date', required: true },
      { id: 'visitTo', label: 'Planned departure date', type: 'date', required: true },
      { id: 'visitCities', label: 'Cities you will visit', type: 'text' },
      { id: 'visitPlan', label: 'Itinerary / what you will do', type: 'textarea' },
      { id: 'visitPayer', label: 'Who pays for the trip?', type: 'select', options: ['Myself', 'My host in Canada', 'My spouse / parents', 'My employer'] },
      { id: 'visitBudget', label: 'Trip budget (CAD)', type: 'number' },
    ],
  },
  {
    id: 'host',
    title: 'Host / inviter in Canada',
    help: 'Leave blank if nobody is inviting you.',
    fields: [
      { id: 'hostName', label: 'Host full name', type: 'text' },
      { id: 'hostRelationship', label: 'Relationship to you', type: 'text', placeholder: 'e.g. son, sister, friend' },
      { id: 'hostStatus', label: 'Host status in Canada', type: 'select', options: STATUS_OPTIONS },
      { id: 'hostAddress', label: 'Host address in Canada', type: 'text' },
      { id: 'hostPhone', label: 'Host phone', type: 'tel' },
      { id: 'hostEmail', label: 'Host email', type: 'email' },
      { id: 'hostOccupation', label: 'Host occupation / employer', type: 'text' },
      { id: 'hostProvidesLodging', label: 'Will you stay with the host?', type: 'bool' },
    ],
  },
  {
    id: 'pgwp',
    title: 'Completed studies in Canada',
    fields: [
      { id: 'pgwpInstitution', label: 'Institution (DLI) attended', type: 'text', required: true },
      { id: 'pgwpProgram', label: 'Program completed', type: 'text', required: true },
      { id: 'pgwpLevel', label: 'Credential', type: 'select', options: ['Certificate', 'Diploma', 'Advanced diploma', "Bachelor's", 'Post-graduate certificate', "Master's", 'Doctorate'], required: true },
      { id: 'pgwpProgramLength', label: 'Program length (months)', type: 'number', required: true },
      { id: 'pgwpStart', label: 'Program start date', type: 'date' },
      { id: 'pgwpCompletionDate', label: 'Program completion date (per completion letter)', type: 'date', required: true },
      { id: 'pgwpFullTime', label: 'Studied full-time every semester (except final)?', type: 'bool', required: true },
      { id: 'pgwpJobOffer', label: 'Job / job offer in Canada (employer, title)', type: 'text' },
    ],
  },
  {
    id: 'minor',
    title: 'Minor applicant details',
    fields: [
      { id: 'accompanyingParent', label: 'Parent the child will live with in Canada', type: 'text', required: true },
      { id: 'parentStatusCanada', label: "That parent's status in Canada", type: 'select', options: STATUS_OPTIONS, required: true },
      { id: 'otherParentName', label: 'Other parent full name', type: 'text' },
      { id: 'otherParentConsent', label: 'Other parent consents (consent letter available)?', type: 'bool' },
      { id: 'custodianRequired', label: 'Custodian required (child not with a parent)?', type: 'bool' },
      { id: 'custodianName', label: 'Custodian name & address', type: 'text' },
      { id: 'gradeInCanada', label: 'Grade / year the child will enter', type: 'text', required: true },
      { id: 'schoolBoard', label: 'School board / school district', type: 'text' },
    ],
  },
  {
    id: 'refusal',
    title: 'The refusal',
    help: 'Copy the refusal reasons exactly as written; paste GCMS notes if you have them.',
    fields: [
      { id: 'refusalAppType', label: 'Refused application type', type: 'text', required: true },
      { id: 'refusalDate', label: 'Refusal letter date', type: 'date', required: true },
      { id: 'refusalAppNumber', label: 'Application / UCI number', type: 'text' },
      { id: 'refusalReasons', label: 'Refusal reasons (ticked boxes / text of the letter)', type: 'textarea', required: true },
      { id: 'gcmsNotes', label: 'GCMS / officer notes (paste)', type: 'textarea' },
      { id: 'reconsiderationError', label: 'What the officer got wrong or overlooked', type: 'textarea', required: true },
      { id: 'newEvidence', label: 'New evidence you can now provide', type: 'textarea' },
    ],
  },
];

const STEP_BLOCKS = Object.fromEntries(
  [...STUDY_PERMIT_SCHEMA.steps, ...EXTRA_STEPS].map((s) => [s.id, s])
);

/** Intake schema for an application type: its ordered step blocks. */
export function getSchema(type = 'study-permit') {
  const t = getAppType(type);
  return {
    type: t.key,
    title: t.title,
    steps: t.steps.map((id) => STEP_BLOCKS[id]).filter(Boolean),
  };
}

/** Flat list of all fields across steps. */
export function allFields(type = 'study-permit') {
  return getSchema(type).steps.flatMap((s) => s.fields.map((f) => ({ ...f, step: s.id })));
}

/** Every field id known to any type (for labels / validation across types). */
export function everyField() {
  return Object.values(STEP_BLOCKS).flatMap((s) => s.fields.map((f) => ({ ...f, step: s.id })));
}

/** Returns the required fields not yet filled. */
export function requiredMissing(data, type = 'study-permit') {
  const missing = [];
  for (const f of allFields(type)) {
    if (f.required && !String(data?.[f.id] ?? '').trim()) missing.push(f);
  }
  return missing;
}

/** "Label: value" lines for every filled field of this type — used by letter prompts. */
export function factsText(data = {}, type = 'study-permit') {
  const lines = [];
  for (const s of getSchema(type).steps) {
    const rows = s.fields
      .filter((f) => String(data[f.id] ?? '').trim() !== '')
      .map((f) => `  - ${f.label}: ${data[f.id] === true ? 'Yes' : data[f.id] === false ? 'No' : data[f.id]}`);
    if (rows.length) lines.push(`${s.title}:`, ...rows);
  }
  return lines.join('\n');
}
