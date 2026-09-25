import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getApplication, canAccess } from '@/lib/store';
import { getSchema } from '@/lib/schema';
import { checklistStatus } from '@/lib/checklist';
import TopBar from '@/components/TopBar';
import Workspace from '@/components/Workspace';
import AssistantWidget from '@/components/AssistantWidget';

export const metadata = { title: 'Application — Canada Visa Platform' };

export default async function ApplicationPage({ params }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const app = await getApplication(params.id);
  if (!app) notFound();
  if (!canAccess(user, app)) redirect('/dashboard');

  const schema = getSchema(app.type);
  const checklist = checklistStatus(app);

  return (
    <>
      <TopBar user={user} />
      <div className="container">
        <Workspace initialApp={app} schema={schema} initialChecklist={checklist} viewerRole={user.role} />
      </div>
      <AssistantWidget appId={app.id} initialHistory={app.assistantHistory || []} />
    </>
  );
}
