import { complete } from '../anthropic';
import { answersToText } from '../sopQuestions';

/** Uploaded document categories most useful for drafting the SOP. */
const SOP_DOC_CATEGORIES = ['loa', 'transcripts', 'job-offer', 'language', 'passport', 'sop'];

/** Choose the uploaded documents to feed into the SOP (relevant ones, capped). */
export function selectSopDocs(app, max = 6) {
  const docs = app.documents || [];
  const relevant = docs.filter((d) => SOP_DOC_CATEGORIES.includes(d.category));
  const chosen = (relevant.length ? relevant : docs).slice(0, max);
  return chosen;
}

/**
 * Build the SOP system + instruction prompt. Shared by the buffered and
 * streaming generators so both produce identical letters. When `hasDocs` is
 * true, the caller appends the applicant's documents as content blocks.
 */
export function buildSopPrompt(app, hasDocs = false) {
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
addressed "Dear Visa Officer,", in first person. Open with one sentence of intent plus the
applicant's name, age and citizenship. Then use these **bold** sections (house style used by
this firm):
**Educational and Professional Background**
**Reasons for studying [program] in Canada**
**Future Goals and Strong Ties to My Home Country**
**Financial Support Proof** — a short paragraph summarising funds/supporter.
Close with a respectful paragraph and "Sincerely yours, <name>".

Requirements:
- First person, honest, specific, confident — no clichés or exaggeration.
- Be concrete: name actual courses, employers, roles, dates, achievements, the program,
  institution, tuition and funds. Pull these from the intake facts AND from the applicant's
  uploaded documents below (CV, letter of acceptance, transcripts, job offer).
- Minimise placeholders: only use a [SQUARE BRACKET] when a specific fact is genuinely
  absent from BOTH the intake facts and the documents. Prefer real details every time.
- If previous refusal is YES, add a short honest paragraph addressing it.
- Output plain text with **bold** section headings, no preamble.

${facts}
${
  builder
    ? `\nThe applicant answered these Study Plan questions — weave their selections and their own words naturally into the relevant sections (do not list them verbatim):\n${builder}`
    : ''
}${
    hasDocs
      ? '\n\nThe applicant\'s uploaded documents are attached below — read them and extract concrete facts (courses, employers, roles, dates, achievements, program, institution, amounts) to make the letter specific and true.'
      : ''
  }`;

  return { system, instruction };
}

/**
 * Draft a Statement of Purpose / Study Plan (buffered). Uses intake data, the
 * Study Plan builder answers, and (optionally) the applicant's uploaded document
 * content blocks so the letter is specific and dynamic.
 */
export async function generateSop(app, docBlocks = []) {
  const { system, instruction } = buildSopPrompt(app, docBlocks.length > 0);
  const content = docBlocks.length
    ? [{ type: 'text', text: instruction }, ...docBlocks]
    : instruction;
  return complete({ system, content, maxTokens: 3000 });
}
