import { buildChecklist } from '../checklist';
import { requiredMissing } from '../schema';

/**
 * Build the "Missing documents & next steps" note for an application.
 * Deterministic (no AI call) so it is produced on every generation run,
 * even without an API key. Returns { missingDocuments, missingFields,
 * nextSteps, text } where text is a markdown-ish document.
 */
export function buildNextStepsNote(app) {
  const data = app.data || {};
  const checklist = buildChecklist(data);
  const uploaded = new Set((app.documents || []).map((d) => d.category).filter(Boolean));
  const missingDocuments = checklist.filter((c) => !uploaded.has(c.key));
  const missingFields = requiredMissing(data, app.type);
  const generatedKeys = new Set((app.generated || []).map((g) => g.key));

  const nextSteps = [];
  if (missingFields.length) {
    nextSteps.push(
      `Complete the ${missingFields.length} remaining intake field(s) so your forms and letters are complete.`
    );
  }
  for (const m of missingDocuments) {
    nextSteps.push(`Obtain and upload: ${m.label} — ${m.hint}`);
  }
  if (!generatedKeys.has('sop')) {
    nextSteps.push('Generate your Statement of Purpose, then personalize it in your own words.');
  }
  nextSteps.push(
    'Review every generated document against your original records — correct anything the AI drafted that is not accurate.'
  );
  nextSteps.push(
    'Transcribe the IMM data-sheet values into the official IRCC fillable PDFs, then click "Validate" on each form to produce the barcode page.'
  );
  nextSteps.push(
    'Create/sign in to your IRCC secure account, upload the documents, pay the study permit fee (CAD 150) and biometrics fee (CAD 85), and give biometrics at a collection point when instructed.'
  );
  if (missingDocuments.some((m) => m.key === 'medical')) {
    nextSteps.push(
      'If your country/program requires it, book an upfront medical exam with an IRCC panel physician.'
    );
  }
  if (app.review?.weaknesses?.length) {
    for (const w of app.review.weaknesses.filter((x) => x.severity === 'high')) {
      nextSteps.push(`Address review finding (${w.area}): ${w.fix}`);
    }
  }

  const lines = [];
  lines.push('# Missing documents');
  if (missingDocuments.length) {
    for (const m of missingDocuments) lines.push(`- ${m.label} — ${m.hint}`);
  } else {
    lines.push('All checklist documents have been uploaded. Well done.');
  }
  lines.push('');
  if (missingFields.length) {
    lines.push('# Intake fields still empty');
    for (const f of missingFields) lines.push(`- ${f.label}`);
    lines.push('');
  }
  lines.push('# Suggested next steps');
  nextSteps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('');
  lines.push(
    'This note is generated automatically from your file. It is guidance, not legal advice — always follow the current instructions on the IRCC website for your country.'
  );

  return {
    missingDocuments: missingDocuments.map((m) => m.label),
    missingFields: missingFields.map((f) => f.label),
    nextSteps,
    text: lines.join('\n'),
  };
}
