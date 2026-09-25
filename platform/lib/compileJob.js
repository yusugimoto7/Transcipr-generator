import { getApplication, updateApplication } from './store';
import { readGenerated, readUpload, saveGenerated, buildDocBlocks } from './uploads';
import { renderDocPdf, textToBlocks } from './pdf';
import { generateLetter, letterSpec, selectLetterDocs } from './generators/letters';
import { compilePackage, getPackages, packageCategories } from './compile';
import { prepareDocument } from './packageDocs';

/**
 * Compiling a package as a background job, with progress.
 *
 * A package can hold 100+ scanned pages: drafting any missing letters, then
 * turning every file into upright page pictures (blank-page removal, rotation
 * fixes), then assembling the PDF. POST starts the job and returns at once;
 * the page polls and shows "Preparing file 7 of 23 — 103 - Passport.pdf".
 *
 * Jobs for the same file run one after another (each holds its pages in
 * memory until the PDF is written), so a second package waits its turn.
 */

const EMBEDDABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

const jobs = (globalThis.__compileJobs ||= new Map()); // `${appId}:${pkg}` -> job
const queues = (globalThis.__compileQueues ||= new Map()); // appId -> promise chain

function view(job) {
  if (!job) return null;
  const { pkg, status, phase, done, total, current, startedAt, finishedAt, error, result } = job;
  return { pkg, status, phase, done, total, current, startedAt, finishedAt, error, ...(status === 'done' ? { result } : {}) };
}

/** Jobs for one file: { [pkg]: job } (running, queued and recently finished). */
export function getCompileJobs(appId) {
  const out = {};
  for (const [k, j] of jobs) if (k.startsWith(`${appId}:`)) out[j.pkg] = view(j);
  return out;
}

/** Start compiling `pkg` (unless it is already queued or running). */
export function startCompileJob(appId, pkg, { cleanPages = true, fixRotation = true } = {}) {
  const id = `${appId}:${pkg}`;
  const existing = jobs.get(id);
  if (existing && (existing.status === 'running' || existing.status === 'queued')) return view(existing);

  const job = { pkg, status: 'queued', phase: 'queued', done: 0, total: 0, current: null, startedAt: new Date().toISOString(), finishedAt: null, error: null, result: null };
  jobs.set(id, job);
  const prev = queues.get(appId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      job.status = 'running';
      job.phase = 'starting';
      try {
        job.result = await run(appId, pkg, { cleanPages, fixRotation }, job);
        job.status = 'done';
      } catch (e) {
        job.status = 'failed';
        job.error = e.message || 'Compilation failed.';
      }
      job.current = null;
      job.finishedAt = new Date().toISOString();
    });
  queues.set(appId, next);
  return view(job);
}

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
  const letter = letterSpec(app, key);
  if (!letter) return app; // this letter doesn't apply to the type
  let docBlocks = [];
  try {
    docBlocks = await buildDocBlocks(app.id, selectLetterDocs(app, letter));
  } catch {
    docBlocks = [];
  }
  const text = await generateLetter(app, key, docBlocks);
  const bytes = await renderDocPdf({ blocks: textToBlocks(text, letter.title) });
  const meta = await saveGenerated(app.id, { key, filename: `${letter.title}.pdf`, bytes: Buffer.from(bytes), text });
  return updateApplication(app.id, (a) => {
    const m = new Map((a.generated || []).map((g) => [g.key, g]));
    m.set(key, meta);
    a.generated = [...m.values()];
    return a;
  });
}

