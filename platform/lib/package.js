import JSZip from 'jszip';
import { readGenerated } from './uploads';
import { buildChecklist } from './checklist';
import { requiredMissing } from './schema';

const DOC_ORDER = [
  ['cover-letter', '01_Submission_Cover_Letter.pdf'],
  ['sop', '02_Statement_of_Purpose.pdf'],
  ['financial-summary', '03_Financial_Summary.pdf'],
  ['imm1294', '04_IMM1294_Study_Permit_DataSheet.pdf'],
  ['imm5645', '05_IMM5645_Family_Information_DataSheet.pdf'],
];

function manifest(app) {
  const d = app.data || {};
  const checklist = buildChecklist(d);
  const uploaded = new Set((app.documents || []).map((x) => x.category));
  const missingFields = requiredMissing(d).map((f) => f.label);
  const generatedKeys = new Set((app.generated || []).map((g) => g.key));

  const lines = [];
  lines.push('CANADA STUDY PERMIT — SUBMISSION PACKAGE');
  lines.push('=========================================');
  lines.push('');
  lines.push(`Applicant: ${d.givenName || ''} ${d.familyName || ''}`.trim());
  lines.push(`Passport: ${d.passportNumber || '(not provided)'}`);
  lines.push(`Program: ${d.programName || ''} at ${d.schoolName || ''}`.trim());
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('IMPORTANT');
  lines.push('---------');
  lines.push('These documents are AI-assisted DRAFTS built from your intake answers.');
  lines.push('Review and verify every document against your originals and current IRCC');
  lines.push('instructions before submitting. This package is not legal advice.');
  lines.push('');
  lines.push('For IMM data sheets: transcribe the values into the official fillable IRCC');
  lines.push('PDF and click "Validate" to generate the required barcode.');
  lines.push('');
  lines.push('INCLUDED GENERATED DOCUMENTS');
  lines.push('----------------------------');
  for (const [key, name] of DOC_ORDER) {
    lines.push(`${generatedKeys.has(key) ? '[x]' : '[ ]'} ${name}`);
  }
  lines.push('');
  lines.push('DOCUMENT CHECKLIST (upload these to IRCC)');
  lines.push('----------------------------------------');
  for (const c of checklist) {
    lines.push(`${uploaded.has(c.key) ? '[x]' : '[ ]'} ${c.label}`);
    lines.push(`      ${c.hint}`);
  }
  if (missingFields.length) {
    lines.push('');
    lines.push('INTAKE FIELDS STILL EMPTY');
    lines.push('-------------------------');
    for (const m of missingFields) lines.push(`- ${m}`);
  }
  if (app.review) {
    lines.push('');
    lines.push(`LAST AI READINESS SCORE: ${app.review.readinessScore}/100`);
    if (app.review.summary) lines.push(app.review.summary);
  }
  lines.push('');
  return lines.join('\n');
}

/** Build a ZIP (Uint8Array) of all generated docs + a submission guide. */
export async function buildSubmissionZip(app) {
  const zip = new JSZip();
  zip.file('00_README_Submission_Guide.txt', manifest(app));

  const generated = app.generated || [];
  const nameByKey = Object.fromEntries(DOC_ORDER);
  for (const g of generated) {
    try {
      const bytes = await readGenerated(app.id, g.stored);
      const name = nameByKey[g.key] || g.filename || `${g.key}.pdf`;
      zip.file(name, bytes);
    } catch {
      // Missing file on disk — skip; the manifest still records it.
    }
  }
  return zip.generateAsync({ type: 'uint8array' });
}
