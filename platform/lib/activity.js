import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, withLock, userLevel } from './store';

/**
 * The team's activity on a file: what each account manager, admin and super
 * admin did, and when (DATA_DIR/activity/<appId>.json). Shown under Team
 * notes. Client actions are not logged here.
 *
 * Repeated small edits (intake answers typed over a few minutes) are merged
 * into one entry: "Edited the intake: Given name, Date of birth".
 */

const DIR = () => path.join(DATA_DIR, 'activity');
const FILE = (appId) => path.join(DIR(), `${String(appId).replace(/[^\w-]/g, '')}.json`);
const MERGE_MS = 15 * 60 * 1000;
const KEEP = 2000;

async function read(appId) {
  try {
    return JSON.parse(await fs.readFile(FILE(appId), 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Record a team action on a file. `user` is the signed-in user; clients are
 * skipped. `merge` (a key) folds repeated actions of the same person into one
 * entry, adding `items` to it. Never throws.
 */
export async function logActivity(appId, user, action, { detail = '', items = null, merge = null } = {}) {
  try {
    if (!appId || !user) return;
    const level = userLevel(user);
    if (!['superadmin', 'admin', 'manager'].includes(level)) return;
    await withLock(FILE(appId), async () => {
      const list = await read(appId);
      const now = new Date();
      const last = list[list.length - 1];
      if (merge && last && last.merge === merge && last.by?.id === user.id && now - new Date(last.at) < MERGE_MS) {
        last.items = [...new Set([...(last.items || []), ...(items || [])])];
        last.at = now.toISOString();
        last.count = (last.count || 1) + 1;
      } else {
        list.push({ id: crypto.randomBytes(5).toString('hex'), at: now.toISOString(), by: { id: user.id, name: user.name || user.email, level }, action, detail: String(detail || '').slice(0, 500), items: items ? [...new Set(items)].slice(0, 50) : null, merge });
      }
      await fs.mkdir(DIR(), { recursive: true });
      await fs.writeFile(FILE(appId), JSON.stringify(list.slice(-KEEP)));
    });
  } catch (e) {
    console.error(`[activity] ${e.message}`);
  }
}

export async function activityFor(appId, { limit = 500 } = {}) {
  return (await read(appId)).slice(-limit).reverse();
}
