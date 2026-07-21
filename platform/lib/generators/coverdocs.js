import { complete } from '../anthropic';
import { signatureBlock, getFirm } from '../firm';
import { buildChecklist } from '../checklist';

/** Financial summary / proof-of-funds report (itemized, house style). */
export async function generateFinancialSummary(app) {
  const d = app.data || {};
  const system = `You prepare clear "Financial Summary Report" cover sheets for Canadian
study permit applications in the style of a Regulated Canadian Immigration Consultant.
You organize the applicant's (and any supporter's) funds so a visa officer can quickly
see that tuition and living costs are covered. Use only provided figures; mark unknowns
with [SQUARE BRACKETS]. Never fabricate amounts.`;

  const instruction = `Create a "Financial Summary Report" for this applicant. Structure:
- A short opening paragraph naming the applicant, program and institution.
- **Applicant's financial belongings** — bullet list "Item: amount CAD" (bank balances, GIC).
- **Supporter's financial belongings** (if a supporter/sponsor is named) — bullet list
  (bank accounts, property/real estate, vehicle), each "Item: approx. amount CAD".
- **Tuition** — down payment already paid to the institution, and remaining tuition.
- **Cost of living note** — IRCC single-applicant living funds outside Quebec is
  CAD 20,635/year (2024); state this as the benchmark.
- **Conclusion** — one line confirming funds are sufficient for tuition + living costs.
Use **bold** headings, plain text, no preamble.

Figures:
- Applicant name: ${d.givenName || ''} ${d.familyName || ''}
- Program: ${d.programName || ''} at ${d.schoolName || ''}
- Applicant funds (CAD): ${d.totalFunds || '[unknown]'}
- GIC (CAD): ${d.gicAmount || '0'}
- Tuition cost (CAD/yr): ${d.tuitionCost || '[unknown]'}
- Tuition already paid / down payment (CAD): ${d.tuitionPaid || '0'}
- Funding source: ${d.fundingSource || '[unknown]'}
- Supporter: ${d.sponsorName || '(none named)'}
- Description of funds/assets: ${d.fundsDetails || '[none provided]'}`;

  return complete({ system, content: instruction, maxTokens: 1800 });
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
  const checklist = buildChecklist(d).map((c) => c.label);
  const sopAnswers = app.sopAnswers || {};

  const system = `You are ${firm.repName}, a Regulated Canadian Immigration Consultant
(RCIC# ${firm.rcicNumber}) at ${firm.company}. You write formal, persuasive study permit
submission letters to IRCC on behalf of your client. Your letters are honest and specific,
address IRPA s.216 (genuine student, funds, ties, intent to leave Canada), and cite
relevant Federal Court precedents. You never fabricate facts — use only what the client
provided, and put [SQUARE BRACKET] placeholders where a specific detail is missing.`;

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
**Strong Family Ties to Home Country** — family, roots, why they will return.
**Financial Support** — a short paragraph, then itemized "Her/His financial belongings are:"
bullet lines for each asset with CAD amounts, and the tuition down payment.
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
