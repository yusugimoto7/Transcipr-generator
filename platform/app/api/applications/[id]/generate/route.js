import { updateApplication } from '@/lib/store';
import { saveGenerated } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateSop, selectSopDocs } from '@/lib/generators/sop';
import { buildDocBlocks } from '@/lib/uploads';
import {
  generateFinancialSummary,
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
  imm1294: 'IMM 1294 — Data Sheet',
  imm5257: 'IMM 5257 — Data Sheet',
  imm5645: 'IMM 5645 — Data Sheet',
  'imm1294-filled': 'IMM 1294 — Pre-filled Official Form',
  'next-steps': 'Missing Documents & Next Steps',
};

/**
 * Generate one or more output documents.
 * Body: { docs: ["sop","financial-summary","imm1294","imm5257","imm5645"] }
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
    : ['sop', 'financial-cover-letter', 'financial-summary', 'imm1294', 'imm5257', 'imm5645'];

  const produced = [];
  const errors = [];

  for (const key of requested) {
    try {
      let bytes;
      let text = null; // captured for text docs so they can also export as .docx
      if (key === 'sop') {
        let sopDocs = [];
        try {
          sopDocs = await buildDocBlocks(app.id, selectSopDocs(app));
        } catch {
          sopDocs = [];
        }
        text = await generateSop(app, sopDocs);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES.sop) });
      } else if (key === 'financial-cover-letter') {
        text = await generateFinancialCoverLetter(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES[key]) });
      } else if (key === 'financial-summary') {
        text = await generateFinancialSummary(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES[key]) });
      } else if (key === 'imm1294' || key === 'imm5257' || key === 'imm5645') {
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
      if (text) meta.text = text; // enables Word (.docx) export
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
    const noteMeta = await saveGenerated(app.id, {
      key: 'next-steps',
      filename: `${DOC_TITLES['next-steps']}.pdf`,
      bytes: Buffer.from(noteBytes),
    });
    noteMeta.text = note.text;
    produced.push(noteMeta);
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
