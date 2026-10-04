import { requireOwnedApp, json } from '@/lib/api';
import { effectiveRole } from '@/lib/store';
import { createClientLink, revokeClientLink, reopenClientForm, reviewRows, acceptClientAnswers, linkPath } from '@/lib/clientLinks';
import { clientProgress, clientProblems, otherAnswers } from '@/lib/clientForm';
import { logActivity } from '@/lib/activity';

export const runtime = 'nodejs';

const origin = (req) => {
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  return process.env.PUBLIC_URL?.replace(/\/$/, '') || `${proto}://${host}`;
};

/** The team's view of the client questionnaire: the link, where the client is, and the answers to review. */
function view(app, req) {
  const link = app.clientLink;
  const f = app.clientForm || null;
  return {
    link: link
      ? { url: `${origin(req)}${linkPath(link.token)}`, createdAt: link.createdAt, createdBy: link.createdBy, expiresAt: link.expiresAt, revokedAt: link.revokedAt, lastOpenedAt: link.lastOpenedAt }
      : null,
    form: f
      ? {
          status: f.status,
          startedAt: f.startedAt,
          updatedAt: f.updatedAt,
          submittedAt: f.submittedAt || null,
          confirmation: f.confirmation ? { name: f.confirmation.name, at: f.confirmation.at, ip: f.confirmation.ip } : null,
          progress: clientProgress(f.answers || {}),
          open: f.status === 'submitted' ? 0 : clientProblems(f.answers || {}).length,
        }
      : null,
    // The signed questionnaire as a PDF (made on submit), and whether it is in the client's Drive folder yet.
    pdf: (app.generated || []).some((g) => g.key === 'client-questionnaire')
      ? { url: `/api/applications/${app.id}/download/client-questionnaire`, onDrive: Boolean(app.driveGenerated?.['client-questionnaire']?.id) }
      : null,
    review: f?.answers ? reviewRows(app) : [],
    other: f?.answers ? otherAnswers(f.answers) : [],
  };
}

async function staffOnly(id) {
  const r = await requireOwnedApp(id);
  if (r.error) return r;
  if (!['admin', 'manager'].includes(effectiveRole(r.user))) return { error: json({ error: 'Staff only.' }, 403) };
  return r;
}

export async function GET(req, { params }) {
  const { app, error } = await staffOnly(params.id);
  if (error) return error;
  return json(view(app, req));
}

/** Body: { action: 'link' | 'revoke' | 'reopen' | 'accept', ids?: [intake field ids] } */
export async function POST(req, { params }) {
  const { app, user, error } = await staffOnly(params.id);
  if (error) return error;
  let body = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  let next = app;
  if (body.action === 'link') {
    ({ app: next } = await createClientLink(app.id, user));
    await logActivity(app.id, user, app.clientLink ? 'Made a new client questionnaire link (the old one stops working)' : 'Made a client questionnaire link');
  } else if (body.action === 'revoke') {
    next = await revokeClientLink(app.id);
    await logActivity(app.id, user, 'Turned off the client questionnaire link');
  } else if (body.action === 'reopen') {
    next = await reopenClientForm(app.id);
    await logActivity(app.id, user, 'Reopened the client questionnaire for changes');
  } else if (body.action === 'accept') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (!ids.length) return json({ error: 'Nothing to accept.' }, 400);
    next = await acceptClientAnswers(app.id, ids, user);
    await logActivity(app.id, user, 'Accepted client questionnaire answers into the intake', { items: ids, merge: 'client-accept' });
  } else return json({ error: 'Unknown action.' }, 400);
  return json({ ...view(next, req), data: next.data, dataVersion: next.dataVersion, version: next.version });
}
