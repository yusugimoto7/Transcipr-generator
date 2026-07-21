import { complete } from '../anthropic';
import { signatureBlock, getFirm } from '../firm';
import { buildChecklist } from '../checklist';
import { pronouns, BOILERPLATE, COST_BENCHMARK } from '../applicant';

function financeFacts(d) {
  return `- Applicant: ${d.givenName || ''} ${d.familyName || ''}
- Program: ${d.programName || ''} at ${d.schoolName || ''}, ${d.schoolCity || ''}
- Applicant funds (CAD): ${d.totalFunds || '[unknown]'}
- GIC (CAD): ${d.gicAmount || '0'}
- Tuition cost (CAD/yr): ${d.tuitionCost || '[unknown]'}
- Tuition already paid / down payment (CAD): ${d.tuitionPaid || '0'}
- Funding source: ${d.fundingSource || '[unknown]'}
- Supporter: ${d.sponsorName || '(none named)'}
- Description of funds/assets: ${d.fundsDetails || '[none provided]'}`;
}

/** Financial summary report with expense + source-of-funds tables (house style). */
export async function generateFinancialSummary(app) {
  const d = app.data || {};
  const p = pronouns(d);
  const system = `You prepare clear "Financial Summary Report" sheets for Canadian study
permit applications in the style of a Regulated Canadian Immigration Consultant. You lay
out costs and sources of funds in simple tables. Use only provided figures; mark unknowns
with [SQUARE BRACKETS]. Never fabricate amounts. Use the pronouns ${p.subj}/${p.pos}.`;

  const instruction = `Create a "Financial Summary Report". Structure:
- A one-line opening naming the applicant, program and institution.
- **First-year expenses** — a simple table (Item | Amount CAD): Tuition (first year),
  Living cost (use CAD ${COST_BENCHMARK.livingPerYear} for a single applicant outside Quebec),
  Travel (approx. CAD ${COST_BENCHMARK.travelEstimate}), and a Total row.
- **Sources of funds** — a table (Source | Amount CAD): applicant bank balance(s), GIC if
  any, supporter bank balance(s), and the tuition deposit already paid.
- **Financial ties / assets** — a table (Asset | Estimated Value CAD) for any real estate,
  vehicles or business assets mentioned in the description.
- **Conclusion** — one line confirming total funds comfortably cover first-year costs.
Render tables as aligned plain-text rows using " | " separators. Use **bold** headings,
no preamble.

${financeFacts(d)}`;

  return complete({ system, content: instruction, maxTokens: 2000 });
}

/** Financial cover letter — first-person prose to the officer. */
export async function generateFinancialCoverLetter(app) {
  const d = app.data || {};
  const p = pronouns(d);
  const system = `You write first-person financial cover letters to a Canadian visa officer
for study permit applicants, in the style of a Regulated Canadian Immigration Consultant's
client file. Honest, specific, no exaggeration. Use only provided figures; use [SQUARE
BRACKET] placeholders for missing specifics.`;

  const instruction = `Write a "Financial Cover Letter" (about 300-450 words) addressed
"Dear Visa Officer,", first person as the applicant. Cover:
- Total funds available and who is funding the studies.
- A short source-of-funds narrative. ${BOILERPLATE.sourceOfFunds}
- ${BOILERPLATE.sanctionsTransfer}
- The tuition deposit already paid to the institution.
- A closing line of commitment. End "Sincerely, <name>".
Plain text, **bold** headings optional, no preamble.

${financeFacts(d)}
- Citizenship: ${d.citizenship || '[citizenship]'}`;

  return complete({ system, content: instruction, maxTokens: 1500 });
}

/**
 * Full RCIC Submission Letter in Sugimoto Visa house style.
 * Sections: RE header + applicant block, intro (as RCIC), Background, Purpose of
 * Visit, Strong Family Ties, Financial Support (itemized), Case Laws (Federal
 * Court precedents), closing request, enclosed documents, RCIC signature.
 */
