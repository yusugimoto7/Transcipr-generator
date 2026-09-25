/**
 * Guided-letter builder questions (max 7 per kind). Each question offers
 * clickable pre-written answers (multi-select) plus a free notes field, so
 * applicants build a strong narrative letter without starting from a blank page.
 *
 * `kind` matches the primary letter of the application type (lib/appTypes.js):
 *   study        Statement of Purpose / Study Plan
 *   study-minor  Study Plan for a minor
 *   owp          Statement of Purpose for a spousal open work permit (inside)
 *   visit        Purpose of Travel (visitor visa, OWP from outside)
 *   pgwp         Statement of Purpose for a PGWP
 *   reconsideration  Reconsideration request
 */

const STUDY = [
  {
    id: 'whyCanada',
    question: 'Why do you want to study in Canada?',
    options: [
      'World-class education quality',
      'Safe, welcoming, multicultural society',
      'Strong post-graduation work options (PGWP)',
      'This program is not available at home',
      'Better value than the US / UK',
      'Aligns with my career field',
    ],
  },
  {
    id: 'whyProgram',
    question: 'Why this program / field of study?',
    options: [
      'Builds directly on my previous studies',
      'Fills a skills gap for my target career',
      'Strong industry demand in this field',
      'Long-term passion and interest',
      'Includes hands-on / co-op components',
      'Reputation of the curriculum',
    ],
  },
  {
    id: 'whySchool',
    question: 'Why this specific institution?',
    options: [
      'High ranking / strong reputation',
      'Curriculum matches my goals',
      'Co-op / internship opportunities',
      'Location and campus',
      'Affordable tuition',
      'Scholarship or funding offered',
    ],
  },
  {
    id: 'career',
    question: 'What will you do after graduating?',
    options: [
      'Return home to a job offer / promotion',
      'Join or take over the family business',
      'Start my own business at home',
      'Work in my field in my home country',
      'Pursue further studies later',
    ],
  },
  {
    id: 'ties',
    question: 'What ties bind you to your home country?',
    options: [
      'Parents / spouse / children at home',
      'Property or assets in my name',
      'A job or business waiting for me',
      'Family business responsibilities',
      'Strong community and cultural roots',
    ],
  },
  {
    id: 'funding',
    question: 'How are your studies funded?',
    options: [
      'Own savings',
      'Parents / family support',
      'Scholarship',
      'Education loan',
      'Sale of property / assets',
      'Employer sponsorship',
    ],
  },
  {
    id: 'gap',
    question: 'Anything the officer might question (gaps, refusals, career change)?',
    options: [
      'A study or work gap I can explain',
      'A change of field',
      'A previous visa refusal',
      'Age / long time since last study',
      'Nothing unusual',
    ],
  },
];

const STUDY_MINOR = [
  { id: 'why', question: 'Why will the child study in Canada?', options: ['A parent holds a study / work permit in Canada', 'Better schooling and English immersion', 'Keeping the family together', 'A specific school or program'] },
  { id: 'care', question: 'Who will care for the child in Canada?', options: ['Accompanying parent', 'Both parents are in Canada', 'A custodian (custodianship declaration)'] },
  { id: 'school', question: 'School arrangements', options: ['Enrolment letter from a public school board', 'Private school acceptance', 'Grade placement confirmed'] },
  { id: 'funds', question: 'How are tuition and living costs covered?', options: ["Parent's income in Canada", 'Family savings', 'Support from grandparents / relatives'] },
  { id: 'return', question: 'Plans at the end of the study period', options: ['Return home with the family', 'Family status in Canada will be maintained'] },
];

const OWP = [
  { id: 'relationship', question: 'Your relationship', options: ['Married for several years', 'Recently married', 'Common-law partners', 'We have children together', 'Lived together before coming to Canada'] },
  { id: 'spouse', question: "Your spouse's situation in Canada", options: ['Full-time student at a DLI (graduate level)', 'Full-time student at a DLI (college / undergraduate)', 'Works in a skilled job (TEER 0-3)', 'Holds a PGWP', 'Employer needs them to stay'] },
  { id: 'why', question: 'Why you need the open work permit', options: ['To live with my spouse while they study / work', 'To support the household financially', 'To use my skills and experience in Canada', 'My current status is expiring'] },
  { id: 'work', question: 'What kind of work you intend to do', options: ['My profession / field of study', 'Any lawful work to support the family', 'I have a job offer already'] },
  { id: 'ties', question: 'Ties and intention at the end of the permit', options: ['We will leave when my spouse finishes', 'Family and property at home', 'We will apply to extend / other status lawfully'] },
  { id: 'history', question: 'Anything to explain', options: ['A previous refusal', 'A status gap', 'Nothing unusual'] },
];

