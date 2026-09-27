import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import TopBar from '@/components/TopBar';
import AdminClient from '@/components/AdminClient';

export const metadata = { title: 'Admin — Sugimoto Visa' };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');
  return (
    <>
      <TopBar user={user} />
      <div className="page">
        <AdminClient />
      </div>
    </>
  );
}
