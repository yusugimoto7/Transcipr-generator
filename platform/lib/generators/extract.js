import { completeJson } from '../ai';
import { getSchema, STEP_ABOUT, SAME_PERSON_FIELDS } from '../schema';
import { getAppType } from '../appTypes';
import { CATEGORY_KEYS } from './classify';

/** Who a document can belong to (documentOwners in the model's answer). */
export const OWNERS = ['applicant', 'spouse', 'child', 'parent', 'host', 'sponsor', 'other'];

/**
 * The fields to extract, grouped by intake section, each section saying whom
 * it describes — so a child's or spouse's document fills that person's
 * fields and never the applicant's.
 */
function fieldGuide(type) {
  return getSchema(type)
    .steps.map((step) => {
      const fields = step.fields
        .filter((f) => f.type !== 'bool') // booleans are confirmed by the user
        .map((f) => {
          let desc = `- ${f.id} (${f.type}): ${f.label}`;
          if (f.options) desc += ` [one of: ${f.options.join(' | ')}]`;
          if (f.note) desc += ` — ${f.note}`;
          return desc;
        });
      if (!fields.length) return '';
      return `## ${step.title} — about ${STEP_ABOUT[step.id] || 'THE APPLICANT'}\n${fields.join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

function samePersonRules(type) {
  const steps = new Set(getSchema(type).steps.map((s) => s.id));
  return SAME_PERSON_FIELDS.filter((r) => steps.has(r.whenStep))
    .map((r) => `- ${r.fields.join(' and ')} name the same person — fill both.`)
    .join('\n');
}

const EDUCATION_GUIDE = `Education level (highestEducation): the highest diploma or degree the APPLICANT has
COMPLETED, from their own diplomas, degree certificates and transcripts — never a school
they (or a child) attend now. Iranian documents name levels in Persian:
دیپلم / دیپلم متوسطه / دیپلم کامل = Secondary school (high school diploma);
پیش‌دانشگاهی = Secondary school (high school diploma); فنی و حرفه‌ای / کاردانش = Trade / vocational certificate;
کاردانی / فوق دیپلم = College diploma / associate degree; کارشناسی / لیسانس = Bachelor's degree;
کارشناسی ارشد / فوق لیسانس = Master's degree; دکتری / دکترا (PhD) = Doctorate (PhD);
دکترای حرفه‌ای (پزشکی، دندانپزشکی، داروسازی) = Professional degree (medicine, dentistry, pharmacy, law).
Most recent institution / field / dates / GPA describe the applicant's most recent studies.`;

/**
 * Extract intake field values from uploaded documents.
 *
 * @param {Array} docBlocks - content blocks (document/image) for uploads.
 * @param {object} existing - field values known so far (may be incomplete or wrong).
 * @param {string} type - application type.
 * @param {object} opts - applicant: who this file is for (name as known to staff).
 * @returns {Promise<{fields, confidence, sources, documentCategories, documentOwners, notes}>}
 */
export async function extractFromDocuments(docBlocks, existing = {}, type = 'study-permit', { applicant = '' } = {}) {
  const t = getAppType(type);
  const system = `You are an assistant for a Canadian immigration consultancy. You read the
documents in a client's file and extract structured data to pre-fill the intake for this
application: ${t.title}.

A client's folder often holds a whole family's documents — the applicant's, their spouse's
(e.g. the spouse working or studying in Canada), their children's and their parents'. Every
document belongs to ONE person. The intake has sections about different people; each
section below says whom it describes.

Rules:
- Only extract values you can actually see in the documents. Never invent data.
- Fields about the applicant come ONLY from the applicant's own documents. A child's,
  parent's or spouse's passport, ID, school record or diploma never fills the applicant's
  name, birth date, passport or education — it fills the fields about THAT person.
- Dates must be ISO format YYYY-MM-DD.
- For fields with a fixed option list, answer with one option exactly as written.
- Money fields are numbers only (no currency symbols or commas).
- If a value is ambiguous or not present, omit that field entirely.`;

  const guide = fieldGuide(type);
  const same = samePersonRules(type);

  const instruction = `WHOSE FILE THIS IS: ${
    applicant
      ? `the applicant is ${applicant}. Documents naming someone else belong to that person.`
      : "not stated — the applicant is the person most of the applicant's own documents (passport, ID, diplomas) belong to."
  }
Some documents are introduced with their checklist item from the file's code (e.g.
"checklist 132: Spouse's work permit — a document of the spouse in Canada"); trust it
for whose document it is.

Return JSON of the form:
{
  "fields": { "<fieldId>": <value>, ... },       // every value you find, even if already known
  "confidence": { "<fieldId>": "high"|"medium"|"low", ... },
  "sources": { "<fieldId>": "<document file name>", ... },  // which file each value came from
  "documentCategories": { "1": "<categoryKey>", "2": "<categoryKey>", ... },
  "documentOwners": { "1": "<owner>", "2": "<owner>", ... },  // owner: ${OWNERS.join(' | ')}
  "notes": [ "short note about anything uncertain or worth the applicant checking" ]
}

IMPORTANT — naming documents: each document is introduced by a line
"--- Document N: <file name> ---". In "sources" and in every "notes" entry, always
refer to a document by its <file name> (e.g. "Passport-Anahita.pdf"), NEVER by its
number ("Document 1"). Use the exact file name shown.

For documentOwners: say whose document each one is, relative to the applicant
(applicant = the applicant's own; spouse = their spouse/partner; child; parent; host =
someone in Canada inviting them; sponsor = another person paying; other).

For documentCategories: classify EVERY numbered document (keyed by its number) into
exactly one of:
${CATEGORY_KEYS.join(', ')}
(passport = passport bio page; loa = letter of acceptance/admission from the school;
pal = provincial attestation letter; proof-of-funds = bank statements/loans/sponsor
funds; transcripts = academic records/diplomas; language = IELTS/TOEFL/etc results;
questionnaire = the firm's SOP / Purpose-of-Travel questionnaire the client filled in
(the firm writes the letter from it; not submitted);
internal = agency/consultant paperwork that must NEVER be sent to the visa office —
immigration firms' client intake or information forms, personal profile /
background information forms (often branded
with a consultancy's logo, e.g. pages of empty labelled tables asking for personal
details), blank templates, sample files. Still extract any FIELD VALUES such forms
contain — classify the document itself as internal.)

${EDUCATION_GUIDE}
${same ? `\nThe same person in two sections:\n${same}\n` : ''}
Fields, by section:
${guide}

Values known so far (may be incomplete, or wrong if an earlier reading mixed people up —
report what the documents show; the platform compares):
${JSON.stringify(existing)}`;

  const content = [{ type: 'text', text: instruction }, ...docBlocks];

  const result = await completeJson({
    system,
    content,
    maxTokens: 4000,
    temperature: 0,
  });

  return {
    fields: result.fields || {},
    confidence: result.confidence || {},
    sources: result.sources || {},
    documentCategories: result.documentCategories || {},
    documentOwners: result.documentOwners || {},
    notes: Array.isArray(result.notes) ? result.notes : [],
  };
}
