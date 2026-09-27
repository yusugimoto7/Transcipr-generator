import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getApplication, canAccess } from '@/lib/store';
import { getSchema } from '@/lib/schema';
import TopBar from '@/components/TopBar';
import Workspace from '@/components/Workspace';
import AssistantWidget from '@/components/AssistantWidget';

export async function generateMetadata({ params }) {
  const app = await getApplication(params.id);
  return { title: app ? `${app.clientNumber ? `${app.clientNumber} ` : ''}${app.title} — Sugimoto Visa` : 'File — Sugimoto Visa' };
}

export default async function ApplicationPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const app = await getApplication(params.id);
  if (!app) notFound();
  if (!canAccess(user, app)) redirect('/dashboard');

  return (
    <>
      <TopBar user={user} />
      <Workspace initialApp={app} schema={getSchema(app.type)} viewerRole={user.role} />
      <AssistantWidget appId={app.id} initialHistory={app.assistantHistory || []} />
    </>
  );
}
