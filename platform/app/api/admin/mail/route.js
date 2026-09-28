import { readMailStore, mailConfig, checkMail, assignMessage, ignoreMessage, restoreMessage, retryDrive, startBackfill, backfillStatus } from '@/lib/mailIntake';
import { ensureMailPoller } from '@/lib/mailPoller';
import { listAllApplications, canAccess } from '@/lib/store';
import { json, error, requireStaff } from '@/lib/api';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Email intake: mailbox status, the messages seen, and the files to assign to. */
export async function GET() {
  const { user, error: err } = await requireStaff();
  if (err) return err;
  ensureMailPoller();
  const cfg = mailConfig();
  const store = await readMailStore();
  const messages = Object.values(store.messages)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 200);
  const apps = (await listAllApplications()).filter((a) => canAccess(user, a)).map((a) => ({ id: a.id, title: a.title, clientNumber: a.clientNumber || null, type: a.type }));
  return json({
    status: { configured: cfg.configured, host: cfg.host, user: cfg.user, folder: cfg.folder, pollMinutes: cfg.pollMinutes, clientsFolder: cfg.clientsFolder, lastCheckAt: store.lastCheckAt, lastError: store.lastError },
    messages,
    apps,
    backfill: backfillStatus(),
  });
}

/** { action: 'check' } | { action: 'backfill' } | { action: 'assign', id, appId, remember? } | { action: 'ignore', id | ids } | { action: 'restore', id } | { action: 'drive', id } */
export async function POST(req) {
  const { error: err } = await requireStaff();
  if (err) return err;
  let body = {};
  try {
    body = await req.json();
  } catch {
    return error('Invalid request body.');
  }
  try {
    if (body.action === 'check') {
      if (!mailConfig().configured) return error('The mailbox is not configured (MAIL_USER / MAIL_PASSWORD).', 503);
      return json({ counts: await checkMail() });
    }
    if (body.action === 'backfill') {
      if (!mailConfig().configured) return error('The mailbox is not configured (MAIL_USER / MAIL_PASSWORD).', 503);
      return json({ backfill: startBackfill() });
    }
    if (body.action === 'assign') return json({ message: await assignMessage(String(body.id), String(body.appId), { remember: Boolean(body.remember) }) });
    if (body.action === 'ignore') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [String(body.id)];
      for (const id of ids) await ignoreMessage(id);
      return json({ ok: true, ignored: ids.length });
    }
    if (body.action === 'drive') return json({ message: await retryDrive(String(body.id)) });
    if (body.action === 'restore') {
      await restoreMessage(String(body.id));
      return json({ ok: true });
    }
    return error('Unknown action.');
  } catch (e) {
    return error(e.message || 'Mail action failed.', 502);
  }
}
