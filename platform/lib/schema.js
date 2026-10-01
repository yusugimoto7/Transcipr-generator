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

/** Standard education levels (Iranian equivalents are mapped in the extraction prompt). */
export const EDUCATION_LEVELS = [
  'None',
  'Primary / middle school',
  'Secondary school (high school diploma)',
  'Trade / vocational certificate',
  'College diploma / associate degree',
  "Bachelor's degree",
  'Post-graduate diploma / certificate',
  "Master's degree",
  'Doctorate (PhD)',
  'Professional degree (medicine, dentistry, pharmacy, law)',
];

/** The marital statuses on IMM 5645 (Family Information). */
export const MARITAL_5645 = [
  'Single',
  'Married-physically present',
  'Married-not physically present',
  'Common-law',
  'Legally separated',
  'Divorced',
  'Annulled marriage',
  'Widowed',
];

export const PROVINCES = [
  'Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Northwest Territories',
  'Nova Scotia', 'Nunavut', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan', 'Yukon',
];

const RESIDENCE_STATUS = ['Citizen', 'Permanent resident', 'Visitor', 'Worker', 'Student', 'Other'];
const ENGLISH = 'In English (Latin letters) — IRCC forms reject Persian or any other script.';
const MARRIED = { field: 'maritalStatus', in: ['Married', 'Common-Law'] };

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
        {
          id: 'nativeName',
          label: 'Full name in the native language (e.g. Persian script)',
          type: 'text',
          required: true,
          note: 'Given name then family name, as on the birth certificate or national ID. IMM 5645 writes every name in English and in the native language.',
        },
        { id: 'otherNames', label: 'Other names used (aliases, maiden)', type: 'text' },
        {
          id: 'sex',
          label: 'Sex',
          type: 'select',
          options: ['Female', 'Male', 'Another gender', 'Unknown'],
          required: true,
        },
        { id: 'dob', label: 'Date of birth', type: 'date', required: true },
        {
          id: 'cityOfBirth',
          label: 'City / town of birth (in English)',
          type: 'text',
          required: true,
          note: 'Spelled exactly as the passport\'s "Place of birth" (or the birth certificate\'s English translation) — never in Persian script.',
        },
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
        {
          id: 'uci',
          label: 'UCI / client ID (if you have one)',
          type: 'text',
          note: 'Digits only: 8 digits (e.g. 12345678) or 10 digits (e.g. 1234567890). Dashes are removed on the forms.',
        },
      ],
    },
    {
      id: 'passport',
      title: 'Passport, ID & residence',
      fields: [
        { id: 'passportNumber', label: 'Passport number', type: 'text', required: true },
        { id: 'passportCountry', label: 'Passport country of issue', type: 'country', required: true },
        { id: 'passportIssue', label: 'Passport issue date', type: 'date', required: true },
        { id: 'passportExpiry', label: 'Passport expiry date', type: 'date', required: true },
        { id: 'nationalIdNumber', label: 'National ID number (Iranian kart-e melli)', type: 'text', required: true, note: 'From the national ID card. Digits only.' },
        { id: 'nationalIdIssue', label: 'National ID issue date', type: 'date' },
        { id: 'nationalIdExpiry', label: 'National ID expiry date', type: 'date' },
        { id: 'usPermanentResident', label: 'Lawful permanent resident of the United States (green card)?', type: 'bool', required: true },
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
          options: RESIDENCE_STATUS,
          required: true,
        },
        { id: 'residenceFrom', label: 'Status valid from', type: 'date', note: 'For citizens: leave blank, or the date of birth.' },
        { id: 'residenceTo', label: 'Status valid to', type: 'date' },
        {
          id: 'applyingFromResidence',
          label: 'Applying from the country of residence?',
          type: 'bool',
          required: true,
          note: 'IRCC question: "Is the country from where you are applying the same as your current country of residence?"',
        },
        { id: 'applyCountry', label: 'Country applying from', type: 'country', required: true, showIf: { field: 'applyingFromResidence', equals: false } },
        { id: 'applyStatus', label: 'Status in that country', type: 'select', options: RESIDENCE_STATUS, required: true, showIf: { field: 'applyingFromResidence', equals: false } },
        { id: 'applyFrom', label: 'Status there from', type: 'date', showIf: { field: 'applyingFromResidence', equals: false } },
        { id: 'applyTo', label: 'Status there to', type: 'date', showIf: { field: 'applyingFromResidence', equals: false } },
        {
          id: 'livedElsewhere5y',
          label: 'In the past 5 years, lived more than 6 months in another country?',
          type: 'bool',
          required: true,
          note: 'Any country other than the country of citizenship or current residence.',
        },
        { id: 'prevResidenceCountry', label: 'That country', type: 'country', required: true, showIf: { field: 'livedElsewhere5y', equals: true } },
        { id: 'prevResidenceStatus', label: 'Status there', type: 'select', options: RESIDENCE_STATUS, required: true, showIf: { field: 'livedElsewhere5y', equals: true } },
        { id: 'prevResidenceFrom', label: 'From', type: 'date', required: true, showIf: { field: 'livedElsewhere5y', equals: true } },
        { id: 'prevResidenceTo', label: 'To', type: 'date', required: true, showIf: { field: 'livedElsewhere5y', equals: true } },
      ],
    },
    {
      id: 'contact',
      title: 'Contact information',
      help: 'Your address broken into parts, in English (this is how the official forms need it).',
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
          required: true,
        },
        { id: 'resUnit', label: 'Residential: Apt / Unit', type: 'text', showIf: { field: 'sameResidential', equals: false } },
        { id: 'resStreetNo', label: 'Residential: street number', type: 'text', showIf: { field: 'sameResidential', equals: false } },
        { id: 'resStreet', label: 'Residential: street name', type: 'text', required: true, showIf: { field: 'sameResidential', equals: false } },
        { id: 'resCity', label: 'Residential: city / town', type: 'text', required: true, showIf: { field: 'sameResidential', equals: false } },
        { id: 'resProvince', label: 'Residential: province / state / region', type: 'text', showIf: { field: 'sameResidential', equals: false } },
        { id: 'resCountry', label: 'Residential: country', type: 'country', required: true, showIf: { field: 'sameResidential', equals: false } },
        { id: 'resPostal', label: 'Residential: postal / ZIP code', type: 'text', showIf: { field: 'sameResidential', equals: false } },
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
          note: 'Filled from the program start date — change it if the client arrives earlier (e.g. for orientation).',
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
        {
          id: 'highestEducation',
          label: 'Highest level completed',
          type: 'select',
          options: EDUCATION_LEVELS,
          required: true,
          note: 'The highest diploma or degree actually completed — not a school currently attended.',
        },
        { id: 'lastInstitution', label: 'Most recent institution (in English)', type: 'text', required: true },
        { id: 'lastFieldOfStudy', label: 'Field of study (in English)', type: 'text' },
        { id: 'lastEduFrom', label: 'From (YYYY-MM)', type: 'text', placeholder: '2015-09' },
        { id: 'lastEduTo', label: 'To (YYYY-MM)', type: 'text', placeholder: '2019-06' },
        { id: 'lastEduCity', label: 'City of study', type: 'text' },
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
        { id: 'firstLanguage', label: 'Native language (in English, e.g. Persian)', type: 'text', required: true },
        {
          id: 'ableToCommunicate',
          label: 'Able to communicate in English and/or French?',
          type: 'select',
          options: ['English', 'French', 'Both', 'Neither'],
          required: true,
        },
        {
          id: 'mostAtEase',
          label: 'Language most at ease in',
          type: 'select',
          options: ['English', 'French'],
          required: true,
          showIf: { field: 'ableToCommunicate', equals: 'Both' },
        },
        {
          id: 'languageTest',
          label: 'English/French test taken',
          type: 'select',
          options: ['IELTS', 'TOEFL', 'PTE', 'CELPIP', 'TEF/TCF (French)', 'Duolingo', 'None yet'],
          required: true,
          note: 'Ticks "Have you taken a test from a designated testing agency?" on the forms — "None yet" answers No.',
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
          id: 'travelledAbroad',
          label: 'Travelled to any other country in the last 5 years (or since age 18)?',
          type: 'bool',
          required: true,
          note: 'Countries other than the country of nationality or residence — IMM 5257 Schedule 1, question 8.',
        },
        {
          id: 'countriesVisited',
          label: 'Trips (one per line: from YYYY-MM | to YYYY-MM | country | city | purpose)',
          type: 'textarea',
          placeholder: '2022-03 | 2022-03 | Turkey | Istanbul | Tourism',
          showIf: { field: 'travelledAbroad', equals: true },
          note: 'The four most recent go on Schedule 1; the platform lists the rest.',
        },
        {
          id: 'currentOccupation',
          label: 'Current occupation / activity (in English)',
          type: 'text',
          required: true,
          note: 'E.g. "Retired teacher", "Homemaker", "Software engineer". ' + ENGLISH,
        },
        { id: 'employer', label: 'Current employer / institution (in English)', type: 'text', note: 'Leave blank for a homemaker or retired person.' },
        { id: 'currentJobFrom', label: 'Current occupation since (YYYY-MM)', type: 'text', required: true, placeholder: '2018-04' },
        { id: 'currentJobCity', label: 'City of the current occupation (in English)', type: 'text', required: true },
        { id: 'currentJobCountry', label: 'Country of the current occupation', type: 'country', required: true },
        {
          id: 'employmentHistory',
          label: 'Previous occupations, past 10 years (one per line: from YYYY-MM | to YYYY-MM | occupation | employer | city | country)',
          type: 'textarea',
          placeholder: '2012-01 | 2018-03 | Accountant | Pars Trading Co. | Tehran | Iran',
          note: 'Most recent first, in English, with no gaps — include study, unemployment and homemaking.',
        },
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
  // Funds and ties for everything that is not a study permit: the study
  // versions ask who pays for studies, career goal after graduation and why
  // this program — meaningless for a work permit, a visit or a status change.
  {
    id: 'fundsStay',
    title: 'Funds & finances',
    help: 'How you (and any family with you) will be supported in Canada.',
    fields: [
      { id: 'totalFunds', label: 'Funds available for your stay (CAD)', type: 'number', required: true },
      {
        id: 'supportSource',
        label: 'Who supports you during your stay?',
        type: 'select',
        options: ['Myself', 'My spouse / partner', 'My parents / family', 'My employer', 'My host in Canada', 'Combination'],
        required: true,
      },
      { id: 'sponsorName', label: 'Supporter name & relationship (if not yourself)', type: 'text' },
      {
        id: 'fundsDetails',
        label: 'Brief description of the funds',
        type: 'textarea',
        note: 'e.g. "Savings account CAD 28,000; spouse\'s salary in Canada CAD 5,200/month; apartment in Tehran."',
      },
    ],
  },
  {
    id: 'tiesReturn',
    title: 'Ties & intent',
    help: 'Shows the officer you will respect the conditions of your stay and leave at the end of it.',
    fields: [
      {
        id: 'homeTies',
        label: 'Your ties to your home country',
        type: 'textarea',
        required: true,
        note: 'Family staying behind, property, job or business to return to, other commitments.',
      },
      {
        id: 'returnPlan',
        label: 'Your plans when your stay or permit ends',
        type: 'textarea',
      },
    ],
  },
  {
    id: 'family',
    title: 'Family members',
    help: 'Needed for IMM 5645 (Family Information) and for spouse-based applications.',
    fields: [
      { id: 'spouseGivenName', label: 'Spouse given name(s) (as on their passport)', type: 'text', required: true, showIf: MARRIED, note: "Read from the spouse's passport when it is in the file; the full name is built from these two." },
      { id: 'spouseFamilyName', label: 'Spouse family name (as on their passport)', type: 'text', required: true, showIf: MARRIED },
      // Built from the given and family names (deriveData) — never typed.
      { id: 'spouseName', label: 'Spouse / partner full name', type: 'text', derived: true },
      { id: 'spouseNameNative', label: 'Spouse full name in the native language', type: 'text', showIf: MARRIED },
      { id: 'marriageDate', label: 'Date of marriage / start of common-law', type: 'date', required: true, showIf: MARRIED },
      { id: 'spouseDob', label: 'Spouse date of birth', type: 'date', required: true, showIf: MARRIED },
      { id: 'spouseCountryOfBirth', label: 'Spouse country of birth', type: 'country', required: true, showIf: MARRIED },
      { id: 'spouseCitizenship', label: 'Spouse citizenship', type: 'country', showIf: MARRIED },
      { id: 'spouseAddress', label: "Spouse's present address (English)", type: 'text', showIf: MARRIED, note: 'Leave blank if the spouse is in Canada — the address on the spouse step is used.' },
      { id: 'spouseOccupation', label: "Spouse's present occupation (English)", type: 'text', showIf: MARRIED },
      { id: 'spouseAccompanying', label: 'Will your spouse accompany you to Canada?', type: 'bool', showIf: MARRIED, note: 'No if the spouse is already in Canada.' },
      {
        id: 'previouslyMarried',
        label: 'Previously married or in a common-law relationship?',
        type: 'bool',
        required: true,
      },
      { id: 'prevSpouseFamilyName', label: 'Previous spouse: family name', type: 'text', required: true, showIf: { field: 'previouslyMarried', equals: true } },
      { id: 'prevSpouseGivenName', label: 'Previous spouse: given name(s)', type: 'text', required: true, showIf: { field: 'previouslyMarried', equals: true } },
      { id: 'prevSpouseDob', label: 'Previous spouse: date of birth', type: 'date', showIf: { field: 'previouslyMarried', equals: true } },
      { id: 'prevRelationshipType', label: 'Type of relationship', type: 'select', options: ['Married', 'Common-Law'], required: true, showIf: { field: 'previouslyMarried', equals: true } },
      { id: 'prevRelationshipFrom', label: 'Relationship from', type: 'date', required: true, showIf: { field: 'previouslyMarried', equals: true } },
      { id: 'prevRelationshipTo', label: 'Relationship to', type: 'date', required: true, showIf: { field: 'previouslyMarried', equals: true } },
      { id: 'fatherName', label: "Father's full name (English)", type: 'text', required: true },
      { id: 'fatherNameNative', label: "Father's full name in the native language", type: 'text' },
      { id: 'fatherDob', label: "Father's date of birth", type: 'date' },
      { id: 'fatherBirthCountry', label: "Father's country of birth", type: 'country' },
      { id: 'fatherAddress', label: "Father's present address (English)", type: 'text', note: 'If deceased: "Deceased — city, country, YYYY-MM-DD".' },
      { id: 'fatherOccupation', label: "Father's present occupation (English)", type: 'text' },
      { id: 'fatherMaritalStatus', label: "Father's marital status", type: 'select', options: MARITAL_5645 },
      { id: 'fatherAccompanying', label: 'Will your father accompany you to Canada?', type: 'bool' },
      { id: 'motherName', label: "Mother's full name (English)", type: 'text', required: true },
      { id: 'motherNameNative', label: "Mother's full name in the native language", type: 'text' },
      { id: 'motherDob', label: "Mother's date of birth", type: 'date' },
      { id: 'motherBirthCountry', label: "Mother's country of birth", type: 'country' },
      { id: 'motherAddress', label: "Mother's present address (English)", type: 'text', note: 'If deceased: "Deceased — city, country, YYYY-MM-DD".' },
      { id: 'motherOccupation', label: "Mother's present occupation (English)", type: 'text' },
      { id: 'motherMaritalStatus', label: "Mother's marital status", type: 'select', options: MARITAL_5645 },
      { id: 'motherAccompanying', label: 'Will your mother accompany you to Canada?', type: 'bool' },
      {
        id: 'children',
        label: 'Children (one per line: English name | native name | date of birth | country of birth | Son/Daughter | marital status | address | occupation | accompanying yes/no)',
        type: 'textarea',
        placeholder: 'Sara Rahimi | سارا رحیمی | 2015-04-02 | Iran | Daughter | Single | 12 Azadi St, Tehran, Iran | Student | yes',
      },
      {
        id: 'siblings',
        label: 'Brothers and sisters (one per line: English name | native name | date of birth | country of birth | Brother/Sister | marital status | address | occupation | accompanying yes/no)',
        type: 'textarea',
      },
    ],
  },
  {
    id: 'background',
    title: 'Background questions',
    help: 'The Yes/No questions every IRCC application form asks. Answer each one — the forms are ticked from these answers.',
    fields: [
      { id: 'bgTbContact', label: 'In the past 2 years, had tuberculosis or been in close contact with a person with tuberculosis?', type: 'bool', required: true },
      { id: 'bgMedicalCondition', label: 'Any physical or mental disorder that would require social or health services (other than medication) in Canada?', type: 'bool', required: true },
      { id: 'medicalDetails', label: 'Health details', type: 'textarea', showIf: { any: [{ field: 'bgTbContact', equals: true }, { field: 'bgMedicalCondition', equals: true }] } },
      { id: 'bgOverstay', label: 'Ever remained beyond your status, studied or worked without authorization in Canada?', type: 'bool', required: true },
      {
        id: 'previousRefusal',
        label: 'Ever refused a visa or permit, denied entry or ordered to leave Canada or any other country?',
        type: 'bool',
        required: true,
        note: 'If yes, describe below — this must be disclosed and explained.',
      },
      { id: 'previousCanadaApplication', label: 'Previously applied to enter or remain in Canada?', type: 'bool', required: true },
      {
        id: 'refusalDetails',
        label: 'Details (refusals, overstay, previous applications)',
        type: 'textarea',
        showIf: { any: [{ field: 'bgOverstay', equals: true }, { field: 'previousRefusal', equals: true }, { field: 'previousCanadaApplication', equals: true }] },
      },
      { id: 'bgCriminal', label: 'Ever committed, been arrested, charged or convicted of any criminal offence in any country?', type: 'bool', required: true },
      { id: 'criminalDetails', label: 'Criminal record details', type: 'textarea', showIf: { field: 'bgCriminal', equals: true } },
      {
        id: 'bgMilitary',
        label: 'Served in any military, militia, civil defence, security organization or police (including national service)?',
        type: 'bool',
        required: true,
        note: 'Iranian men: military (conscription) service counts — answer Yes.',
      },
      {
        id: 'militaryDetails',
        label: 'Service (one per line: from YYYY-MM | to YYYY-MM | unit / place stationed | province | country)',
        type: 'textarea',
        required: true,
        placeholder: '2008-02 | 2010-01 | Army, 23rd Division, Tehran | Tehran | Iran',
        showIf: { field: 'bgMilitary', equals: true },
      },
      { id: 'bgOrganization', label: 'Ever a member of or associated with a political party or group that used or advocated violence?', type: 'bool', required: true },
      {
        id: 'organizationDetails',
        label: 'Organizations (one per line: from YYYY-MM | to YYYY-MM | organization | activities / position | province | country)',
        type: 'textarea',
        showIf: { field: 'bgOrganization', equals: true },
      },
      { id: 'bgGovPosition', label: 'Ever held a government position (civil servant, judge, police, mayor, military officer…)?', type: 'bool', required: true },
      {
        id: 'govPositionDetails',
        label: 'Positions (one per line: from YYYY-MM | to YYYY-MM | country | level of jurisdiction | department / branch | position)',
        type: 'textarea',
        showIf: { field: 'bgGovPosition', equals: true },
      },
      { id: 'bgWitnessed', label: 'Ever witnessed or participated in the ill treatment of prisoners or civilians, looting or desecration of religious buildings?', type: 'bool', required: true },
      { id: 'witnessedDetails', label: 'Details', type: 'textarea', showIf: { field: 'bgWitnessed', equals: true } },
      { id: 'consentContact', label: 'Consent to be contacted by IRCC in the future (client surveys)?', type: 'bool', required: true },
    ],
  },
  {
    id: 'workDetailsInside',
    title: 'The work permit you are applying for',
    help: 'IMM 5710 "What are you applying for" and "Details of intended work in Canada".',
    fields: [
      {
        id: 'wpApplyingFor',
        label: 'Applying to',
        type: 'select',
        options: ['Extend my permit with the same employer', 'Get a permit for the first time or with a new employer', 'Restore my status as a worker'],
        required: true,
      },
      {
        id: 'workPermitTypeInside',
        label: 'Type of work permit',
        type: 'select',
        options: ['Post Graduation Work Permit', 'Open Work Permit', 'Exemption from Labour Market Impact Assessment', 'Labour Market Impact Assessment Stream', 'Co-op Work Permit', 'Open Work Permit for Vulnerable Workers', 'Start-up Business Class', 'Other'],
        required: true,
      },
      { id: 'intendedEmployer', label: 'Employer name (if any)', type: 'text' },
      { id: 'intendedEmployerAddress', label: 'Employer full address', type: 'text' },
      { id: 'intendedProvince', label: 'Province you will work in', type: 'select', options: PROVINCES, required: true },
      { id: 'intendedCity', label: 'City / town', type: 'text', required: true },
      { id: 'intendedAddress', label: 'Work address', type: 'text' },
      { id: 'intendedJobTitle', label: 'Job title (if known)', type: 'text' },
      { id: 'intendedDuties', label: 'Brief description of duties', type: 'text' },
      { id: 'intendedFrom', label: 'Work permit wanted from', type: 'date', required: true },
      { id: 'intendedTo', label: 'Work permit wanted until', type: 'date', required: true },
      { id: 'lmiaNumber', label: 'LMIA number or offer of employment number (A1234567)', type: 'text' },
    ],
  },
  {
    id: 'workDetails',
    title: 'Intended work in Canada',
    help: 'IMM 1295 "Details of intended work". For an open work permit there is no employer — give where you will live and the dates.',
    fields: [
      {
        id: 'workPermitType',
        label: 'Type of work permit',
        type: 'select',
        options: ['Open Work Permit', 'Exemption from Labour Market Impact Assessment', 'Labour Market Impact Assessment Stream', 'Start-up Business Class', 'Other'],
        required: true,
      },
      { id: 'intendedEmployer', label: 'Employer name (if any)', type: 'text' },
      { id: 'intendedEmployerAddress', label: 'Employer full address', type: 'text' },
      { id: 'intendedProvince', label: 'Province you will live / work in', type: 'select', options: PROVINCES, required: true },
      { id: 'intendedCity', label: 'City / town', type: 'text', required: true },
      { id: 'intendedAddress', label: 'Address in Canada', type: 'text' },
      { id: 'intendedJobTitle', label: 'Job title (if known)', type: 'text' },
      { id: 'intendedDuties', label: 'Brief description of duties', type: 'text' },
      { id: 'intendedFrom', label: 'Work permit wanted from', type: 'date', required: true },
      { id: 'intendedTo', label: 'Work permit wanted until', type: 'date', required: true, note: "For a spouse: usually the spouse's permit expiry date." },
      { id: 'lmiaNumber', label: 'LMIA number or offer of employment number', type: 'text' },
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
      { id: 'firstEntryDate', label: 'Date of first entry to Canada', type: 'date', required: true },
      { id: 'firstEntryPlace', label: 'Place of first entry (city / airport)', type: 'text', required: true },
      {
        id: 'originalEntryPurpose',
        label: 'Original purpose of coming to Canada',
        type: 'select',
        options: ['Study', 'Work', 'Tourism', 'Family Visit', 'Business', 'Other'],
        required: true,
      },
      { id: 'lastEntryDate', label: 'Date of most recent entry to Canada', type: 'date', required: true },
      { id: 'lastEntryPlace', label: 'Place of most recent entry (city / airport)', type: 'text' },
      { id: 'canadaEmployerOrSchool', label: 'Current employer or school in Canada', type: 'text' },
      { id: 'sinNumber', label: 'SIN (if you have one)', type: 'text' },
    ],
  },
  {
    id: 'spouseInCanada',
    title: 'Your spouse — the student or worker',
    help: 'The principal applicant you are accompanying or joining. Their status is what makes you eligible — be exact.',
    fields: [
      // The same person as the spouse in Family members: built from their names.
      { id: 'inviterName', label: 'Spouse full name', type: 'text', derived: true },
      { id: 'inviterStatus', label: 'Spouse status in Canada', type: 'select', options: ['Study permit holder', 'Work permit holder (skilled job)', 'Work permit holder (other)', 'PGWP holder', 'Permanent resident', 'Citizen'], required: true },
      { id: 'inviterPermitExpiry', label: "Spouse's permit expiry date", type: 'date' },
      { id: 'inviterInstitution', label: "Spouse's school (DLI) or employer", type: 'text', required: true },
      { id: 'inviterProgramOrJob', label: "Spouse's program (level) or job title (NOC/TEER)", type: 'text', required: true },
      { id: 'inviterIncome', label: "Spouse's annual income in Canada (CAD)", type: 'number' },
      { id: 'inviterAddress', label: "Spouse's address in Canada", type: 'text' },
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
          'Become a student (change from visitor / worker / dependant status)',
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
    id: 'businessVisit',
    title: 'Your business visit',
    fields: [
      { id: 'applicantCompany', label: 'Your company / employer', type: 'text', required: true },
      { id: 'applicantRole', label: 'Your position', type: 'text', required: true },
      { id: 'ownsBusiness', label: 'Do you own the business?', type: 'bool' },
      { id: 'businessPurpose', label: 'What you will do in Canada (meetings, conference, trade show, site visit…)', type: 'textarea', required: true },
      { id: 'canadianCounterpart', label: 'Canadian company / event you are visiting', type: 'text' },
      { id: 'canadianCounterpartAddress', label: 'Its address and contact person', type: 'text' },
      { id: 'businessWhoPays', label: 'Who pays for the trip?', type: 'select', options: ['My company', 'Myself', 'The Canadian company'] },
    ],
  },
  {
    id: 'c11',
    title: 'Your Canadian business (C11)',
    help: 'The officer decides whether the business brings a significant benefit to Canada.',
    fields: [
      { id: 'c11BusinessName', label: 'Canadian business name', type: 'text', required: true },
      { id: 'c11BusinessAddress', label: 'Canadian business address', type: 'text' },
      { id: 'c11Activity', label: 'What the business does', type: 'textarea', required: true },
      { id: 'c11Ownership', label: 'Your ownership share (%)', type: 'number', required: true },
      { id: 'c11Investment', label: 'Investment in Canada (CAD)', type: 'number', required: true },
      { id: 'c11Jobs', label: 'Jobs for Canadians / PRs in the first 2 years', type: 'number' },
      { id: 'c11OfferNumber', label: 'Offer of employment number (Employer Portal)', type: 'text' },
      { id: 'c11Progress', label: 'Steps already taken (incorporation, lease, bank account, hiring, invoices)', type: 'textarea' },
      { id: 'c11HomeBusiness', label: 'Your business at home — name, years operating, employees', type: 'text', required: true },
      { id: 'c11Benefit', label: 'The significant benefit to Canada (economic, social, cultural)', type: 'textarea', required: true },
    ],
  },
  {
    id: 'superVisa',
    title: 'Super Visa requirements',
    help: "The host must be your child or grandchild and a Canadian citizen or permanent resident, with income above the minimum for their household size.",
    fields: [
      { id: 'svHostRelation', label: 'The host is your', type: 'select', options: ['Child', 'Grandchild'], required: true },
      { id: 'svHostStatus', label: "Host's status", type: 'select', options: ['Canadian citizen', 'Permanent resident', 'Registered Indian'], required: true },
      { id: 'svHousehold', label: "People in the host's household (including you and anyone visiting with you)", type: 'number', required: true },
      { id: 'svHostIncome', label: "Host's income for the last tax year (CAD, from NOA / T4)", type: 'number', required: true },
      { id: 'svInsurer', label: 'Medical insurance company (Canadian)', type: 'text', required: true },
      { id: 'svCoverage', label: 'Insurance coverage (CAD)', type: 'number', required: true, note: 'At least $100,000.' },
      { id: 'svInsuranceStart', label: 'Insurance start date', type: 'date' },
      { id: 'svMedicalDone', label: 'Medical exam done by a panel physician?', type: 'bool' },
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
      {
        id: 'minorArrangement',
        label: 'How the child travels and lives in Canada (IRCC portal question)',
        type: 'select',
        options: [
          'Accompanied by both parents',
          'With one parent — custody documents and the other parent\'s consent',
          'Without a parent — custodian in Canada (IMM 5646)',
        ],
        required: true,
        note: 'Decides which custody and consent documents the portal asks for.',
      },
      { id: 'accompanyingParent', label: 'Parent the child will live with in Canada', type: 'text', required: true },
      { id: 'parentStatusCanada', label: "That parent's status in Canada", type: 'select', options: STATUS_OPTIONS, required: true },
      { id: 'otherParentName', label: 'Other parent full name', type: 'text' },
      { id: 'otherParentConsent', label: 'Other parent consents (consent letter available)?', type: 'bool' },
      { id: 'custodianRequired', label: 'Custodian required (child not with a parent)?', type: 'bool' },
      { id: 'custodianName', label: 'Custodian name & address', type: 'text' },
      { id: 'parentPermitType', label: "That parent's permit", type: 'select', options: ['Work permit', 'Study permit', 'Visitor record', 'Permanent resident', 'Citizen'] },
      { id: 'parentPermitExpiry', label: "That parent's permit expiry", type: 'date' },
      { id: 'parentEmployerOrSchool', label: "That parent's employer or school in Canada", type: 'text' },
      { id: 'parentIncome', label: "That parent's annual income in Canada (CAD)", type: 'number' },
      { id: 'parentAddress', label: "That parent's address in Canada", type: 'text' },
      { id: 'travelsWith', label: 'The child travels with', type: 'select', options: ['Both parents', 'The other parent', 'A relative', 'Alone'] },
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

/** IRCC application forms that ask languages, background and history questions. */
const MAIN_FORMS = new Set(['imm1294', 'imm1295', 'imm5257', 'imm5708', 'imm5709', 'imm5710']);

/**
 * The type's steps plus the ones its IRCC forms need: every main application
 * form asks languages and the background Yes/No questions (Schedule 1 asks the
 * background too), and IMM 1295 asks the details of the intended work.
 */
export function stepIds(t) {
  const forms = new Set((t.forms || []).map((f) => f?.key));
  const ids = [...t.steps];
  const insert = (id, beforeIds) => {
    if (ids.includes(id)) return;
    const at = ids.findIndex((x) => beforeIds.includes(x));
    if (at < 0) ids.push(id);
    else ids.splice(at, 0, id);
  };
  const main = [...forms].some((k) => MAIN_FORMS.has(k));
  if (forms.has('imm1295')) insert('workDetails', ['education', 'history', 'fundsStay']);
  if (forms.has('imm5710')) insert('workDetailsInside', ['education', 'history', 'fundsStay', 'tiesReturn']);
  if (main) insert('language', ['history', 'ties', 'tiesReturn', 'fundsStay']);
  if (main || forms.has('imm5257b')) insert('background', ['fundsStay', 'finances', 'ties', 'tiesReturn']);
  return ids;
}

/** Intake schema for an application type: its ordered step blocks. */
export function getSchema(type = 'study-permit') {
  const t = getAppType(type);
  return {
    type: t.key,
    title: t.title,
    steps: stepIds(t).map((id) => STEP_BLOCKS[id]).filter(Boolean),
  };
}

/**
 * Is a field asked, given the answers so far? `showIf` is
 * { field, equals } | { field, in: [...] } | { any: [conditions] }.
 */
export function fieldShown(f, data = {}) {
  if (f.derived) return false;
  const test = (c) => {
    if (!c) return true;
    if (c.any) return c.any.some(test);
    const v = data?.[c.field];
    if (c.in) return c.in.includes(v);
    return v === c.equals;
  };
  return test(f.showIf);
}

/**
 * Answers built from other answers, applied whenever the intake changes (a
 * save, the AI reading documents, an email): the spouse's full name is their
 * given name(s) + family name as on their passport.
 */
export function deriveData(data = {}) {
  const given = String(data.spouseGivenName ?? '').trim();
  const family = String(data.spouseFamilyName ?? '').trim();
  if (given && family) data.spouseName = `${given} ${family}`;
  else if ((given || family) && !String(data.spouseName ?? '').trim()) data.spouseName = given || family;
  if (String(data.spouseName ?? '').trim()) data.inviterName = data.spouseName;
  return data;
}

/** Required and asked (a hidden follow-up question is never missing). */
export const isRequired = (f, data = {}) => !!f.required && fieldShown(f, data);

/**
 * Whom each intake step describes. The AI reads a whole family's folder, so it
 * must know which fields are the applicant's and which belong to someone else.
 * Steps not listed describe the applicant.
 */
export const STEP_ABOUT = {
  family:
    "the applicant's family members — spouse/partner, parents, children, brothers and sisters (from the applicant's birth certificate, marriage certificate and family register, and those people's own IDs)",
  spouseInCanada:
    "the applicant's spouse/partner who is (or is going) in Canada as a student or worker — the SAME person as the spouse (spouseGivenName / spouseFamilyName) in Family members. Their work or study permit, employment letter, pay slips, enrolment letter and address in Canada fill these fields",
  host: 'the host in Canada who invites the applicant',
  superVisa: "the applicant's child or grandchild in Canada who hosts them, and the applicant's Canadian medical insurance",
  minor: "the child applicant's parent in Canada, the other parent and the custodian, and the child's school arrangements",
  finances: "money available for the stay — the applicant's own funds and any sponsor's (spouse, parents)",
  fundsStay: "money available for the stay — the applicant's own funds and any supporter's (spouse, parents, employer, host)",
};

/** Steps whose fields may only come from the applicant's OWN documents. */
export const APPLICANT_ONLY_STEPS = new Set(['personal', 'passport', 'contact', 'education', 'language', 'background']);

/**
 * Fields that name the same person in two sections, per step that makes them
 * equal: when one is read from the documents the other is filled too.
 */
export const SAME_PERSON_FIELDS = [
  { whenStep: 'spouseInCanada', fields: ['inviterName', 'spouseName'] },
];

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
    if (isRequired(f, data) && typeof data?.[f.id] !== 'boolean' && !String(data?.[f.id] ?? '').trim()) missing.push(f);
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
