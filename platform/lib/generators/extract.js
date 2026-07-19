import { completeJson } from '../anthropic';
import { allFields } from '../schema';

/**
 * Build a Claude field dictionary describing what we want extracted.
 */
function fieldGuide(type) {
  return allFields(type)
    .filter((f) => f.type !== 'bool') // booleans are confirmed by the user
    .map((f) => {
      let desc = `- ${f.id} (${f.type}): ${f.label}`;
      if (f.options) desc += ` [one of: ${f.options.join(', ')}]`;
      if (f.note) desc += ` — ${f.note}`;
      return desc;
    })
    .join('\n');
}

/**
 * Extract intake field values from uploaded documents.
 *
 * @param {Array} docBlocks - Anthropic content blocks (document/image) for uploads.
 * @param {object} existing - already-known field values (to avoid overwriting).
 * @param {string} type - application type.
 * @returns {Promise<{fields: object, confidence: object, notes: string[]}>}
 */
export async function extractFromDocuments(docBlocks, existing = {}, type = 'study-permit') {
  const system = `You are an assistant for a Canadian immigration document platform.
You read an applicant's raw documents (passport, letter of acceptance, transcripts,
bank statements, GIC, language test) and extract structured data to pre-fill their
study permit intake form.

Rules:
- Only extract values you can actually see in the documents. Never invent data.
- Dates must be ISO format YYYY-MM-DD.
- For fields with a fixed option list, pick the closest option exactly as written.
- Money fields are numbers only (no currency symbols or commas).
- If a value is ambiguous or not present, omit that field entirely.`;

  const guide = fieldGuide(type);

  const instruction = `Here are the fields to extract. Return JSON of the form:
{
  "fields": { "<fieldId>": <value>, ... },       // only fields you found
  "confidence": { "<fieldId>": "high"|"medium"|"low", ... },
  "notes": [ "short note about anything uncertain or worth the applicant checking" ]
}

Fields:
${guide}

Already-known values (do NOT include these unless a document clearly corrects them):
${JSON.stringify(existing)}`;

  const content = [{ type: 'text', text: instruction }, ...docBlocks];

  const result = await completeJson({
    system,
    content,
    maxTokens: 3000,
    temperature: 0,
  });

  return {
    fields: result.fields || {},
    confidence: result.confidence || {},
    notes: Array.isArray(result.notes) ? result.notes : [],
  };
}
