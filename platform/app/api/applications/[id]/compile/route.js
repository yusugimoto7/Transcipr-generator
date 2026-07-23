import { updateApplication } from '@/lib/store';
import { readGenerated, readUpload, saveGenerated, buildDocBlocks } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateSop, selectSopDocs } from '@/lib/generators/sop';
import { generateFinancialCoverLetter, generateFinancialSummary } from '@/lib/generators/coverdocs';
import { compilePackage, PACKAGES } from '@/lib/compile';
import { detectBlankPages } from '@/lib/generators/blankdetect';
import { json, error, requireOwnedApp } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

const GEN_TITLE = {
  sop: 'Statement of Purpose (Study Plan)',
  'financial-cover-letter': 'Financial Cover Letter',
  'financial-summary': 'Financial Summary Report',
};

// Generate a text sub-document if it isn't already present, and return the app.
async function ensureGenerated(app, key) {
  const existing = (app.generated || []).find((g) => g.key === key);
  if (existing?.stored) {
    try {
      await readGenerated(app.id, existing.stored);
      return app; // already available
    } catch {
      /* file missing — regenerate */
    }
  }
  let text;
  if (key === 'sop') {
    let docBlocks = [];
    try {
      docBlocks = await buildDocBlocks(app.id, selectSopDocs(app));
    } catch {
      docBlocks = [];
    }
    text = await generateSop(app, docBlocks);
  } else if (key === 'financial-cover-letter') {
    text = await generateFinancialCoverLetter(app);
  } else if (key === 'financial-summary') {
    text = await generateFinancialSummary(app);
  } else {
    return app;
  }
  const bytes = await renderDocPdf({ blocks: textToBlocks(text, GEN_TITLE[key]) });
  const meta = await saveGenerated(app.id, { key, filename: `${GEN_TITLE[key]}.pdf`, bytes: Buffer.from(bytes) });
  meta.text = text;
  return updateApplication(app.id, (a) => {
    const m = new Map((a.generated || []).map((g) => [g.key, g]));
    m.set(key, meta);
    a.generated = [...m.values()];
    return a;
  });
}

/** Body: { pkg: 'client-info' | 'financial-proof' } */
export async function POST(req, { params }) {
  let { app, error: err } = await requireOwnedApp(params.id);
  if (err) return err;

  let body = {};
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const def = PACKAGES[body.pkg];
  if (!def) return error('Unknown package.', 404);
  const cleanPages = body.cleanPages !== false; // default: remove blank/unrelated pages

  // Ensure the generated sub-documents this package needs exist.
  const neededGen = [...new Set(def.sections.filter((s) => s.generatedKey).map((s) => s.generatedKey))];
  for (const key of neededGen) {
    try {
      app = await ensureGenerated(app, key);
    } catch (e) {
      return error(`Could not generate ${key}: ${e.message}`, 502);
    }
  }

  // Resolve each section's content items.
  const sections = [];
  let droppedTotal = 0;
  for (const sec of def.sections) {
    const items = [];
    if (sec.generatedKey) {
      const meta = (app.generated || []).find((g) => g.key === sec.generatedKey);
      if (meta?.stored) {
        try {
          const bytes = await readGenerated(app.id, meta.stored);
          items.push({ bytes, mime: 'application/pdf', filename: meta.filename });
        } catch {
          /* skip */
        }
      }
    } else if (sec.category) {
      const docs = (app.documents || []).filter((d) => d.category === sec.category);
      for (const d of docs) {
        try {
          const bytes = await readUpload(app.id, d.stored);
          let keepPages = null;
          if (cleanPages && d.mime === 'application/pdf') {
            // Deterministic: rasterize each page and measure ink coverage.
            const { pages, blank } = await detectBlankPages(bytes);
            if (pages > 0 && blank.length > 0 && blank.length < pages) {
              const blankSet = new Set(blank);
              keepPages = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => !blankSet.has(n));
              droppedTotal += blank.length;
            }
          }
          items.push({ bytes, mime: d.mime, filename: d.filename, keepPages });
        } catch {
          /* skip */
        }
      }
    }
    sections.push({ name: sec.name, items });
  }

  const includedCount = sections.filter((s) => s.items.length).length;
  if (!includedCount) {
    return error('Nothing to compile yet — upload the documents for this package first.', 400);
  }

  let compiled;
  try {
    compiled = await compilePackage(def.title, sections);
  } catch (e) {
    return error(`Compilation failed: ${e.message}`, 500);
  }

  const key = `${body.pkg}-package`;
  const meta = await saveGenerated(app.id, { key, filename: def.filename, bytes: Buffer.from(compiled) });
  const updated = await updateApplication(app.id, (a) => {
    const m = new Map((a.generated || []).map((g) => [g.key, g]));
    m.set(key, meta);
    a.generated = [...m.values()];
    return a;
  });

  return json({
    generated: updated.generated,
    key,
    droppedPages: droppedTotal,
    included: sections.map((s) => ({ name: s.name, count: s.items.length })),
  });
}
