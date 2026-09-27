import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listApplicationsFor, listUsers } from '@/lib/store';
import { summarizeFile } from '@/lib/fileSummary';
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
  const summary = apps.map((a) => summarizeFile(a, byId));
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
