import { updateApplication } from '@/lib/store';
import { saveGenerated, buildDocBlocks } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateLetter, letterSpec, selectLetterDocs } from '@/lib/generators/letters';
import { generateFormDataSheet } from '@/lib/generators/forms';
import { fillOfficialForm } from '@/lib/generators/xfaFill';
import { buildNextStepsNote } from '@/lib/generators/nextsteps';
import { lettersFor, formsFor } from '@/lib/appTypes';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 180;

const NEXT_STEPS_TITLE = 'Missing Documents & Next Steps';

/** Every document key this application can produce, with its title. */
function catalogue(app) {
  const out = {};
  for (const l of lettersFor(app)) out[l.key] = l.title;
  for (const f of formsFor(app)) {
    out[f.key] = `${f.label} — Data Sheet`;
    out[`${f.key}-filled`] = `${f.label} — Pre-filled Official Form`;
  }
  return out;
}

/**
 * Generate one or more output documents for this application's type.
 * Body: { docs: [keys] } — defaults to every applicable letter + data sheet.
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
  const titles = catalogue(app);
  const requested = Array.isArray(body.docs) && body.docs.length
    ? body.docs.filter((k) => titles[k])
    : Object.keys(titles).filter((k) => !k.endsWith('-filled'));

  const produced = [];
  const errors = [];

  for (const key of requested) {
    try {
      let bytes;
      let text = null; // captured for text docs so they can also export as .docx
      const letter = letterSpec(app, key);
      if (letter) {
        let docBlocks = [];
        try {
          docBlocks = await buildDocBlocks(app.id, selectLetterDocs(app, letter));
        } catch {
          docBlocks = [];
        }
        text = await generateLetter(app, key, docBlocks);
        bytes = await renderDocPdf({ blocks: textToBlocks(text, titles[key]) });
      } else if (key.endsWith('-filled')) {
        // Pre-fill the latest official XFA form. Falls back to the data sheet
        // if python/pikepdf or the template is unavailable.
        try {
          const filled = await fillOfficialForm(key.replace(/-filled$/, ''), app);
          bytes = filled.bytes;
        } catch (e) {
          errors.push({ key, message: `pre-fill unavailable (${e.message}); use the data sheet` });
          continue;
        }
      } else {
        bytes = await generateFormDataSheet(key, app);
      }
      const meta = await saveGenerated(app.id, {
        key,
        filename: `${titles[key] || key}.pdf`,
        bytes: Buffer.from(bytes),
        ...(text ? { text } : {}),
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
      blocks: textToBlocks(note.text, NEXT_STEPS_TITLE),
      meta: { title: NEXT_STEPS_TITLE },
    });
    produced.push(
      await saveGenerated(app.id, {
        key: 'next-steps',
        filename: `${NEXT_STEPS_TITLE}.pdf`,
        bytes: Buffer.from(noteBytes),
        text: note.text,
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
