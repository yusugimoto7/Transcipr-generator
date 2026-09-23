import { updateApplication } from '@/lib/store';
import { saveGenerated, buildDocBlocks } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateLetter, selectLetterDocs } from '@/lib/generators/letters';
import { cleanAnswers } from '@/lib/sopQuestions';
import { primaryLetter } from '@/lib/appTypes';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

// The guided-questions tab builds the type's PRIMARY narrative letter
// (Study Plan, Statement of Purpose, Purpose of Travel…), stored as 'sop'.

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
 * Body: { answers, editedText? }. If editedText is provided it is saved
 * verbatim (the applicant edited the draft); otherwise a fresh letter is
 * generated from intake data + these answers + relevant uploaded documents.
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
  const letter = primaryLetter(app.type);
  const answers = cleanAnswers(body.answers, letter.kind);

  const withAnswers = await updateApplication(app.id, (a) => {
    a.sopAnswers = answers;
    return a;
  });

  let text = typeof body.editedText === 'string' ? body.editedText.trim() : '';
  if (!text) {
    try {
      let docBlocks = [];
      try {
        docBlocks = await buildDocBlocks(app.id, selectLetterDocs(withAnswers, letter));
      } catch {
        docBlocks = [];
      }
      text = await generateLetter(withAnswers, 'sop', docBlocks);
    } catch (e) {
      return error(`Could not generate the letter: ${e.message}`, 502);
    }
  }

  let meta;
  try {
    const bytes = await renderDocPdf({ blocks: textToBlocks(text, letter.title), meta: { title: letter.title } });
    meta = await saveGenerated(app.id, { key: 'sop', filename: `${letter.title}.pdf`, bytes: Buffer.from(bytes), text });
  } catch (e) {
    return error(`Could not render the PDF: ${e.message}`, 500);
  }

  const updated = await updateApplication(app.id, (a) => {
    a.sop = { text, updatedAt: new Date().toISOString() };
    const byKey = new Map((a.generated || []).map((g) => [g.key, g]));
    byKey.set('sop', meta);
    a.generated = [...byKey.values()];
    return a;
  });

  return json({ text, generated: updated.generated, sop: updated.sop, answers });
}
