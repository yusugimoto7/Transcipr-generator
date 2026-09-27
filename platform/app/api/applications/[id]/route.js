import { updateApplication, deleteApplication, effectiveRole } from '@/lib/store';
import { everyField } from '@/lib/schema';
import { APP_TYPES, STAGE_LABELS } from '@/lib/appTypes';
import { json, error, requireAppAccess } from '@/lib/api';
import { ROLES, normNumber, isDefaultTitle, intakeName } from '@/lib/cases';

export async function GET(_req, { params }) {
  const { app, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  return json({ application: app });
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
          a.type = body.type;
          a.typeGuessed = false; // the team chose it
        }
        if (ROLES.includes(body.applicantRole)) a.applicantRole = body.applicantRole;
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
  return json({ application: updated });
}

export async function DELETE(_req, { params }) {
  const { user, app, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  const role = effectiveRole(user);
  if (role !== 'admin' && app.userId !== user.id && app.createdBy !== user.id) {
    return error('Only the owner or an admin can delete a file.', 403);
  }
  await deleteApplication(params.id);
  return json({ ok: true });
}
