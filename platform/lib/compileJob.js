import { getApplication, updateApplication } from './store';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { readGenerated, readUpload, saveGenerated, generatedTarget, buildDocBlocks } from './uploads';
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
export async function ensureGenerated(app, key) {
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
  const app = await getApplication(appId);
  const def = getPackages(app.type)[pkg];
  if (!def) throw new Error('Unknown package.');
  const out = await buildPackageFile(app, def, {
    cleanPages,
    fixRotation,
    job,
    owned: new Set(packageCategories(app.type)[pkg] || []),
    key: `${pkg}-package`,
    filename: def.filename,
  });
  return { ...out.stats, generated: out.app.generated, key: out.meta.key };
}

// Never compiled into any file: agency paperwork, the firm's questionnaire,
// forms (they go out as their own files) and the photo.
const NEVER = new Set(['internal', 'questionnaire', 'rep-form']);

/**
 * Build one PDF from a package definition (sections of uploaded documents and
 * generated letters) and save it as the generated file `key`.
 *
 * opts:
 *   owned    categories a catch-all section may take (a package's own), or
 *   claimed  categories that belong to OTHER files — the catch-all takes every
 *            remaining document except these (used by the final-file set)
 *   plain    no table of contents, dividers or page footers (a single document)
 *   job      progress object to update (phase, done, total, current)
 * @returns {{ app, meta, stats }}
 */
export async function buildPackageFile(app, def, { cleanPages = true, fixRotation = true, job = {}, owned = null, claimed = null, plain = false, key, filename }) {
  // Plan first, so progress has a total: which letters need drafting, and which
  // uploaded files each section takes (a catch-all takes what is left over).
  const neededGen = [...new Set(def.sections.filter((s) => s.generatedKey).map((s) => s.generatedKey))];
  const missingGen = neededGen.filter((k) => !(app.generated || []).some((g) => g.key === k && g.stored) && letterSpec(app, k));
  const usedDocIds = new Set();
  const planDocs = (node) => {
    if (node.generatedKey) return [];
    let docs = [];
    if (node.catchAll) {
      docs = (app.documents || []).filter((d) => {
        if (usedDocIds.has(d.id) || NEVER.has(d.category) || d.category === 'photo') return false;
        if (claimed) return !claimed.has(d.category);
        return !d.category || (owned && owned.has(d.category));
      });
    } else if (node.categories?.length) {
      const wanted = new Set(node.categories);
      docs = (app.documents || []).filter((d) => wanted.has(d.category) && !usedDocIds.has(d.id));
    }
    docs.forEach((d) => usedDocIds.add(d.id));
    return docs;
  };
  const plan = def.sections.map((sec) => ({ sec, docs: planDocs(sec), children: (sec.children || []).map((c) => ({ child: c, docs: planDocs(c) })) }));
  const fileCount = plan.reduce((n, p) => n + p.docs.length + p.children.reduce((m, c) => m + c.docs.length, 0), 0);

  job.total = missingGen.length + fileCount + 1; // + assembling the PDF
  job.done = 0;

  job.phase = 'letters';
  for (const k of neededGen) {
    const drafting = missingGen.includes(k);
    if (drafting) job.current = letterSpec(app, k)?.title || k;
    try {
      app = await ensureGenerated(app, k);
    } catch (e) {
      throw new Error(`Could not generate ${k}: ${e.message}`);
    }
    if (drafting) job.done++;
  }

  const stats = { droppedPages: 0, rotatedPages: 0, mirroredPages: 0, skippedFiles: [], included: [], pages: 0, uncertainPages: [] };

  // Every upload — PDF of any geometry, or a photo — becomes a list of upright
  // page pictures (lib/packageDocs.js), written straight to disk so a
  // 100-file package never sits in memory. The compiler just places pictures.
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'compile-'));
  try {
    job.phase = 'documents';
    let pageNo = 0;
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
            stats.skippedFiles.push(d.filename);
            continue;
          }
          const bytes = await readUpload(app.id, d.stored);
          const prepared = await prepareDocument({ bytes, mime: d.mime }, { cleanPages, fixRotation });
          stats.droppedPages += prepared.dropped;
          stats.mirroredPages += prepared.mirrored;
          stats.rotatedPages += prepared.rotated;
          if (prepared.uncertain?.length) stats.uncertainPages.push(`${d.filename} (page ${prepared.uncertain.join(', ')})`);
          for (const p of prepared.pages) {
            const file = path.join(work, `p-${String(++pageNo).padStart(5, '0')}.jpg`);
            await fs.writeFile(file, p.buffer);
            items.push({ kind: 'picture', file, width: p.width, height: p.height, filename: d.filename });
          }
        } catch (e) {
          console.error(`[compile] could not prepare "${d.filename}": ${e.message}`);
          stats.skippedFiles.push(d.filename);
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
    job.current = plain ? 'assembling the PDF' : 'assembling the PDF and table of contents';
    const applicantName = [d.givenName, d.familyName].filter(Boolean).join(' ');
    const target = await generatedTarget(app.id, { key, filename });
    let compiled;
    try {
      compiled = await compilePackage(def.title, applicantName, sections, {
        outPath: target.file,
        plain,
        onProgress: (n, total) => (job.current = `assembling page ${n} of ${total}`),
      });
    } catch (e) {
      throw new Error(`Compilation failed: ${e.message}`);
    }
    stats.skippedFiles = [...new Set([...stats.skippedFiles, ...compiled.skipped])];
    stats.pages = compiled.pages;
    stats.included = sections.map((s) => ({ name: s.name, count: s.items.length + s.children.reduce((n, c) => n + c.items.length, 0) }));
    const meta = await target.meta();
    const updated = await updateApplication(app.id, (a) => {
      const m = new Map((a.generated || []).map((g) => [g.key, g]));
      m.set(key, meta);
      a.generated = [...m.values()];
      return a;
    });
    job.done = job.total;
    return { app: updated, meta, stats };
  } finally {
    fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
