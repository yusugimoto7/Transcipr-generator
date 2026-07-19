import { listApplications, createApplication } from '@/lib/store';
import { json, requireUser } from '@/lib/api';

export async function GET() {
  const { user, error: authErr } = await requireUser();
  if (authErr) return authErr;
  const apps = await listApplications(user.id);
  const summary = apps.map((a) => ({
    id: a.id,
    type: a.type,
    title: a.title,
    status: a.status,
    updatedAt: a.updatedAt,
    createdAt: a.createdAt,
  }));
  return json({ applications: summary });
}

export async function POST(req) {
  const { user, error: authErr } = await requireUser();
  if (authErr) return authErr;
  let body = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }
  const app = await createApplication({
    userId: user.id,
    type: body.type || 'study-permit',
    title: body.title || 'Study Permit Application',
  });
  return json({ application: app }, 201);
}
