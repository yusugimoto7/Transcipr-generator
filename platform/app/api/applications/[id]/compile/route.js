import { updateApplication } from '@/lib/store';
import { readGenerated, readUpload, saveGenerated, buildDocBlocks } from '@/lib/uploads';
import { renderDocPdf, textToBlocks } from '@/lib/pdf';
import { generateSop, selectSopDocs } from '@/lib/generators/sop';
import { generateFinancialCoverLetter, generateFinancialSummary } from '@/lib/generators/coverdocs';
import { compilePackage, PACKAGES, PACKAGE_CATEGORIES } from '@/lib/compile';
import { analyzePages } from '@/lib/generators/blankdetect';
import { normalizeImage } from '@/lib/images';
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
  const meta = await saveGenerated(app.id, { key, filename: `${GEN_TITLE[key]}.pdf`, bytes: Buffer.from(bytes), text });
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
  const cleanPages = body.cleanPages !== false; // default: remove blank pages
  const fixRotation = body.fixRotation !== false; // default: auto-correct sideways/upside-down scans

  // Ensure the generated sub-documents this package needs exist (top level only).
  const neededGen = [...new Set(def.sections.filter((s) => s.generatedKey).map((s) => s.generatedKey))];
  for (const key of neededGen) {
    try {
      app = await ensureGenerated(app, key);
    } catch (e) {
      return error(`Could not generate ${key}: ${e.message}`, 502);
    }
  }

  let droppedTotal = 0;
  let rotatedTotal = 0;
  let mirroredTotal = 0;
  const skippedFiles = []; // files excluded from the package, reported to the applicant
  const usedDocIds = new Set(); // documents already placed in a section

  const EMBEDDABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

  const loadDoc = async (d) => {
    const bytes = await readUpload(app.id, d.stored);

    // Uploaded photos: bake in EXIF orientation and vision-check the pixels.
    // (PDF embedding ignores EXIF, so phone photos otherwise come out rotated.)
    if (d.mime === 'image/jpeg' || d.mime === 'image/png' || d.mime === 'image/webp') {
      const fixed = await normalizeImage(bytes, d.mime, { vision: fixRotation });
      if (fixed.rotated) rotatedTotal++;
      return { bytes: fixed.bytes, mime: fixed.mime, filename: d.filename };
    }

    let keepPages = null;
    let pageRotations = null;
    if (d.mime === 'application/pdf' && (cleanPages || fixRotation)) {
      // Rasterize once: measure ink (blank pages) and check orientation.
      const { pages, blank, rotate, mirrored } = await analyzePages(bytes, {
        detectOrientation: fixRotation,
      });
      if (pages > 0) {
        // Drop blank pages and mirrored scan artifacts (no rotation fixes a
        // mirrored page) — but never every page of a document.
        const drop = new Set();
        if (cleanPages) blank.forEach((n) => drop.add(n));
        if (fixRotation) mirrored.forEach((n) => drop.add(n));
        let kept = Array.from({ length: pages }, (_, i) => i + 1);
        if (drop.size > 0 && drop.size < pages) {
          kept = kept.filter((n) => !drop.has(n));
          droppedTotal += blank.filter((n) => drop.has(n)).length;
          mirroredTotal += mirrored.filter((n) => drop.has(n) && !blank.includes(n)).length;
          keepPages = kept;
        }
        // Rotations must line up with the pages actually kept.
        if (rotate && Object.keys(rotate).length) {
          pageRotations = kept.map((n) => Number(rotate[String(n)] || 0));
          rotatedTotal += Object.keys(rotate).length;
        }
      }
    }
    return { bytes, mime: d.mime, filename: d.filename, keepPages, pageRotations };
  };

  // Resolve one node's (section or child) content items.
  const resolveItems = async (node) => {
    const items = [];
    if (node.generatedKey) {
      const meta = (app.generated || []).find((g) => g.key === node.generatedKey);
      if (meta?.stored) {
        try {
          const bytes = await readGenerated(app.id, meta.stored);
          items.push({ bytes, mime: 'application/pdf', filename: meta.filename });
        } catch {
          /* skip */
        }
      }
      return items;
    }

    let docs = [];
    if (node.catchAll) {
      // Anything belonging to this package (or uncategorized) not already used.
      // 'internal' (agency intake forms, templates) must NEVER reach a package.
      const owned = new Set(PACKAGE_CATEGORIES[body.pkg] || []);
      docs = (app.documents || []).filter(
        (d) =>
          !usedDocIds.has(d.id) &&
          d.category !== 'internal' &&
          (!d.category || owned.has(d.category))
      );
    } else if (node.categories?.length) {
      const wanted = new Set(node.categories);
      docs = (app.documents || []).filter((d) => wanted.has(d.category));
    }

    for (const d of docs) {
      // Word files can't be embedded in a PDF — leave them out and tell the
      // applicant, instead of printing a placeholder page into the package.
      if (!EMBEDDABLE.has(d.mime)) {
        skippedFiles.push(d.filename);
        usedDocIds.add(d.id);
        continue;
      }
      try {
        items.push(await loadDoc(d));
        usedDocIds.add(d.id);
      } catch {
        skippedFiles.push(d.filename);
        usedDocIds.add(d.id);
      }
    }
    return items;
  };

  const d = app.data || {};
  const sections = [];
  for (const sec of def.sections) {
    let name = sec.name;
    if (sec.supporter && (d.sponsorName || '').trim()) name = `${sec.name} (${d.sponsorName.trim()})`;
    const items = await resolveItems(sec);
    const children = [];
    for (const child of sec.children || []) {
      children.push({ name: child.name, items: await resolveItems(child) });
    }
    sections.push({ name, items, children });
  }

  const includedCount = sections.filter(
    (s) => s.items.length || s.children.some((c) => c.items.length)
  ).length;
  if (!includedCount) {
    return error('Nothing to compile yet — upload the documents for this package first.', 400);
  }

  const applicantName = [d.givenName, d.familyName].filter(Boolean).join(' ');

  let compiled;
  try {
    compiled = await compilePackage(def.title, applicantName, sections);
  } catch (e) {
    return error(`Compilation failed: ${e.message}`, 500);
  }
  skippedFiles.push(...compiled.skipped);

  const key = `${body.pkg}-package`;
  const meta = await saveGenerated(app.id, { key, filename: def.filename, bytes: Buffer.from(compiled.bytes) });
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
    rotatedPages: rotatedTotal,
    mirroredPages: mirroredTotal,
    skippedFiles: [...new Set(skippedFiles)],
    included: sections.map((s) => ({
      name: s.name,
      count: s.items.length + s.children.reduce((n, c) => n + c.items.length, 0),
    })),
  });
}
