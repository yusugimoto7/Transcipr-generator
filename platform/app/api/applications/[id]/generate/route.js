import { updateApplication } from '@/lib/store';
import { saveGenerated } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateSop } from '@/lib/generators/sop';
import { generateFinancialSummary, generateCoverLetter } from '@/lib/generators/coverdocs';
import { generateFormDataSheet } from '@/lib/generators/forms';
import { buildChecklist } from '@/lib/checklist';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 180;

const DOC_TITLES = {
  sop: 'Statement of Purpose (Study Plan)',
  'financial-summary': 'Financial Summary',
  'cover-letter': 'Submission Cover Letter',
  imm1294: 'IMM 1294 — Data Sheet',
  imm5645: 'IMM 5645 — Data Sheet',
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
    : ['sop', 'financial-summary', 'cover-letter', 'imm1294', 'imm5645'];

  const produced = [];
  const errors = [];

  for (const key of requested) {
    try {
      let bytes;
      if (key === 'sop') {
        const text = await generateSop(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES.sop) });
      } else if (key === 'financial-summary') {
        const text = await generateFinancialSummary(app);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES[key]) });
      } else if (key === 'cover-letter') {
        const labels = buildChecklist(app.data || {}).map((c) => c.label);
        const text = await generateCoverLetter(app, labels);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, DOC_TITLES[key]) });
      } else if (key === 'imm1294' || key === 'imm5645') {
        bytes = await generateFormDataSheet(key, app);
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

  const updated = await updateApplication(app.id, (a) => {
    const byKey = new Map((a.generated || []).map((g) => [g.key, g]));
    for (const g of produced) byKey.set(g.key, g);
    a.generated = [...byKey.values()];
    if (a.status === 'draft') a.status = 'in-progress';
    return a;
  });

  return json({ generated: updated.generated, produced, errors });
}
