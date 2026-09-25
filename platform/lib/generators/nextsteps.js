import { checklistStatus } from '../checklist';
import { requiredMissing } from '../schema';
import { getAppType, formsFor } from '../appTypes';

/**
 * Build the "Missing documents & next steps" note for an application.
 * Deterministic (no AI call) so it is produced on every generation run,
 * even without an API key. Returns { missingDocuments, missingFields,
 * nextSteps, text } where text is a markdown-ish document.
 */
export function buildNextStepsNote(app) {
  const data = app.data || {};
  // Items the firm prepares (flight/hotel bookings, letters) are not the client's to send.
  const missingDocuments = checklistStatus(app).filter((c) => !c.provided && c.party !== 'firm');
  const missingFields = requiredMissing(data, app.type);
  const generatedKeys = new Set((app.generated || []).map((g) => g.key));

  const nextSteps = [];
  if (missingFields.length) {
    nextSteps.push(
      `Complete the ${missingFields.length} remaining intake field(s) so your forms and letters are complete.`
    );
  }
  for (const m of missingDocuments) {
    nextSteps.push(`Obtain and upload: ${m.code} ${m.label}${m.hint ? ` — ${m.hint}` : ''}`);
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
  const t = getAppType(app.type);
  const forms = formsFor(app).map((f) => f.label.split(' — ')[0]).join(', ');
  nextSteps.push(
    `Sign in to the IRCC account, upload the documents${forms ? ` and forms (${forms})` : ''}, pay the current IRCC fee for ${t.title}${t.where === 'outside' ? ' and the biometrics fee if biometrics are required' : ''}, and follow the instructions IRCC sends.`
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
    for (const m of missingDocuments) lines.push(`- ${m.code} ${m.label}${m.cond ? ` (${m.cond})` : ''}${m.hint ? ` — ${m.hint}` : ''}`);
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
    missingDocuments: missingDocuments.map((m) => `${m.code} ${m.label}${m.cond ? ` (${m.cond})` : ''}`),
    missingFields: missingFields.map((f) => f.label),
    nextSteps,
    text: lines.join('\n'),
  };
}
