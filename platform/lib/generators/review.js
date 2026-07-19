import { completeJson } from '../anthropic';
import { buildChecklist } from '../checklist';
import { requiredMissing } from '../schema';

/**
 * AI readiness review: compares the applicant's data + uploaded documents against
 * the checklist and known study-permit refusal risks, and returns actionable items.
 */
export async function reviewApplication(app) {
  const data = app.data || {};
  const checklist = buildChecklist(data);
  const uploadedKeys = (app.documents || []).map((d) => d.category).filter(Boolean);
  const missingRequiredFields = requiredMissing(data).map((f) => f.label);

  const system = `You are a senior Canadian study permit case reviewer. You assess an
applicant's file for completeness and for common refusal risks under IRPA s.216
(dual intent, funds, ties to home country, purpose of visit, study plan credibility).
Be concrete and practical. Do not give legal advice or guarantees.`;

  const instruction = `Review this study permit file and return JSON:
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
${checklist.map((c) => `- ${c.label} [key:${c.key}]`).join('\n')}

Uploaded document categories: ${uploadedKeys.length ? uploadedKeys.join(', ') : '(none yet)'}

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
