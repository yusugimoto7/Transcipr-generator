import { completeJson } from '../ai';
import { checklistStatus } from '../checklist';
import { getAppType } from '../appTypes';
import { requiredMissing } from '../schema';
import { emailFactsText } from '../emails';
import { notesText } from '../notes';

/**
 * AI readiness review: compares the applicant's data + uploaded documents against
 * the checklist and known study-permit refusal risks, and returns actionable items.
 */
export async function reviewApplication(app) {
  const data = app.data || {};
  const checklist = checklistStatus(app);
  const uploadedKeys = (app.documents || []).map((d) => d.category).filter(Boolean);
  const service = getAppType(app.type);
  const missingRequiredFields = requiredMissing(data, app.type).map((f) => f.label);

  const system = `You are a senior Canadian temporary-residence case reviewer (this file: ${service.title}${service.service ? `, service ${service.service}` : ''}). You assess an
applicant's file for completeness and for common refusal risks under IRPA s.216
(dual intent, funds, ties to home country, purpose of visit, study plan credibility).
Be concrete and practical. Do not give legal advice or guarantees.`;

  const checkLines = (app.documents || [])
    .filter((d) => d.verification && d.verification.status !== 'green')
    .map((d) => {
      const notes = (app.notes || []).filter((n) => n.docId === d.id).map((n) => `${n.by?.name || 'team'}: ${n.text.replace(/\s+/g, ' ').trim()}`);
      return `- ${d.filename} [${d.verification.status.toUpperCase()}]: ${d.verification.findings.filter((f) => f.severity !== 'low').map((f) => f.text).join(' | ') || 'minor issues'}${d.verification.cleared ? ` (the team checked this and marked it OK to move forward — ${d.verification.cleared.by})` : d.verification.reviewedBy ? ` (checked and signed off by ${d.verification.reviewedBy})` : ''}${notes.length ? ` — TEAM NOTE: ${notes.join(' / ')}` : ''}`;
    })
    .join('\n');
  const instruction = `Review this ${service.title} file and return JSON:
{
  "readinessScore": 0-100,
  "summary": "2-3 sentence plain-language assessment",
  "missingDocuments": ["checklist items not yet uploaded"],
  "weaknesses": [
     { "area": "Funds|Ties|Study plan|Documents|History|Other",
       "issue": "what is weak or risky",
       "fix": "concrete action to strengthen it",
       "severity": "high|medium|low" }
  ],
  "strengths": ["short positives"]
}

Applicant data:
${JSON.stringify(data, null, 2)}

Checklist (required for this applicant):
${checklist.map((c) => `- ${c.code} ${c.label}${c.cond ? ` (${c.cond})` : ''} — ${c.provided ? 'PROVIDED' : c.party === 'firm' ? 'prepared by the firm' : 'MISSING'}`).join('\n')}
${checkLines ? `\nDocument check (each document read against its translation, the intake and the passport):\n${checkLines}\nTreat red items as refusal risks to fix before submission.` : ''}

Uploaded document categories: ${uploadedKeys.length ? uploadedKeys.join(', ') : '(none yet)'}
${emailFactsText(app) ? `\n${emailFactsText(app)}\nUse them to spot gaps and inconsistencies (e.g. an email that contradicts the intake or a document, or a promised document still missing).\n` : ''}${notesText(app) ? `\n${notesText(app)}\nWhen a note records a decision about a document or an issue (approved as it is, explained, being fixed), reflect it: do not list that issue as a problem to fix, and mention the decision where relevant.\n` : ''}

Required intake fields still empty: ${
    missingRequiredFields.length ? missingRequiredFields.join(', ') : '(none)'
  }`;

  const result = await completeJson({
    system,
    content: instruction,
    maxTokens: 2500,
    temperature: 0.2,
  });

  return {
    ...result,
    generatedAt: new Date().toISOString(),
  };
}
