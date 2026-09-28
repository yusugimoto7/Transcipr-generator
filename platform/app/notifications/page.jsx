import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { effectiveRole } from '@/lib/store';
import TopBar from '@/components/TopBar';
import NotificationsClient from '@/components/NotificationsClient';

export const metadata = { title: 'Notifications — Sugimoto Visa' };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!['admin', 'manager'].includes(effectiveRole(user))) redirect('/dashboard');
  return (
    <>
      <TopBar user={user} />
      <main className="page">
        <NotificationsClient />
      </main>
    </>
  );
}
