import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getApplication, canAccess, listApplicationsFor } from '@/lib/store';
import { caseKeyOf, groupCases, caseLabel } from '@/lib/cases';
import { driveOn } from '@/lib/driveStore';
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

  // The family this file belongs to (the main applicant and the others applying with them).
  const key = caseKeyOf(app);
  const members = (await listApplicationsFor(user)).filter((a) => caseKeyOf(a) === key);
  const c = groupCases(members.length ? members : [app])[0];
  const family = {
    key,
    label: caseLabel(c),
    members: c.members.map((m) => ({ id: m.id, title: m.title, applicantRole: m.applicantRole || 'main', main: m.id === c.main.id })),
  };

  return (
    <>
      <TopBar user={user} />
      <Workspace initialApp={app} schema={getSchema(app.type)} viewerRole={user.role} family={family} driveOn={driveOn()} />
      <AssistantWidget appId={app.id} initialHistory={app.assistantHistory || []} />
    </>
  );
}
