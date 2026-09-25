import { updateApplication } from './store';
import { saveGenerated, buildDocBlocks } from './uploads';
import { renderDocPdf, textToBlocks } from './pdf';
import { generateLetter, letterSpec, selectLetterDocs } from './generators/letters';
import { generateFormDataSheet } from './generators/forms';
import { fillOfficialForm } from './generators/xfaFill';
import { buildNextStepsNote } from './generators/nextsteps';
import { lettersFor, formsFor } from './appTypes';

/**
 * Producing an application's documents: AI-drafted letters, form data sheets,
 * pre-filled official forms, and the "missing documents & next steps" note.
 * Used by "Build final files" (everything in one go) and by redrafting a
 * single letter.
 */

export const NEXT_STEPS_TITLE = 'Missing Documents & Next Steps';

/** Every document key this application can produce, with its title. */
export function catalogue(app) {
  const out = {};
  for (const l of lettersFor(app)) out[l.key] = l.title;
  for (const f of formsFor(app)) {
    out[f.key] = `${f.label} — Data Sheet`;
    out[`${f.key}-filled`] = `${f.label} — Pre-filled Official Form`;
  }
  return out;
}

/**
 * Produce the given documents and save them on the application.
 * @returns {Promise<{ app, produced: object[], errors: {key, message}[] }>}
 */
export async function produceDocs(app, keys, { onProgress = () => {} } = {}) {
  const titles = catalogue(app);
  const produced = [];
  const errors = [];
  let i = 0;
  for (const key of keys.filter((k) => titles[k])) {
    onProgress(++i, keys.length, titles[key]);
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
        // The latest official (XFA) form, pre-filled. Needs python/pikepdf and
        // the form template from canada.ca; on failure the data sheet remains.
        try {
          bytes = (await fillOfficialForm(key.replace(/-filled$/, ''), app)).bytes;
        } catch (e) {
          errors.push({ key, message: `could not pre-fill the official form (${e.message}) — use the data sheet to fill it` });
          continue;
        }
      } else {
        bytes = await generateFormDataSheet(key, app);
      }
      produced.push(await saveGenerated(app.id, { key, filename: `${titles[key] || key}.pdf`, bytes: Buffer.from(bytes), ...(text ? { text } : {}) }));
    } catch (e) {
      errors.push({ key, message: e.message });
    }
  }
  const updated = produced.length
    ? await updateApplication(app.id, (a) => {
        const byKey = new Map((a.generated || []).map((g) => [g.key, g]));
        for (const g of produced) byKey.set(g.key, g);
        a.generated = [...byKey.values()];
        if (a.status === 'draft') a.status = 'in-progress';
        return a;
      })
    : app;
  return { app: updated, produced, errors };
}

/** Refresh the "Missing documents & next steps" note. Returns { app, note }. */
export async function refreshNextSteps(app) {
  const note = buildNextStepsNote(app);
  const bytes = await renderDocPdf({ blocks: textToBlocks(note.text, NEXT_STEPS_TITLE), meta: { title: NEXT_STEPS_TITLE } });
  const meta = await saveGenerated(app.id, { key: 'next-steps', filename: `${NEXT_STEPS_TITLE}.pdf`, bytes: Buffer.from(bytes), text: note.text });
  const updated = await updateApplication(app.id, (a) => {
    a.generated = [...(a.generated || []).filter((g) => g.key !== 'next-steps'), meta];
    return a;
  });
  return { app: updated, note };
}
