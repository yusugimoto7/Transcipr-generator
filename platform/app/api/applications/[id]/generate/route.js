import { updateApplication } from '@/lib/store';
import { saveGenerated } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateSop } from '@/lib/generators/sop';
import {
  generateFinancialSummary,
  generateCoverLetter,
  generateFinancialCoverLetter,
} from '@/lib/generators/coverdocs';
import { generateFormDataSheet } from '@/lib/generators/forms';
import { fillOfficialForm } from '@/lib/generators/xfaFill';
import { buildNextStepsNote } from '@/lib/generators/nextsteps';
import { buildChecklist } from '@/lib/checklist';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 180;

const DOC_TITLES = {
  sop: 'Statement of Purpose (Study Plan)',
  'financial-cover-letter': 'Financial Cover Letter',
  'financial-summary': 'Financial Summary Report',
  'cover-letter': 'Submission Letter',
  imm1294: 'IMM 1294 — Data Sheet',
  imm5257: 'IMM 5257 — Data Sheet',
  imm5645: 'IMM 5645 — Data Sheet',
  imm5476: 'IMM 5476 — Data Sheet',
  'imm1294-filled': 'IMM 1294 — Pre-filled Official Form',
  'next-steps': 'Missing Documents & Next Steps',
};

/**
 * Generate one or more output documents.
 * Body: { docs: ["sop","financial-summary","cover-letter","imm1294","imm5645"] }
 * Defaults to all.
 */
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional */
  }
  const requested = Array.isArray(body.docs) && body.docs.length
    ? body.docs
    : ['sop', 'financial-cover-letter', 'financial-summary', 'cover-letter', 'imm1294', 'imm5257', 'imm5645', 'imm5476'];

  const produced = [];
  const errors = [];

  for (const key of requested) {
    try {
      let bytes;
      if (key === 'sop') {
        const text = await generateSop(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES.sop) });
      } else if (key === 'financial-cover-letter') {
        const text = await generateFinancialCoverLetter(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES[key]) });
      } else if (key === 'financial-summary') {
        const text = await generateFinancialSummary(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES[key]) });
      } else if (key === 'cover-letter') {
        const text = await generateCoverLetter(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES[key]) });
      } else if (key === 'imm1294' || key === 'imm5257' || key === 'imm5645' || key === 'imm5476') {
        bytes = await generateFormDataSheet(key, app);
      } else if (key === 'imm1294-filled') {
        // Pre-fill the latest official IMM 1294 (XFA). Falls back to the data
        // sheet if python/pikepdf or the template is unavailable.
        try {
          const filled = await fillOfficialForm('imm1294', app);
          bytes = filled.bytes;
        } catch (e) {
          errors.push({ key, message: `pre-fill unavailable (${e.message}); use the data sheet` });
          continue;
        }
      } else {
        continue;
      }
      const meta = await saveGenerated(app.id, {
        key,
        filename: `${DOC_TITLES[key] || key}.pdf`,
        bytes: Buffer.from(bytes),
      });
      produced.push(meta);
    } catch (e) {
      errors.push({ key, message: e.message });
    }
  }

  if (!produced.length) {
    return error(
      `Generation failed: ${errors.map((e) => `${e.key}: ${e.message}`).join('; ')}`,
      502
    );
  }

  // Always refresh the "Missing documents & next steps" note with every run.
  const appForNote = { ...app, generated: [...(app.generated || []), ...produced] };
  const note = buildNextStepsNote(appForNote);
  try {
    const noteBytes = await renderDocPdf({
      blocks: textToBlocks(note.text, DOC_TITLES['next-steps']),
      meta: { title: DOC_TITLES['next-steps'] },
    });
    produced.push(
      await saveGenerated(app.id, {
        key: 'next-steps',
        filename: `${DOC_TITLES['next-steps']}.pdf`,
        bytes: Buffer.from(noteBytes),
      })
    );
  } catch (e) {
    errors.push({ key: 'next-steps', message: e.message });
  }

  const updated = await updateApplication(app.id, (a) => {
    const byKey = new Map((a.generated || []).map((g) => [g.key, g]));
    for (const g of produced) byKey.set(g.key, g);
    a.generated = [...byKey.values()];
    if (a.status === 'draft') a.status = 'in-progress';
    return a;
  });

  return json({ generated: updated.generated, produced, errors, note });
}
