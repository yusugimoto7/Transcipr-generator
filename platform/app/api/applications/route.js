import { listApplicationsFor, createApplication, effectiveRole, listUsers } from '@/lib/store';
import { APP_TYPES, DEFAULT_TYPE, getAppType } from '@/lib/appTypes';
import { json, error, requireUser } from '@/lib/api';

function summarize(a, users) {
  const byId = new Map((users || []).map((u) => [u.id, u]));
  return {
    id: a.id,
    type: a.type,
    typeTitle: getAppType(a.type).title,
    title: a.title,
    status: a.status,
    stage: a.stage || 'documents',
    clientNumber: a.clientNumber || '',
    applicantRole: a.applicantRole || 'main',
    groupId: a.groupId || null,
    representation: a.representation || 'self',
    assignedTo: (a.assignedTo || []).map((id) => ({ id, name: byId.get(id)?.name || byId.get(id)?.email || '?' })),
    owner: byId.get(a.userId) ? { id: a.userId, name: byId.get(a.userId).name || byId.get(a.userId).email } : null,
    updatedAt: a.updatedAt,
    createdAt: a.createdAt,
    version: a.version || 0,
  };
}

export async function GET() {
  const { user, error: authErr } = await requireUser();
  if (authErr) return authErr;
  const apps = await listApplicationsFor(user);
  const staff = ['admin', 'manager'].includes(effectiveRole(user));
  const users = staff ? await listUsers() : [];
  return json({ applications: apps.map((a) => summarize(a, users)) });
}

/**
 * Body: { type, title?, clientNumber?, applicantRole?, groupId?, representation? }
 * Staff create files on behalf of clients (the file is assigned to them and
 * represented by the firm by default); applicants create their own.
 */
export async function POST(req) {
  const { user, error: authErr } = await requireUser();
  if (authErr) return authErr;
  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }
  const type = APP_TYPES[body.type] ? body.type : DEFAULT_TYPE;
  const role = effectiveRole(user);
  const staff = role === 'admin' || role === 'manager';
  if (body.type && !APP_TYPES[body.type]) return error('Unknown application type.');

  const app = await createApplication({
    userId: user.id,
    createdBy: user.id,
    type,
    title: (body.title || '').trim() || `${getAppType(type).title} Application`,
    clientNumber: staff ? body.clientNumber || '' : '',
    applicantRole: ['main', 'spouse', 'child'].includes(body.applicantRole) ? body.applicantRole : 'main',
    groupId: staff ? body.groupId || null : null,
    representation: staff ? (body.representation === 'self' ? 'self' : 'firm') : 'self',
    assignedTo: role === 'manager' ? [user.id] : [],
  });
  return json({ application: app }, 201);
}
