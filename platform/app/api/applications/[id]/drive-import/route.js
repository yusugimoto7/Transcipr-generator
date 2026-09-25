import { updateApplication, effectiveRole } from '@/lib/store';
import { saveUpload, deleteUpload } from '@/lib/uploads';
import { classifyByFilename } from '@/lib/generators/classify';
import { collectDriveFiles, LIMITS } from '@/lib/driveImport';
import { driveStatus, DriveError } from '@/lib/drive';
import { json, error, requireAppAccess } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

// Staff only: the service account can read the firm's whole client tree, so an
// applicant must never be able to point it at a folder ID they obtained.
async function requireStaffOnApp(id) {
  const res = await requireAppAccess(id);
  if (res.error) return res;
  const role = effectiveRole(res.user);
  if (role !== 'admin' && role !== 'manager') return { error: error('Only staff can import from Google Drive.', 403) };
  return res;
}

/** Connection status for the UI (and the email to share folders with). */
export async function GET(_req, { params }) {
  const { app, error: err } = await requireStaffOnApp(params.id);
  if (err) return err;
  return json({ drive: driveStatus(), source: app.driveSource || null });
}

/**
 * Body: { url?, includeBackups? } — url defaults to the last imported link,
 * so "Sync again" re-imports only what changed in Drive.
 */
export async function POST(req, { params }) {
  const { user, app, error: err } = await requireStaffOnApp(params.id);
  if (err) return err;

  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional */
  }
  const url = String(body.url || app.driveSource?.url || '').trim();
  if (!url) return error('Paste the Google Drive link of the client\'s documents folder.');

  // What was imported before, so unchanged files are not downloaded again.
  const fromDrive = (app.documents || []).filter((d) => d.driveId);
  const known = new Map(fromDrive.map((d) => [d.driveId, d.driveModified]));

  // Save new/changed files as they arrive. A changed file replaces the old
  // copy but keeps a category someone already set.
  const saved = [];
  const replaced = [];
  const failed = [];
  const prevById = new Map(fromDrive.map((d) => [d.driveId, d]));
  const onFile = async (f) => {
    const prev = prevById.get(f.driveId);
    try {
      const meta = await saveUpload(app.id, {
        buffer: f.buffer,
        filename: f.filename,
        mime: f.mime,
        category: prev?.category || classifyByFilename(f.filename, app.type),
        maxBytes: LIMITS.fileBytes,
        extra: { source: 'drive', driveId: f.driveId, driveModified: f.driveModified, drivePath: f.drivePath },
      });
      saved.push(meta);
      if (prev) replaced.push(prev);
    } catch (e) {
      failed.push({ name: f.drivePath, reason: e.message });
    }
  };

  let result;
  try {
    result = await collectDriveFiles(url, { known, includeBackups: Boolean(body.includeBackups), onFile });
  } catch (e) {
    // Files saved before the failure are orphaned on disk; remove them.
    for (const m of saved) await deleteUpload(app.id, m.stored).catch(() => {});
    return error(e.message || 'Drive import failed.', e instanceof DriveError ? e.status : 502);
  }

  const replacedIds = new Set(replaced.map((d) => d.id));
  const now = new Date().toISOString();
  const updated = await updateApplication(
    app.id,
    (a) => {
      a.documents = (a.documents || []).filter((d) => !replacedIds.has(d.id));
      a.documents.push(...saved);
      a.driveSource = {
        url,
        rootId: result.root.id,
        rootName: result.root.name,
        lastImportAt: now,
        lastImportBy: user.id,
      };
      return a;
    },
    { by: user.id }
  );
  for (const d of replaced) await deleteUpload(app.id, d.stored).catch(() => {});

  return json({
    documents: updated.documents,
    source: updated.driveSource,
    root: result.root,
    added: saved.filter((s) => !replaced.some((r) => r.driveId === s.driveId)).map((s) => s.drivePath),
    updated: replaced.map((r) => r.drivePath),
    unchanged: result.unchanged.length,
    skipped: [...result.skipped, ...failed],
  });
}
