import { appForToken, clientView, saveClientAnswers, submitClientForm } from '@/lib/clientLinks';
import { json } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The client's questionnaire, opened with their link (no account): read it,
 * save answers as they type, and submit it once with their confirmation.
 */
const MESSAGES = {
  invalid: 'This link is not valid. Ask your case officer for a new one.',
  revoked: 'This link has been replaced. Ask your case officer for the new one.',
  expired: 'This link has expired. Ask your case officer for a new one.',
  submitted: 'The questionnaire has already been submitted and can no longer be changed.',
  confirm: 'Tick the confirmation and type your full name to submit.',
  incomplete: 'Some answers are still missing.',
};
const fail = (code, status, extra = {}) => json({ error: MESSAGES[code] || code, code, ...extra }, status);

export async function GET(_req, { params }) {
  const { app, error } = await appForToken(params.token);
  if (error) return fail(error, error === 'invalid' ? 404 : 410);
  return json(clientView(app));
}

export async function PUT(req, { params }) {
  const { app, error } = await appForToken(params.token);
  if (error) return fail(error, error === 'invalid' ? 404 : 410);
  let body;
  try {
    body = await req.json();
  } catch {
    return fail('Bad request.', 400);
  }
  if (JSON.stringify(body || {}).length > 300000) return fail('Too much data.', 413);
  const res = await saveClientAnswers(app.id, body?.answers || {});
  if (res.error) return fail(res.error, 409);
  return json({ ok: true, updatedAt: res.app.clientForm.updatedAt });
}

export async function POST(req, { params }) {
  const { app, error } = await appForToken(params.token);
  if (error) return fail(error, error === 'invalid' ? 404 : 410);
  let body;
  try {
    body = await req.json();
  } catch {
    return fail('Bad request.', 400);
  }
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
  const res = await submitClientForm(app.id, body || {}, { ip, userAgent: req.headers.get('user-agent') });
  if (res.error) return fail(res.error, res.error === 'incomplete' ? 422 : 409, res.problems ? { problems: res.problems } : {});
  return json(clientView(res.app));
}