const VISIT = [
  { id: 'purpose', question: 'Purpose of the trip', options: ['Visiting my spouse / child / parent', 'Tourism', 'Attending a graduation / wedding / event', 'Accompanying a family member', 'Business meetings'] },
  { id: 'host', question: 'Who you are visiting', options: ['A close family member with status in Canada', 'A friend', 'Nobody — hotel / tourism', 'My spouse who studies / works in Canada'] },
  { id: 'duration', question: 'Length and plan', options: ['Short trip (under 1 month)', '1-3 months', 'Up to 6 months', 'I have a return ticket / firm dates'] },
  { id: 'funds', question: 'Funding the trip', options: ['My own savings', 'Host pays', 'Family pays', 'Employer pays'] },
  { id: 'ties', question: 'Why you will return home', options: ['Job I must return to (approved leave)', 'Business I own', 'Property and assets', 'Children / spouse / parents at home', 'Ongoing studies'] },
  { id: 'travel', question: 'Travel history', options: ['Visited Canada before and left on time', 'Travelled to the US / UK / Schengen', 'First international trip', 'A previous refusal to explain'] },
];

const STUDY_INSIDE = [
  { id: 'reason', question: 'What are you asking for?', options: ['More time to finish my current program', 'Moving to a different school', 'Moving to a higher level of study', 'Restoring my status after it lapsed'] },
  { id: 'progress', question: 'How have your studies gone so far?', options: ['Good academic standing throughout', 'Full-time every semester', 'Had an authorized leave / reduced load', 'Repeated or deferred some courses'] },
  { id: 'why', question: 'Why do you need the extra time or the change?', options: ['Program is longer than my permit', 'Co-op / work term extends my end date', 'Changed program after reassessing my goals', 'The new school suits my field better', 'Course availability delayed my graduation'] },
  { id: 'funds', question: 'How are the remaining studies funded?', options: ['Own savings in Canada', 'Family support from home', 'Scholarship / assistantship', 'Part-time work allowed on my permit'] },
  { id: 'after', question: 'What will you do after graduating?', options: ['Apply for a PGWP', 'Return home to a job or business', 'Continue to a higher level of study'] },
];

const VISITOR_RECORD = [
  { id: 'reason', question: 'Why do you need to stay longer?', options: ['Continue visiting family', 'Medical treatment or recovery', 'Caring for a relative', 'Waiting on another IRCC application', 'Travel plans changed', 'Accompanying a family member studying or working here'] },
  { id: 'howLong', question: 'How much longer do you need?', options: ['A few weeks', 'A few months', 'Up to six months', 'Until a specific event or appointment'] },
  { id: 'support', question: 'How will you support yourself?', options: ['My own savings', 'My host / family in Canada pays', 'My spouse supports me', 'Pension / income from home'] },
  { id: 'status', question: 'Your current status', options: ['Status still valid — applying before it expires', 'Applying to restore status (within 90 days)', 'I hold a work or study permit and am changing to visitor'] },
  { id: 'ties', question: 'What guarantees you will leave?', options: ['Home, property or business at home', 'Job I must return to', 'Family waiting at home', 'Return ticket booked', 'Left Canada on time on previous visits'] },
];

const BUSINESS_VISIT = [
  { id: 'purpose', question: 'What is the business purpose?', options: ['Meetings with a Canadian company', 'Attending a conference or trade show', 'Negotiating or signing a contract', 'Site visit / equipment inspection', 'Exploring the Canadian market'] },
  { id: 'counterpart', question: 'Who are you meeting?', options: ['An existing client or supplier', 'A prospective partner', 'Event organisers / exhibitors', 'Our Canadian branch or affiliate'] },
  { id: 'role', question: 'Your position in your company', options: ['Owner / co-owner', 'Senior manager sent by my employer', 'Technical specialist', 'Sales / business development'] },
  { id: 'funding', question: 'Who pays for the trip?', options: ['My company', 'Myself', 'The Canadian company'] },
  { id: 'ties', question: 'Why you will return', options: ['I run / own the business at home', 'My job continues on return (approved leave)', 'Family at home', 'Property and assets', 'Previous visas used and respected'] },
];

const C11 = [
  { id: 'plan', question: 'What are you doing in Canada?', options: ['Starting a new business', 'Buying an existing business', 'Opening a Canadian branch of my company', 'Expanding a business I already started'] },
  { id: 'benefit', question: 'The significant benefit to Canada', options: ['Creating jobs for Canadians / PRs', 'Substantial investment', 'New technology or know-how', 'Exports / new markets', 'Benefit to a smaller or regional community'] },
  { id: 'experience', question: 'Your track record', options: ['I own and run a profitable business at home', 'Many years of management experience in this industry', 'Relevant degree and professional licences', 'Existing clients or contracts linked to Canada'] },
  { id: 'progress', question: 'What is already done?', options: ['Canadian company incorporated', 'Business plan completed', 'Premises leased', 'Funds transferred to a Canadian account', 'Offer of employment submitted in the Employer Portal', 'First hires or invoices'] },
  { id: 'intent', question: 'Your intentions', options: ['Grow the business while it needs my presence', 'Keep my home business running in parallel', 'Apply for permanent residence later through an eligible program'] },
];

