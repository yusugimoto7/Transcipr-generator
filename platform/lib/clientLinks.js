import crypto from 'crypto';
import { getApplication, updateApplication } from './store';
import { cleanAnswers, prefill, toIntake, clientProblems, CONFIRM_TEXT } from './clientForm';
import { deriveData } from './schema';
import { notifyTeam, fileLabel } from './notify';
import { storeClientFormPdf } from './clientFormStore';

/**
 * The client's own link to their questionnaire (one per family member's file).
 *
 * The link is the login: "/q/<application id>.<random secret>". It can be
 * opened again and again to continue until the client submits; the team can
 * revoke it (a new link replaces it) and reopen a submitted questionnaire. It
 * opens nothing but that one questionnaire.
 *
 * app.clientLink  { token, createdAt, createdBy, expiresAt, revokedAt, lastOpenedAt }   (staff only)
 * app.clientForm  { answers, status: 'draft'|'submitted', startedAt, updatedAt,
 *                   submittedAt, confirmation: { name, at, ip, userAgent, text },
 *                   accepted: { intakeFieldId: iso } }
 */

const DAYS = () => Number(process.env.CLIENT_LINK_DAYS || 120);

export function linkPath(token) {
  return `/q/${encodeURIComponent(token)}`;
}

/** A new link for this file (the earlier one stops working). */
export async function createClientLink(appId, user) {
  const token = `${appId}.${crypto.randomBytes(24).toString('base64url')}`;
  const now = new Date();
  const updated = await updateApplication(appId, (a) => {
    a.clientLink = { token, createdAt: now.toISOString(), createdBy: user ? { id: user.id, name: user.name || user.email } : null, expiresAt: new Date(now.getTime() + DAYS() * 86400000).toISOString(), revokedAt: null, lastOpenedAt: null };
    return a;
  });
  return { token, app: updated };
}

export async function revokeClientLink(appId) {
  return updateApplication(appId, (a) => {
    if (a.clientLink) a.clientLink.revokedAt = new Date().toISOString();
    return a;
  });
}

/** Let the client change a submitted questionnaire again. */
export async function reopenClientForm(appId) {
  return updateApplication(appId, (a) => {
    if (a.clientForm) a.clientForm = { ...a.clientForm, status: 'draft', reopenedAt: new Date().toISOString() };
    return a;
  });
}

const same = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** The file a link opens, or { error } (no such link, revoked, expired). */
export async function appForToken(token) {
  const t = decodeURIComponent(String(token || ''));
  const id = t.split('.')[0];
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id) || t.length > 200) return { error: 'invalid' };
  const app = await getApplication(id);
  const link = app?.clientLink;
  if (!app || !link?.token || !same(link.token, t)) return { error: 'invalid' };
  if (link.revokedAt) return { error: 'revoked' };
  if (link.expiresAt && link.expiresAt < new Date().toISOString() && app.clientForm?.status !== 'submitted') return { error: 'expired' };
  return { app };
}

/** What the client page shows: the answers (saved, else pre-filled), the state, whose page it is. */
export function clientView(app) {
  const f = app.clientForm || {};
  return {
    name: [app.data?.givenName, app.data?.familyName].filter(Boolean).join(' ') || app.title || '',
    answers: f.answers || prefill(app.data || {}),
    status: f.status || 'new',
    submittedAt: f.submittedAt || null,
    confirmation: f.confirmation ? { name: f.confirmation.name, at: f.confirmation.at } : null,
    updatedAt: f.updatedAt || null,
  };
}

/** Save the client's answers as they type (refused after submitting). */
export async function saveClientAnswers(appId, input) {
  let refused = false;
  const updated = await updateApplication(appId, (a) => {
    if (a.clientForm?.status === 'submitted') {
      refused = true;
      return false;
    }
    const now = new Date().toISOString();
    const prev = a.clientForm || {};
    a.clientForm = { ...prev, answers: { ...(prev.answers || prefill(a.data || {})), ...cleanAnswers(input) }, status: 'draft', startedAt: prev.startedAt || now, updatedAt: now };
    if (a.clientLink) a.clientLink.lastOpenedAt = now;
    return a;
  }, { quiet: true });
  if (refused) return { error: 'submitted' };
  return { app: updated };
}

/**
 * Submit: everything required answered, the confirmation ticked and signed
 * with the client's name. After this the answers are read-only for the client.
 */
export async function submitClientForm(appId, { answers, agree, name }, meta = {}) {
  const signed = String(name || '').trim();
  if (!agree || signed.length < 3) return { error: 'confirm' };
  let problems = [];
  let refused = false;
  const updated = await updateApplication(appId, (a) => {
    if (a.clientForm?.status === 'submitted') {
      refused = true;
      return false;
    }
    const prev = a.clientForm || {};
    const merged = { ...(prev.answers || prefill(a.data || {})), ...cleanAnswers(answers || {}) };
    problems = clientProblems(merged);
    if (problems.length) return false;
    const now = new Date().toISOString();
    a.clientForm = {
      ...prev,
      answers: merged,
      status: 'submitted',
      startedAt: prev.startedAt || now,
      updatedAt: now,
      submittedAt: now,
      confirmation: { name: signed.slice(0, 120), at: now, ip: meta.ip || null, userAgent: String(meta.userAgent || '').slice(0, 300), text: CONFIRM_TEXT },
    };
    return a;
  }, { quiet: true });
  if (refused) return { error: 'submitted' };
  if (problems.length) return { error: 'incomplete', problems };
  // The signed questionnaire as a PDF, on the file and in the client's main Drive folder.
  let saved = updated;
  try {
    saved = await storeClientFormPdf(updated);
  } catch (e) {
    console.error(`[client form] could not save the questionnaire PDF for ${updated.id}: ${e.message}`);
  }
  await notifyTeam(saved, { kind: 'client-form', text: `${fileLabel(saved)} submitted the client questionnaire`, link: `/application/${saved.id}#intake:client` });
  return { app: saved };
}

/**
 * The team's review: each intake answer the questionnaire gives, next to what
 * the intake holds now. Accepting writes the chosen ones into the intake.
 */
export function reviewRows(app) {
  const answers = app.clientForm?.answers || {};
  const proposed = toIntake(answers);
  const data = app.data || {};
  const text = (v) => (Array.isArray(v) ? v.map((r) => Object.values(r || {}).filter(Boolean).join(' – ')).join('\n') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v ?? ''));
  return Object.entries(proposed).map(([id, value]) => {
    const now = text(data[id]);
    const theirs = text(value);
    return { id, value, theirs, now, same: now.trim() === theirs.trim(), accepted: app.clientForm?.accepted?.[id] || null };
  });
}

export async function acceptClientAnswers(appId, ids, user) {
  return updateApplication(appId, (a) => {
    const proposed = toIntake(a.clientForm?.answers || {});
    const now = new Date().toISOString();
    a.data ||= {};
    a.clientForm ||= {};
    a.clientForm.accepted ||= {};
    for (const id of ids) {
      if (!(id in proposed)) continue;
      a.data[id] = proposed[id];
      a.clientForm.accepted[id] = now;
    }
    deriveData(a.data);
    a.dataVersion = (Number(a.dataVersion) || 0) + 1;
    a.dataUpdatedAt = now;
    return a;
  }, { by: user ? { id: user.id, name: user.name || user.email } : undefined });
}
