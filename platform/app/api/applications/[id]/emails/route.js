import { updateApplication } from '@/lib/store';
import { analyzeEmail } from '@/lib/emailFacts';
import { json, error, requireAppAccess } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * The client's emails on a file (team only).
 * { action: 'analyze', emailId }                 read the email for facts again
 * { action: 'used', emailId, field }             the team took the email's value for an intake field
 * { action: 'dismiss', emailId, factId, undo? }  leave a fact out of letters and the review
 */
export async function POST(req, { params }) {
  const { user, app, role, error: err } = await requireAppAccess(params.id);
  if (err) return err;
  if (role !== 'admin' && role !== 'manager') return error('Only the team can work with emails.', 403);
  let body;
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  const emailId = String(body.emailId || '');
  if (!(app.emails || []).some((e) => e.id === emailId)) return error('Email not found on this file.', 404);

  if (body.action === 'analyze') {
    try {
      await analyzeEmail(app.id, emailId);
    } catch (e) {
      return error(`Could not read the email: ${e.message}`, 502);
    }
  } else if (body.action === 'used') {
    // The page saved the email's value through the intake (so autosave versions stay in step); remember it was taken.
    await updateApplication(app.id, (a) => {
      const c = (a.emails.find((x) => x.id === emailId)?.analysis?.conflicts || []).find((x) => x.field === String(body.field || ''));
      if (!c) return false;
      c.used = true;
      return a;
    }, { quiet: true });
  } else if (body.action === 'dismiss') {
    await updateApplication(app.id, (a) => {
      const f = (a.emails.find((x) => x.id === emailId)?.analysis?.facts || []).find((x) => x.id === body.factId);
      if (!f) return false;
      f.dismissed = !body.undo;
      return a;
    }, { by: user.id });
  } else {
    return error('Unknown action.');
  }
  const { getApplication } = await import('@/lib/store');
  const fresh = await getApplication(app.id);
  return json({ emails: fresh.emails || [], data: fresh.data, dataVersion: fresh.dataVersion || 0 });
}
