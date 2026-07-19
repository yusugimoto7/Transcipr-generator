import { complete } from '../anthropic';

/** Financial summary / proof-of-funds cover sheet. */
export async function generateFinancialSummary(app) {
  const d = app.data || {};
  const system = `You prepare clear financial summary cover sheets for Canadian study
permit applications. You organize the applicant's funds so a visa officer can quickly
see that tuition and living costs are covered. Use only provided figures; mark unknowns
with [SQUARE BRACKETS]. Do not fabricate amounts.`;

  const instruction = `Create a "Financial Summary" document for this applicant.
Include:
- A short opening paragraph.
- A funds breakdown (as lines "Item: CAD amount"): tuition cost, tuition already paid,
  GIC, total available funds, and any other sources from the description.
- A one-year cost-of-living note (IRCC single-applicant living funds outside Quebec is
  CAD 20,635/year as of 2024; state this as guidance).
- A closing line confirming sufficiency.
Use **bold** headings, plain text output, no preamble.

Figures:
- Tuition (CAD/yr): ${d.tuitionCost || '[unknown]'}
- Tuition already paid (CAD): ${d.tuitionPaid || '0'}
- GIC (CAD): ${d.gicAmount || '0'}
- Total funds available (CAD): ${d.totalFunds || '[unknown]'}
- Funding source: ${d.fundingSource || '[unknown]'}
- Sponsor: ${d.sponsorName || '(none)'}
- Description: ${d.fundsDetails || '[none provided]'}`;

  return complete({ system, content: instruction, maxTokens: 1500, temperature: 0.3 });
}

/** Submission cover letter listing enclosed documents. */
export async function generateCoverLetter(app, checklistLabels = []) {
  const d = app.data || {};
  const system = `You write concise, professional cover letters for Canadian immigration
submissions. Formal but plain English. Use only provided facts.`;

  const instruction = `Write a submission cover letter addressed to "Immigration, Refugees
and Citizenship Canada (IRCC)" for a study permit application.
Include: applicant name & passport number, the program & institution, a one-sentence
purpose, and a bulleted "Enclosed documents" list. Keep under 300 words. Plain text,
**bold** headings, no preamble.

Applicant: ${d.givenName || ''} ${d.familyName || ''}
Passport: ${d.passportNumber || '[passport no.]'}
Program: ${d.programName || ''} at ${d.schoolName || ''}, ${d.schoolCity || ''}
Intended entry: ${d.entryDate || '[date]'}
Enclosed documents:
${checklistLabels.map((l) => `- ${l}`).join('\n')}`;

  return complete({ system, content: instruction, maxTokens: 1200, temperature: 0.3 });
}
