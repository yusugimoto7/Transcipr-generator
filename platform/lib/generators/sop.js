import { complete } from '../anthropic';
import { answersToText } from '../sopQuestions';

/** Uploaded document categories most useful for drafting the SOP. */
const SOP_DOC_CATEGORIES = ['cv', 'loa', 'transcripts', 'certificates', 'job-offer', 'language', 'sop'];

/** Choose the uploaded documents to feed into the SOP (relevant ones, capped). */
export function selectSopDocs(app, max = 8) {
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

  const instruction = `Write an EXTENSIVE Statement of Purpose (Study Plan) of about
1,100-1,500 words (a full 3-4 page letter), addressed "Dear Visa Officer,", in first
person. Open with a paragraph stating intent plus the applicant's name, age and
citizenship. Then use these **bold** sections (the firm's house style):

**Educational and Professional Background** — a detailed narrative: schooling and
grades/achievements, each job with employer, role, dates and what they did/learned,
plus courses, certificates, competitions and language proficiency.
**Reasons for studying [program] in Canada** — multiple paragraphs covering: why this
field; why suitable programs are not available or practical in the home country; why
Canada; why THIS institution and program specifically (name actual courses, co-op or
program features when known); and how it connects to a job offer, promotion or concrete
opportunity awaiting the applicant.
**Future Goals and Strong Ties to My Home Country** — short-term career plan after
graduation, long-term ambition (e.g. a business or leadership goal), and the ties that
guarantee return: family members at home, property/assets, job or business waiting,
community roots.
**Financial Support Proof** — itemize the funds: applicant's bank balance, supporter and
their assets (accounts, property, vehicle), tuition already paid, and if from a sanctioned
country note that funds transfer via licensed exchange offices.
Close with a paragraph committing to respect Canada's laws and leave at the end of the
authorized stay, then "Sincerely yours, <name>".

Requirements:
- First person, honest, specific, confident — no clichés or exaggeration.
- Be concrete everywhere: real courses, employers, roles, dates, achievements, program,
  institution, tuition and funds — pulled from the intake facts AND the uploaded
  documents (CV, letter of acceptance, transcripts, job offer).
- Minimise placeholders: only use a [SQUARE BRACKET] when a fact is genuinely absent
  from BOTH the intake and the documents.
- If previous refusal is YES, add an honest paragraph addressing it directly.
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
  return complete({ system, content, maxTokens: 5000 });
}
