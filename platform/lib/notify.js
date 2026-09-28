import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, withLock, listUsers, effectiveRole } from './store';
import { displayName } from './cases';

/**
 * The team's notification center (DATA_DIR/notifications.json).
 *
 *   mention    someone mentioned you in a team note
 *   documents  a client of yours sent documents (email, upload)
 *   email      a client of yours sent an email without documents
 *   assigned   a client file was given to you (by an admin, or from Odoo)
 *
 * "A client of yours": the account managers on the file; when nobody is on
 * it, the admins. The person who caused the event is never notified.
 */

const FILE = () => path.join(DATA_DIR, 'notifications.json');
const KEEP_PER_USER = 300;

async function read() {
  try {
    return JSON.parse(await fs.readFile(FILE(), 'utf8'));
  } catch {
    return { items: [] };
  }
}
async function write(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${FILE()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, FILE());
}

/** "S26281 · Hamed Chavoshi 02" */
export const fileLabel = (app) => [app.clientNumber, displayName(app)].filter(Boolean).join(' · ');

/** Add a notification for each user (duplicates in the list are sent once). */
export async function notify(userIds, { kind, text, appId = null, link = null, by = null }) {
  const ids = [...new Set((userIds || []).filter(Boolean))].filter((id) => id !== by?.id);
  if (!ids.length) return 0;
  await withLock(FILE(), async () => {
    const store = await read();
    const at = new Date().toISOString();
    for (const userId of ids) store.items.push({ id: crypto.randomBytes(6).toString('hex'), userId, kind, text, appId, link, by, at, readAt: null });
    // Keep the newest per user.
    const count = new Map();
    store.items = store.items
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .filter((n) => {
        const c = (count.get(n.userId) || 0) + 1;
        count.set(n.userId, c);
        return c <= KEEP_PER_USER;
      });
    await write(store);
  });
  return ids.length;
}

/** The staff who look after a file: its account managers, else the admins. */
export async function fileTeam(app) {
  const users = (await listUsers()).filter((u) => u.active !== false);
  const staff = users.filter((u) => ['admin', 'manager'].includes(effectiveRole(u)));
  const managers = staff.filter((u) => (app.assignedTo || []).includes(u.id));
  return (managers.length ? managers : staff.filter((u) => effectiveRole(u) === 'admin')).map((u) => u.id);
}

/** Tell a file's team (never fails the caller). */
export async function notifyTeam(app, payload) {
  try {
    return await notify(await fileTeam(app), { appId: app.id, ...payload });
  } catch (e) {
    console.error(`[notify] ${e.message}`);
    return 0;
  }
}

export async function listFor(userId, { limit = 100 } = {}) {
  const items = (await read()).items.filter((n) => n.userId === userId).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return { items: items.slice(0, limit), unread: items.filter((n) => !n.readAt).length };
}

/** Mark some (ids) or all of a user's notifications read (or unread again). */
export async function markRead(userId, ids = null, asRead = true) {
  await withLock(FILE(), async () => {
    const store = await read();
    const at = new Date().toISOString();
    for (const n of store.items) {
      if (n.userId !== userId) continue;
      if (ids && !ids.includes(n.id)) continue;
      n.readAt = asRead ? n.readAt || at : null;
    }
    await write(store);
  });
}
