import { effectiveRole } from '@/lib/store';
import { resolveRoot } from '@/lib/driveImport';
import { driveStatus, DriveError } from '@/lib/drive';
import { startDriveJob, getDriveJob } from '@/lib/driveJob';
import { json, error, requireAppAccess } from '@/lib/api';

export const runtime = 'nodejs';

// Staff only: the service account can read the firm's whole client tree, so an
// applicant must never be able to point it at a folder ID they obtained.
async function requireStaffOnApp(id) {
  const res = await requireAppAccess(id);
  if (res.error) return res;
  const role = effectiveRole(res.user);
  if (role !== 'admin' && role !== 'manager') return { error: error('Only staff can import from Google Drive.', 403) };
  return res;
}

/** Connection status, the last import, and the running import's progress. */
export async function GET(_req, { params }) {
  const { app, error: err } = await requireStaffOnApp(params.id);
  if (err) return err;
  return json({ drive: driveStatus(), source: app.driveSource || null, job: getDriveJob(app.id) });
}

/**
 * Start an import. Body: { url?, includeBackups? } — url defaults to the last
 * imported link, so "Sync again" re-imports only what changed in Drive.
 * The link is checked here (bad link, not shared) so those errors come back
 * at once; the downloading runs as a background job (lib/driveJob.js).
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

  let root;
  try {
    root = await resolveRoot(url);
  } catch (e) {
    return error(e.message || 'Drive import failed.', e instanceof DriveError ? e.status : 502);
  }

  const job = startDriveJob(app.id, { url, root, includeBackups: Boolean(body.includeBackups), userId: user.id });
  return json({ job }, 202);
}
