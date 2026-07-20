import { updateApplication } from '@/lib/store';
import { saveGenerated } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateSop } from '@/lib/generators/sop';
import { SOP_QUESTIONS } from '@/lib/sopQuestions';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TITLE = 'Statement of Purpose (Study Plan)';
const QIDS = new Set(SOP_QUESTIONS.map((q) => q.id));

// Return saved builder answers and last generated SOP text.
export async function GET(_req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;
  return json({
    answers: app.sopAnswers || {},
    text: app.sop?.text || '',
    updatedAt: app.sop?.updatedAt || null,
  });
}

/**
 * Body:
 *   { answers: { <qid>: { selected: [...], note: "" } }, editedText?: "" }
 * If editedText is provided it is saved verbatim (applicant edited the draft);
 * otherwise a fresh SOP is generated from intake data + these answers.
 */
export async function POST(req, { params }) {
  const { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }

  // Sanitize answers to known questions.
  const answers = {};
  if (body.answers && typeof body.answers === 'object') {
    for (const [qid, a] of Object.entries(body.answers)) {
      if (!QIDS.has(qid) || !a) continue;
      answers[qid] = {
        selected: Array.isArray(a.selected) ? a.selected.map(String).slice(0, 12) : [],
        note: typeof a.note === 'string' ? a.note.slice(0, 2000) : '',
      };
    }
  }

  // Persist answers first so generateSop can read them.
  const withAnswers = await updateApplication(app.id, (a) => {
    a.sopAnswers = answers;
    return a;
  });

  let text = typeof body.editedText === 'string' ? body.editedText.trim() : '';
  if (!text) {
    try {
      text = await generateSop(withAnswers);
    } catch (e) {
      return error(`Could not generate the study plan: ${e.message}`, 502);
    }
  }

  let meta;
  try {
    const bytes = await renderDocPdf({ blocks: textToBlocks(text, TITLE), meta: { title: TITLE } });
    meta = await saveGenerated(app.id, { key: 'sop', filename: `${TITLE}.pdf`, bytes: Buffer.from(bytes) });
  } catch (e) {
    return error(`Could not render the PDF: ${e.message}`, 500);
  }

  const updated = await updateApplication(app.id, (a) => {
    a.sop = { text, updatedAt: new Date().toISOString() };
    const byKey = new Map((a.generated || []).map((g) => [g.key, g]));
    byKey.set('sop', meta);
    a.generated = [...byKey.values()];
    if (a.status === 'draft') a.status = 'in-progress';
    return a;
  });

  return json({ text, answers, generated: updated.generated });
}