const SUPER_VISA = [
  { id: 'purpose', question: 'Why are you visiting?', options: ['Spend time with my children and grandchildren', 'Help with a newborn grandchild', 'Support my child during an illness or life event', 'Holidays and family celebrations'] },
  { id: 'length', question: 'How long do you plan to stay?', options: ['Several months at a time', 'About a year', 'Longer visits spread over several years'] },
  { id: 'host', question: 'Your host', options: ["My child — a Canadian citizen", "My child — a permanent resident", 'My grandchild', 'They have a stable, well-paid job'] },
  { id: 'insurance', question: 'Insurance and medical', options: ['Canadian insurance bought, $100,000+ coverage', 'Insurance quote ready, will buy before travel', 'Medical exam done by a panel physician'] },
  { id: 'ties', question: 'Why you will return home', options: ['Home and property at home', 'Spouse / other children at home', 'Pension or income at home', 'Visited Canada or other countries before and returned on time'] },
];

const IRANIAN_OWP = [
  { id: 'status', question: 'Your current status in Canada', options: ['Work permit holder', 'Study permit holder', 'Visitor / visitor record', 'On maintained status'] },
  { id: 'time', question: 'How long have you been in Canada?', options: ['Less than a year', '1–2 years', 'More than 2 years'] },
  { id: 'why', question: 'Why you need an open work permit', options: ['My current permit is expiring', 'To work for any employer in my field', 'To support my family in Canada', 'Returning home is not safe or practical right now'] },
  { id: 'work', question: 'Your work in Canada', options: ['Working in my field', 'Job offer in hand', 'Looking for work in my profession'] },
  { id: 'family', question: 'Family situation', options: ['Spouse / children with me in Canada', 'Family remains in Iran', 'Single'] },
];

const PGWP = [
  { id: 'program', question: 'About your program', options: ['Completed on time, full-time', 'Program was 2+ years (3-year PGWP eligible)', 'Program under 2 years', 'Had an authorized leave / break'] },
  { id: 'work', question: 'Your work plans', options: ['Job offer in my field', 'Currently working part-time with the same employer', 'Looking for work in my field'] },
  { id: 'why', question: 'Why the PGWP matters to you', options: ['Gain Canadian experience in my field', 'Pathway to permanent residence', 'Support myself while I apply for other status'] },
  { id: 'status', question: 'Your status', options: ['Study permit still valid', 'Applying within 180 days of completion letter', 'On maintained status'] },
];

const RECONSIDERATION = [
  { id: 'error', question: 'What was wrong in the decision?', options: ['The officer overlooked a document I submitted', 'A fact was misread (dates, funds, ties)', 'The reasons contradict the evidence', 'Procedural fairness — no chance to respond'] },
  { id: 'evidence', question: 'What can you show now?', options: ['The overlooked document, highlighted', 'Updated bank statements', 'Employer / school letters', 'GCMS notes that contradict the letter'] },
  { id: 'ask', question: 'What are you asking for?', options: ['Reopen and reconsider on the existing record', 'Consider the attached new evidence', 'Reconsider before I pursue judicial review'] },
];

export const QUESTION_SETS = {
  study: STUDY,
  'study-minor': STUDY_MINOR,
  'study-inside': STUDY_INSIDE,
  'visitor-record': VISITOR_RECORD,
  'business-visit': BUSINESS_VISIT,
  c11: C11,
  'super-visa': SUPER_VISA,
  'iranian-owp': IRANIAN_OWP,
  owp: OWP,
  visit: VISIT,
  pgwp: PGWP,
  reconsideration: RECONSIDERATION,
};

export function questionsFor(kind) {
  return QUESTION_SETS[kind] || STUDY;
}

/** Back-compat: the study set. */
export const SOP_QUESTIONS = STUDY;

/** Render the applicant's selections + notes as prompt text. */
export function answersToText(answers = {}, kind = 'study') {
  const qs = questionsFor(kind);
  const lines = [];
  for (const q of qs) {
    const a = answers[q.id];
    if (!a) continue;
    const sel = (a.selected || []).filter(Boolean);
    const note = String(a.note || '').trim();
    if (!sel.length && !note) continue;
    lines.push(`${q.question}`);
    if (sel.length) lines.push(`  Selected: ${sel.join('; ')}`);
    if (note) lines.push(`  In their words: ${note}`);
  }
  return lines.join('\n');
}

/** Sanitize builder answers against the type's question set. */
export function cleanAnswers(raw, kind) {
  const qids = new Set(questionsFor(kind).map((q) => q.id));
  const answers = {};
  if (raw && typeof raw === 'object') {
    for (const [qid, a] of Object.entries(raw)) {
      if (!qids.has(qid) || !a) continue;
      answers[qid] = {
        selected: Array.isArray(a.selected) ? a.selected.map(String).slice(0, 12) : [],
        note: typeof a.note === 'string' ? a.note.slice(0, 2000) : '',
      };
    }
  }
  return answers;
}