async function run(appId, pkg, { cleanPages, fixRotation }, job) {
  let app = await getApplication(appId);
  const def = getPackages(app.type)[pkg];
  if (!def) throw new Error('Unknown package.');

  // Plan first, so progress has a total: which letters need drafting, and which
  // uploaded files each section takes (a catch-all takes what is left over).
  const neededGen = [...new Set(def.sections.filter((s) => s.generatedKey).map((s) => s.generatedKey))];
  const missingGen = neededGen.filter((k) => !(app.generated || []).some((g) => g.key === k && g.stored) && letterSpec(app, k));
  const usedDocIds = new Set();
  const planDocs = (node) => {
    if (node.generatedKey) return [];
    let docs = [];
    if (node.catchAll) {
      // Anything belonging to this package (or uncategorized) not already used.
      // 'internal' (agency intake forms, templates) must NEVER reach a package.
      const owned = new Set(packageCategories(app.type)[pkg] || []);
      docs = (app.documents || []).filter((d) => !usedDocIds.has(d.id) && d.category !== 'internal' && (!d.category || owned.has(d.category)));
    } else if (node.categories?.length) {
      const wanted = new Set(node.categories);
      docs = (app.documents || []).filter((d) => wanted.has(d.category));
    }
    docs.forEach((d) => usedDocIds.add(d.id));
    return docs;
  };
  const plan = def.sections.map((sec) => ({ sec, docs: planDocs(sec), children: (sec.children || []).map((c) => ({ child: c, docs: planDocs(c) })) }));
  const fileCount = plan.reduce((n, p) => n + p.docs.length + p.children.reduce((m, c) => m + c.docs.length, 0), 0);

  job.total = missingGen.length + fileCount + 1; // + assembling the PDF
  job.done = 0;

  job.phase = 'letters';
  for (const key of neededGen) {
    const drafting = missingGen.includes(key);
    if (drafting) job.current = letterSpec(app, key)?.title || key;
    try {
      app = await ensureGenerated(app, key);
    } catch (e) {
      throw new Error(`Could not generate ${key}: ${e.message}`);
    }
    if (drafting) job.done++;
  }

  let droppedTotal = 0;
  let rotatedTotal = 0;
  let mirroredTotal = 0;
  const skippedFiles = []; // files excluded from the package, reported to the applicant

  // Every upload — PDF of any geometry, or a photo — becomes a list of upright
  // page pictures (lib/packageDocs.js). The compiler just places pictures.
  job.phase = 'documents';
  let fileNo = 0;
  const loadDocs = async (docs) => {
    const items = [];
    for (const d of docs) {
      fileNo++;
      job.current = `file ${fileNo} of ${fileCount} — ${d.filename}`;
      try {
        // Word files can't be embedded in a PDF — leave them out and tell the
        // applicant, instead of printing a placeholder page into the package.
        if (!EMBEDDABLE.has(d.mime)) {
          skippedFiles.push(d.filename);
          continue;
        }
        const bytes = await readUpload(app.id, d.stored);
        const prepared = await prepareDocument({ bytes, mime: d.mime }, { cleanPages, fixRotation });
        droppedTotal += prepared.dropped;
        mirroredTotal += prepared.mirrored;
        rotatedTotal += prepared.rotated;
        items.push(...prepared.pages.map((p) => ({ kind: 'picture', ...p, filename: d.filename })));
      } catch (e) {
        console.error(`[compile] could not prepare "${d.filename}": ${e.message}`);
        skippedFiles.push(d.filename);
      } finally {
        job.done++;
      }
    }
    return items;
  };
  const generatedItems = async (node) => {
    const meta = (app.generated || []).find((g) => g.key === node.generatedKey);
    if (!meta?.stored) return [];
    try {
      return [{ bytes: await readGenerated(app.id, meta.stored), mime: 'application/pdf', filename: meta.filename }];
    } catch {
      return [];
    }
  };

  const d = app.data || {};
  const sections = [];
  for (const { sec, docs, children } of plan) {
    let name = sec.name;
    if (sec.supporter && (d.sponsorName || '').trim()) name = `${sec.name} (${d.sponsorName.trim()})`;
    const items = sec.generatedKey ? await generatedItems(sec) : await loadDocs(docs);
    const kids = [];
    for (const c of children) kids.push({ name: c.child.name, items: c.child.generatedKey ? await generatedItems(c.child) : await loadDocs(c.docs) });
    sections.push({ name, items, children: kids });
  }

  const includedCount = sections.filter((s) => s.items.length || s.children.some((c) => c.items.length)).length;
  if (!includedCount) throw new Error('Nothing to compile yet — upload the documents for this package first.');

  job.phase = 'assembling';
  job.current = 'assembling the PDF and table of contents';
  const applicantName = [d.givenName, d.familyName].filter(Boolean).join(' ');
  let compiled;
  try {
    compiled = await compilePackage(def.title, applicantName, sections);
  } catch (e) {
    throw new Error(`Compilation failed: ${e.message}`);
  }
  skippedFiles.push(...compiled.skipped);

  const key = `${pkg}-package`;
  const meta = await saveGenerated(app.id, { key, filename: def.filename, bytes: Buffer.from(compiled.bytes) });
  const updated = await updateApplication(app.id, (a) => {
    const m = new Map((a.generated || []).map((g) => [g.key, g]));
    m.set(key, meta);
    a.generated = [...m.values()];
    return a;
  });
  job.done = job.total;

  return {
    generated: updated.generated,
    key,
    droppedPages: droppedTotal,
    rotatedPages: rotatedTotal,
    mirroredPages: mirroredTotal,
    skippedFiles: [...new Set(skippedFiles)],
    included: sections.map((s) => ({ name: s.name, count: s.items.length + s.children.reduce((n, c) => n + c.items.length, 0) })),
  };
}
