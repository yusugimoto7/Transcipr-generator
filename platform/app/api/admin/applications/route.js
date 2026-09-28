import { listAllApplications, listUsers, canAccess } from '@/lib/store';
import { getAppType } from '@/lib/appTypes';
import { unusedReason } from '@/lib/unused';
import { caseKeyOf } from '@/lib/cases';
import { json, requireAdmin } from '@/lib/api';

/** Every file in the system with owner and assignment info (admin only). */
export async function GET() {
  const { user: me, error: err } = await requireAdmin();
  if (err) return err;
  const [all, users] = await Promise.all([listAllApplications(), listUsers()]);
  const apps = all.filter((a) => canAccess(me, a));
  const byId = new Map(users.map((u) => [u.id, u]));
  const name = (id) => byId.get(id)?.name || byId.get(id)?.email || '?';
  return json({
    applications: apps.map((a) => ({
      id: a.id,
      title: a.title,
      type: a.type,
      typeTitle: getAppType(a.type).title,
      clientNumber: a.clientNumber || '',
      applicantRole: a.applicantRole || 'main',
      stage: a.stage || 'documents',
      status: a.status,
      representation: a.representation || 'self',
      owner: { id: a.userId, name: name(a.userId) },
      createdBy: a.createdBy ? { id: a.createdBy, name: name(a.createdBy) } : null,
      assignedTo: (a.assignedTo || []).map((id) => ({ id, name: name(id) })),
      lastEditedBy: a.lastEditedBy ? name(a.lastEditedBy) : null,
      updatedAt: a.updatedAt,
      version: a.version || 0,
      archived: Boolean(a.archived),
      caseKey: caseKeyOf(a),
      unused: unusedReason(a),
    })),
    managers: users.filter((u) => u.active !== false && !u.allFilesAccess && ['manager', 'admin'].includes(u.level)),
  });
}
