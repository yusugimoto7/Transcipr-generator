import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { listApplicationsFor, listUsers } from '@/lib/store';
import { summarizeFile } from '@/lib/fileSummary';
import { caseKeyOf, groupCases, caseLabel } from '@/lib/cases';
import TopBar from '@/components/TopBar';
import CaseClient from '@/components/cases/CaseClient';
import AssistantWidget from '@/components/AssistantWidget';

async function load(params) {
  const user = await getCurrentUser();
  if (!user) return { user: null };
  const key = decodeURIComponent(params.key);
  const apps = await listApplicationsFor(user);
  const members = apps.filter((a) => caseKeyOf(a) === key);
  return { user, key, apps, members };
}

export async function generateMetadata({ params }) {
  const { members } = await load(params);
  if (!members?.length) return { title: 'Client — Sugimoto Visa' };
  return { title: `${caseLabel(groupCases(members)[0])} — Sugimoto Visa` };
}

/** A client: the main applicant and the family members applying with them. */
export default async function CasePage({ params }) {
  const { user, key, apps, members } = await load(params);
  if (!user) redirect('/login');
  if (!members.length) notFound();
  const staff = user.role === 'admin' || user.role === 'manager';
  if (!staff && members.length === 1) redirect(`/application/${members[0].id}`);

  const people = new Map((staff ? await listUsers() : []).map((u) => [u.id, u]));
  const files = members.map((a) => summarizeFile(a, people));
  // Files that could be linked into this family (the ones in other cases).
  const others = staff
    ? apps
        .filter((a) => caseKeyOf(a) !== key)
        .map((a) => ({ id: a.id, title: a.title, clientNumber: a.clientNumber || '', type: a.type, applicantRole: a.applicantRole || 'main' }))
    : [];

  return (
    <>
      <TopBar user={user} />
      <div className="page">
        <CaseClient caseKey={key} files={files} others={others} staff={staff} />
      </div>
      <AssistantWidget />
    </>
  );
}
