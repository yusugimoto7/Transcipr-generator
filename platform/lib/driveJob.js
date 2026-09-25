import { getApplication, updateApplication } from './store';
import { saveUpload, deleteUpload } from './uploads';
import { classifyByFilename } from './generators/classify';
import { collectDriveFiles, LIMITS } from './driveImport';

/**
 * "Import from Google Drive" as a background job, like reading documents
 * (lib/extractJob.js): a client folder can hold 100+ scans, which is minutes
 * of downloading. POST starts the job and returns at once; the page polls for
 * progress — first "listing folders", then "file 12 of 97 · 45 of 310 MB".
 *
 * Jobs live in this process's memory. If the server restarts mid-import the
 * files already saved are lost from the list; pressing Sync again re-imports.
 */

const jobs = (globalThis.__driveJobs ||= new Map()); // appId -> job

function view(job) {
  if (!job) return null;
  const { status, phase, found, done, total, bytesDone, totalBytes, current, saved, startedAt, finishedAt, error, result } = job;
  return {
    status, phase, found, done, total, bytesDone, totalBytes, current, saved, startedAt, finishedAt, error,
    ...(status === 'done' ? { result } : {}),
  };
}

export function getDriveJob(appId) {
  return view(jobs.get(appId));
}

/**
 * Start importing `url` into the application (unless an import is running).
 * `root` is the already-resolved Drive item, so link / sharing errors are
 * reported to the caller straight away rather than through the job.
 */
export function startDriveJob(appId, { url, root, includeBackups = false, userId }) {
  const running = jobs.get(appId);
  if (running?.status === 'running') return view(running);

  const job = {
    status: 'running',
    phase: 'listing',
    found: 0,
    done: 0,
    total: 0,
    bytesDone: 0,
    totalBytes: 0,
    current: null,
    saved: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    result: null,
  };
  jobs.set(appId, job);
  run(appId, { url, root, includeBackups, userId }, job).catch((e) => {
    job.status = 'failed';
    job.error = e.message || 'Drive import failed.';
    job.finishedAt = new Date().toISOString();
  });
  return view(job);
}

async function run(appId, { url, root, includeBackups, userId }, job) {
  const app = await getApplication(appId);

  // What was imported before, so unchanged files are not downloaded again.
  const fromDrive = (app.documents || []).filter((d) => d.driveId);
  const known = new Map(fromDrive.map((d) => [d.driveId, d.driveModified]));
  const prevById = new Map(fromDrive.map((d) => [d.driveId, d]));

  // Save new/changed files as they arrive. A changed file replaces the old
  // copy but keeps a category someone already set.
  const saved = [];
  const replaced = [];
  const failed = [];
  const onFile = async (f) => {
    const prev = prevById.get(f.driveId);
    try {
      const meta = await saveUpload(appId, {
        buffer: f.buffer,
        filename: f.filename,
        mime: f.mime,
        category: prev?.category || classifyByFilename(f.filename, app.type),
        maxBytes: LIMITS.fileBytes,
        extra: { source: 'drive', driveId: f.driveId, driveModified: f.driveModified, drivePath: f.drivePath },
      });
      saved.push(meta);
      job.saved = saved.length;
      if (prev) replaced.push(prev);
    } catch (e) {
      failed.push({ name: f.drivePath, reason: e.message });
    }
  };
  const onProgress = (p) => Object.assign(job, p);

  let result;
  try {
    result = await collectDriveFiles(url, { known, includeBackups, onFile, onProgress, root });
  } catch (e) {
    // Files saved before the failure are orphaned on disk; remove them.
    for (const m of saved) await deleteUpload(appId, m.stored).catch(() => {});
    throw e;
  }

  const replacedIds = new Set(replaced.map((d) => d.id));
  const now = new Date().toISOString();
  const updated = await updateApplication(
    appId,
    (a) => {
      a.documents = (a.documents || []).filter((d) => !replacedIds.has(d.id));
      a.documents.push(...saved);
      a.driveSource = { url, rootId: result.root.id, rootName: result.root.name, lastImportAt: now, lastImportBy: userId };
      return a;
    },
    { by: userId }
  );
  for (const d of replaced) await deleteUpload(appId, d.stored).catch(() => {});

  job.result = {
    documents: updated.documents,
    source: updated.driveSource,
    root: result.root,
    added: saved.filter((s) => !replaced.some((r) => r.driveId === s.driveId)).map((s) => s.drivePath),
    updated: replaced.map((r) => r.drivePath),
    unchanged: result.unchanged.length,
    skipped: [...result.skipped, ...failed],
  };
  job.current = null;
  job.status = 'done';
  job.finishedAt = new Date().toISOString();
}
