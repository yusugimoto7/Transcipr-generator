import { complete } from '../anthropic';
import { answersToText } from '../sopQuestions';

/**
 * Draft a Statement of Purpose / Study Plan (also usable as the Letter of
 * Explanation) for a study permit. Returns markdown-ish text.
 *
 * Uses the applicant's intake data plus, when present, their Study Plan builder
 * answers (app.sopAnswers). Never fabricates facts beyond what was provided.
 */
export async function generateSop(app) {
  const d = app.data || {};
  const builder = answersToText(app.sopAnswers || {});
  const system = `You are an expert Canadian study permit consultant who drafts
persuasive, honest Statements of Purpose. You write in clear, confident first-person
English. You address the visa officer's core concerns: genuine student, adequate
funds, a logical study plan, and strong ties that show the applicant will leave
Canada at the end of authorized stay (IRPA s.216). You NEVER invent facts — you use
only the details provided, and where a detail is missing you write a neutral
placeholder in [SQUARE BRACKETS] for the applicant to complete.`;

  const facts = `Applicant facts:
- Name: ${d.givenName || ''} ${d.familyName || ''}
- Citizenship / residence: ${d.citizenship || ''} / ${d.countryOfResidence || ''}
- Highest education: ${d.highestEducation || ''} at ${d.lastInstitution || ''} (${d.lastFieldOfStudy || ''}), grade ${d.gpa || ''}
- Program in Canada: ${d.programName || ''} (${d.levelOfStudy || ''}) at ${d.schoolName || ''}, ${d.schoolCity || ''}, ${d.schoolProvince || ''}
- Program dates: ${d.programStart || ''} to ${d.programEnd || ''}; tuition CAD ${d.tuitionCost || ''}
- Funding: source ${d.fundingSource || ''}; total funds CAD ${d.totalFunds || ''}; GIC ${d.gicAmount || ''}; details: ${d.fundsDetails || ''}
- Language: ${d.languageTest || ''} ${d.languageScore || ''}
- Current occupation: ${d.currentOccupation || ''} at ${d.employer || ''}
- Career goal: ${d.careerGoal || ''}
- Why this program/school: ${d.whyProgram || ''}
- Why Canada: ${d.whyCanada || ''}
- Ties to home country: ${d.homeTies || ''}
- Previous refusal: ${d.previousRefusal ? 'YES — ' + (d.refusalDetails || '') : 'No'}`;

  const instruction = `Write a Statement of Purpose (Study Plan) of about 600-800 words
addressed "Dear Visa Officer,", in first person. Open with one sentence of intent and the
applicant's name, age and citizenship. Then use these **bold** sections (house style):
**Educational and Professional Background**
**Reasons for studying [program] in Canada**
**Future Goals and Strong Ties to My Home Country**
**Financial Support Proof** — a short paragraph summarising funds/supporter.
Close with a respectful paragraph and "Sincerely yours, <name>".

Requirements:
- First person, honest, specific, no clichés or exaggeration.
- If previous refusal is YES, add a short honest paragraph addressing it.
- Use [SQUARE BRACKET] placeholders for any missing specifics.
- Output plain text with **bold** section headings, no preamble.

${facts}
${
  builder
    ? `\nThe applicant answered these Study Plan questions — weave their selections and their own words naturally into the relevant sections (do not list them verbatim):\n${builder}`
    : ''
}`;

  const text = await complete({
    system,
    content: instruction,
    maxTokens: 3000,
    temperature: 0.5,
  });
  return text;
}
