import { updateApplication, deleteApplication, effectiveRole } from '@/lib/store';
import { everyField, deriveData } from '@/lib/schema';
import { APP_TYPES, STAGE_LABELS } from '@/lib/appTypes';
import { json, error, requireAppAccess } from '@/lib/api';
import { ROLES, normNumber, isDefaultTitle, intakeName } from '@/lib/cases';
import { forViewer } from '@/lib/emails';
import { logActivity } from '@/lib/activity';
import { teamFilename } from '@/lib/mailIntake';
import { renameFile } from '@/lib/drive';
import { startExtractJob } from '@/lib/extractJob';
import { getAppType } from '@/lib/appTypes';

export async function GET(_req, { params }) {
  const { app, role, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  return json({ application: forViewer(app, role === 'admin' || role === 'manager') });
}

/**
 * Update intake data and/or file settings.
 * Body: { data?, title?, status?, stage?, clientNumber?, representation?, type?,
 *         baseDataVersion?, baseVersion? }
 *
 * Concurrent editing: the intake answers carry their own `dataVersion`, bumped
 * only when `data` is saved. When `baseDataVersion` no longer matches it,
 * someone else saved answers in the meantime: nothing is written and 409 is
 * returned with the latest copy, instead of silently overwriting their work.
 * Uploads, imports and generated files change the file's overall `version`
 * but not `dataVersion`, so they never block someone typing in the intake.
 * (`baseVersion` still checks the whole-file version for API callers.)
 */
export async function PATCH(req, { params }) {
  const { user, app, error: err } = await requireAppAccess(params.id);
  if (err) return err;

  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }

  const validIds = new Set(everyField().map((f) => f.id));
  const staff = ['admin', 'manager'].includes(effectiveRole(user));
  let conflict = null;
  let typeChanged = false;
  const renamed = [];

  const updated = await updateApplication(
    app.id,
    (a) => {
      const staleData = body.baseDataVersion !== undefined && Number(body.baseDataVersion) !== Number(a.dataVersion || 0);
      const staleFile = body.baseVersion !== undefined && Number(body.baseVersion) !== Number(a.version || 0);
      if (staleData || staleFile) {
        conflict = a;
        return false;
      }
      if (body.data && typeof body.data === 'object') {
        for (const [k, v] of Object.entries(body.data)) {
          if (validIds.has(k)) a.data[k] = v;
        }
        // Study permits: the intended date of entry follows the program start date unless set.
        if (body.data.programStart && !a.data.entryDate && validIds.has('entryDate')) a.data.entryDate = body.data.programStart;
        deriveData(a.data);
        a.dataVersion = (Number(a.dataVersion) || 0) + 1;
        // A file created without a name takes the name from the intake (as in the passport).
        if (isDefaultTitle(a.title) && intakeName(a)) a.title = intakeName(a);
      }
      if (typeof body.title === 'string' && body.title.trim()) a.title = body.title.trim();
      if (typeof body.status === 'string') a.status = body.status;
      if (typeof body.stage === 'string' && STAGE_LABELS[body.stage]) a.stage = body.stage;
      if (staff) {
        if (typeof body.clientNumber === 'string') a.clientNumber = normNumber(body.clientNumber);
        // Link this file to a family case (lib/cases.js); null unlinks it.
        if ('groupId' in body) a.groupId = typeof body.groupId === 'string' && body.groupId.trim() ? body.groupId.trim() : null;
        if (body.representation === 'self' || body.representation === 'firm') a.representation = body.representation;
        if (typeof body.type === 'string' && APP_TYPES[body.type]) {
          if (a.type !== body.type) {
            typeChanged = true;
            // A new type asks for other fields and has another checklist: read every
            // document again for it, and give files with no checklist code ("000 - …")
            // their code in the new checklist.
            a.type = body.type;
            for (const d of a.documents || []) {
              delete d.extractedAt;
              if (/^000 - /.test(d.filename || '') && d.category) {
                const nm = teamFilename(a, d);
                if (nm && !/^000 - /.test(nm) && nm !== d.filename) {
                  renamed.push({ driveId: d.driveId || null, name: nm });
                  d.filename = nm;
                }
              }
            }
          }
          a.typeGuessed = false; // the team chose it
        }
        if (ROLES.includes(body.applicantRole)) a.applicantRole = body.applicantRole;
        // Archive or restore by hand. Restoring keeps the Odoo sync from archiving it again.
        if (body.archived === false) {
          a.archived = null;
          a.archiveOverride = true;
        } else if (body.archived === true) {
          a.archived = { at: new Date().toISOString(), by: user.name || user.email, reason: 'Archived by the team' };
          a.archiveOverride = false;
        }
      }
      return a;
    },
    { by: user.id }
  );
  if (conflict) {
    return json(
      { error: 'This file was changed by someone else since you opened it.', conflict: true, application: conflict },
      409
    );
  }
  if (typeChanged && updated) {
    // Rename on Drive too, then read everything again with the new type's fields (background).
    for (const r of renamed) if (r.driveId) renameFile(r.driveId, r.name).catch((e) => console.error(`[drive] rename: ${e.message}`));
    if ((updated.documents || []).length && process.env.OPENAI_API_KEY) startExtractJob(app.id, { all: true }).catch((e) => console.error(`[extract] after type change: ${e.message}`));
    await logActivity(app.id, user, 'Changed the application type — documents are read again', { detail: getAppType(updated.type).title, items: renamed.map((r) => r.name) });
  }
  // Team activity log.
  if (updated) {
    const labels = new Map(everyField().map((f) => [f.id, f.label]));
    if (body.data && typeof body.data === 'object') {
      const keys = Object.keys(body.data).filter((k) => validIds.has(k));
      if (keys.length) await logActivity(app.id, user, 'Edited the intake', { items: keys.map((k) => labels.get(k) || k), merge: 'intake' });
    }
    const changed = ['title', 'clientNumber', 'type', 'representation', 'applicantRole', 'groupId'].filter((k) => k in body && body[k] !== app[k]);
    if (changed.length) await logActivity(app.id, user, 'Changed the file details', { items: changed.map((k) => ({ title: 'name', clientNumber: 'file number', type: 'application type', representation: 'representation', applicantRole: 'family role', groupId: 'family' }[k])) });
    if (body.archived === true) await logActivity(app.id, user, 'Archived the client');
    if (body.archived === false) await logActivity(app.id, user, 'Restored the client from the archive');
  }
  return json({ application: forViewer(updated, staff) });
}

export async function DELETE(_req, { params }) {
  const { user, app, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  const role = effectiveRole(user);
  if (role !== 'admin' && app.userId !== user.id && app.createdBy !== user.id) {
    return error('Only the owner or an admin can delete a file.', 403);
  }
  await deleteApplication(params.id, { by: user.id });
  await logActivity(app.id, user, 'Deleted the file', { detail: app.title });
  return json({ ok: true });
}