export async function generateSubmissionLetter(app) {
  const d = app.data || {};
  const firm = getFirm();
  const p = pronouns(d);
  const checklist = buildChecklist(d).map((c) => c.label);
  const sopAnswers = app.sopAnswers || {};

  const system = `You are ${firm.repName}, a Regulated Canadian Immigration Consultant
(RCIC# ${firm.rcicNumber}) at ${firm.company}. You write formal, persuasive study permit
submission letters to IRCC on behalf of your client. Your letters are honest and specific,
address IRPA s.216 (genuine student, funds, ties, intent to leave Canada), and cite
relevant Federal Court precedents. You never fabricate facts — use only what the client
provided, and put [SQUARE BRACKET] placeholders where a specific detail is missing.
Refer to the client consistently as ${p.honorific ? p.honorific + ' ' : ''}<surname> and
use the pronouns ${p.subj}/${p.obj}/${p.pos} throughout — never mix genders.`;

  const facts = `Client facts:
- Applicant: ${d.givenName || ''} ${d.familyName || ''}
- DOB: ${d.dob || '[DOB]'}; Citizenship: ${d.citizenship || '[citizenship]'}; UCI: ${d.uci || '-'}
- Category: Study Permit Made Outside of Canada
- Program: ${d.programName || ''} (${d.levelOfStudy || ''}) at ${d.schoolName || ''}, ${d.schoolCity || ''}, ${d.schoolProvince || ''}
- Education: ${d.highestEducation || ''}, ${d.lastInstitution || ''} (${d.lastFieldOfStudy || ''}), grade ${d.gpa || ''}
- Occupation: ${d.currentOccupation || ''} at ${d.employer || ''}
- Funds: applicant CAD ${d.totalFunds || '[?]'}; GIC ${d.gicAmount || '0'}; supporter ${d.sponsorName || '(none)'}; tuition paid ${d.tuitionPaid || '0'}; details: ${d.fundsDetails || ''}
- Career goal: ${d.careerGoal || ''}
- Ties to home: ${d.homeTies || ''}
- Why program/school: ${d.whyProgram || ''} ${d.whyCanada || ''}
- Previous refusal: ${d.previousRefusal ? 'YES — ' + (d.refusalDetails || '') : 'No'}
- Study-plan builder answers: ${JSON.stringify(sopAnswers)}`;

  const instruction = `Write the RCIC submission letter. Follow this exact structure:

Date: [today's date]
Immigration, Refugees, and Citizenship Canada
Online Application

Dear Sir or Madam,

RE: Application for Temporary Resident Visa from Outside Canada
Applicant: <name>
D.O.B: <dob>
UCI No.: <uci or ->
Citizenship: <citizenship>
Category: Study Permit Made Outside of Canada

Then an opening paragraph beginning "I am writing this submission letter as a Regulated
Canadian Immigration Consultant (RCIC) to support the application of my client, <name>,
for a Study Permit Made Outside of Canada to pursue <program> at <school>..."

Then these **bold** sections:
**Background** — education, work history, achievements.
**Purpose of Visit** — why this program/school, career advancement, any job offer on return.
**Strong Family Ties to Home Country** — family, roots, why they will return. ${BOILERPLATE.temporaryIntent}
**Financial Support** — a short paragraph, then itemized "${p.pos === 'her' ? 'Her' : p.pos === 'his' ? 'His' : 'Their'} financial belongings are:"
bullet lines for each asset with CAD amounts, and the tuition down payment. ${BOILERPLATE.sanctionsTransfer}
**Case Laws** — cite Al Aridi v. Canada (Citizenship and Immigration), 2019 FC 381 and
Hernandez Bonilla v. Canada (MCI), 2007 FC 20; briefly explain each and tie to procedural
fairness and the client's credible, well-supported application.
A closing paragraph requesting favourable consideration and stating the applicant poses no
risk of overstaying and will return home.

Then: "In support of her application, I have also included the following documents for your
perusal:" followed by a list based on: ${checklist.join(', ')}.

End with EXACTLY this signature block (do not alter it):
${signatureBlock()}

Output plain text with **bold** headings. No preamble, no markdown code fences.

${facts}`;

  return complete({ system, content: instruction, maxTokens: 3500 });
}

// Backwards-compatible alias (older callers referenced generateCoverLetter).
export const generateCoverLetter = (app) => generateSubmissionLetter(app);
