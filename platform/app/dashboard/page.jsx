import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listApplications } from '@/lib/store';
import TopBar from '@/components/TopBar';
import DashboardClient from '@/components/DashboardClient';

export const metadata = { title: 'Your applications — Canada Visa Platform' };

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const apps = await listApplications(user.id);
  const summary = apps.map((a) => ({
    id: a.id,
    title: a.title,
    type: a.type,
    status: a.status,
    updatedAt: a.updatedAt,
  }));
  return (
    <>
      <TopBar user={user} />
      <div className="container">
        <DashboardClient initialApps={summary} userName={user.name} />
      </div>
    </>
  );
}
