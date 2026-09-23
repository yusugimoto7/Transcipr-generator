import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listApplicationsFor, listUsers } from '@/lib/store';
import { getAppType } from '@/lib/appTypes';
import TopBar from '@/components/TopBar';
import DashboardClient from '@/components/DashboardClient';
import AssistantWidget from '@/components/AssistantWidget';

export const metadata = { title: 'Files — Canada Visa Platform' };

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const staff = user.role === 'admin' || user.role === 'manager';
  const apps = await listApplicationsFor(user);
  const users = staff ? await listUsers() : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  const summary = apps.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    typeTitle: getAppType(a.type).title,
    status: a.status,
    stage: a.stage || 'documents',
    clientNumber: a.clientNumber || '',
    applicantRole: a.applicantRole || 'main',
    assignedTo: (a.assignedTo || []).map((id) => ({ id, name: byId.get(id)?.name || byId.get(id)?.email || '?' })),
    updatedAt: a.updatedAt,
  }));
  return (
    <>
      <TopBar user={user} />
      <div className="container">
        <DashboardClient initialApps={summary} user={{ name: user.name, role: user.role }} />
      </div>
      <AssistantWidget />
    </>
  );
}
