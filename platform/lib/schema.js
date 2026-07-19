/**
 * Study Permit intake schema (single / unmarried applicant, applying outside Canada).
 *
 * This is the single source of truth for:
 *   - the guided intake wizard (steps + fields)
 *   - what Claude tries to extract from uploaded documents
 *   - what the generators (SOP, cover docs) and IMM form-fillers read
 *
 * Field types: text, textarea, date, number, select, tel, email, country, bool.
 */

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
          options: ['Never Married / Single'],
          default: 'Never Married / Single',
          required: true,
          note: 'Phase 1 supports single (never married) applicants.',
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
      fields: [
        { id: 'mailingAddress', label: 'Mailing address', type: 'textarea', required: true },
        { id: 'residentialAddress', label: 'Residential address (if different)', type: 'textarea' },
        { id: 'phone', label: 'Phone number (with country code)', type: 'tel', required: true },
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

export function getSchema(type = 'study-permit') {
  if (type === 'study-permit') return STUDY_PERMIT_SCHEMA;
  return STUDY_PERMIT_SCHEMA;
}

/** Flat list of all fields across steps. */
export function allFields(type = 'study-permit') {
  return getSchema(type).steps.flatMap((s) => s.fields.map((f) => ({ ...f, step: s.id })));
}

/** Returns { missing: [...requiredFieldIds not filled] }. */
export function requiredMissing(data, type = 'study-permit') {
  const missing = [];
  for (const f of allFields(type)) {
    if (f.required && !String(data?.[f.id] ?? '').trim()) missing.push(f);
  }
  return missing;
}
