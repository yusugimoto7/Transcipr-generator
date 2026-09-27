import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listApplicationsFor, listUsers } from '@/lib/store';
import { getAppType } from '@/lib/appTypes';
import { getSchema } from '@/lib/schema';
import { fileProgress, stageOf } from '@/lib/progress';
import TopBar from '@/components/TopBar';
import DashboardClient from '@/components/DashboardClient';
import AssistantWidget from '@/components/AssistantWidget';

export const metadata = { title: 'Client files — Sugimoto Visa' };

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staff = user.role === 'admin' || user.role === 'manager';
  const apps = await listApplicationsFor(user);
  const users = staff ? await listUsers() : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const summary = apps.map((a) => {
    const type = getAppType(a.type);
    let p = null;
    try {
      p = fileProgress(a, getSchema(a.type));
    } catch {
      /* an unreadable file still lists */
    }
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      typeTitle: type.title,
      group: type.group,
      service: type.service || '',
      clientNumber: a.clientNumber || '',
      applicantRole: a.applicantRole || 'main',
      assignedTo: (a.assignedTo || []).map((id) => ({ id, name: byId.get(id)?.name || byId.get(id)?.email || '?' })),
      updatedAt: a.updatedAt,
      stage: p ? stageOf(p) : 'documents',
      docs: p ? { provided: p.documents.provided, required: p.documents.required } : null,
      intake: p ? { done: p.intake.done, total: p.intake.total } : null,
      check: p ? { red: p.check.red, orange: p.check.orange, toSign: p.check.toSign } : null,
      finalStale: Boolean(p?.final.stale),
    };
  });
  return (
    <>
      <TopBar user={user} />
      <div className="page">
        <DashboardClient initialApps={summary} user={{ name: user.name, role: user.role }} />
      </div>
      <AssistantWidget />
    </>
  );
}
