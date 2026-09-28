import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR, listAllApplications, updateApplication, createApplication, listUsers, adminEmails, getUserByEmail, effectiveRole } from './store';
import { odooConfig, listCards, cardUrl, workStages } from './odoo';
import { caseKeyOf, normNumber, displayName, isDefaultTitle } from './cases';

/**
 * Keeps the platform in step with the TR Visa project in Odoo:
 *  1. every main applicant's file is linked to its card — by the client number
 *     when the file has one, else by the applicant's name — and takes the card's
 *     number and name (the whole family gets the number);
 *  2. a card with no file yet becomes a new client file (type read from the card
 *     when it says; otherwise marked for the team to check).
 * When a client has several cards, the most recent one wins.
 * Runs every ODOO_SYNC_MINUTES (default 15) and from Admin → Odoo.
 */

const STORE = () => path.join(DATA_DIR, 'odoo.json');
const IMPORT_DAYS = () => Number(process.env.ODOO_IMPORT_DAYS || 365);

export async function readOdooStore() {
  try {
    return JSON.parse(await fs.readFile(STORE(), 'utf8'));
  } catch {
    return { lastSyncAt: null, lastError: null, lastResult: null, imported: {}, log: [] };
  }
}
async function writeOdooStore(s) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STORE(), JSON.stringify(s, null, 2));
}

/* ------------------------------ names ------------------------------ */

export const normName = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const tokens = (s) => new Set(normName(s).split(' ').filter((w) => w.length > 1));

/** Same person? All words of the shorter name appear in the longer (at least two words, or identical). */
export function sameName(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  if (!A.size || !B.size) return false;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  if (small.size < 2 && small.size !== big.size) return false;
  for (const w of small) if (!big.has(w)) return false;
  return true;
}

/* ------------------------------ linking ------------------------------ */

/**
 * Give a file (and its family) the card's client number and name. Returns
 * true when anything changed.
 */
async function linkFile(app, card, apps, { manual = false } = {}) {
  const number = card.number || normNumber(app.clientNumber);
  const same =
    app.odoo?.taskId === card.taskId &&
    (!number || normNumber(app.clientNumber) === number) &&
    !(isDefaultTitle(app.title) && card.name);
  if (same && !manual) return false;
  const oldKey = caseKeyOf(app);
  const family = apps.filter((m) => caseKeyOf(m) === oldKey);
  for (const m of family) {
    await updateApplication(
      m.id,
      (a) => {
        if (number) {
          a.clientNumber = number;
          a.groupId = number;
        }
        if (m.id === app.id) {
          if (card.name && (isDefaultTitle(a.title) || manual)) a.title = card.name;
          a.odoo = { taskId: card.taskId, title: card.title, number: card.number, url: cardUrl(card.taskId), linkedAt: new Date().toISOString(), manual: Boolean(manual) };
        }
        return a;
      },
      { quiet: true }
    );
  }
  return true;
}

/** The newest card for this file: its own (if set by hand), else by number, else by name. */
function cardFor(app, cards, newestByNumber) {
  if (app.odoo?.manual) return cards.find((c) => c.taskId === app.odoo.taskId) || null;
  const num = normNumber(app.clientNumber);
  if (num) return newestByNumber.get(num) || null;
  const name = displayName(app);
  if (isDefaultTitle(name)) return null;
  return cards.find((c) => sameName(c.name, name)) || null; // cards are newest first
}

async function ownerUser() {
  for (const email of adminEmails()) {
    const u = await getUserByEmail(email);
    if (u) return u;
  }
  return (await listUsers()).find((u) => effectiveRole(u) === 'admin') || null;
}

/* ------------------------------ the sync ------------------------------ */

let running = null;

export async function syncOdoo({ create = true } = {}) {
  if (!odooConfig().configured) return { skipped: 'Odoo is not connected.' };
  if (running) return running;
  running = (async () => {
    const store = await readOdooStore();
    const result = { cards: 0, linked: 0, created: 0, unmatched: 0, at: new Date().toISOString() };
    const log = (text, appId) => store.log.unshift({ at: new Date().toISOString(), text, appId: appId || null });
    try {
      store.lastError = null;
      const cards = await listCards({ stages: workStages() }); // cards in the stages the team works on, newest first
      result.cards = cards.length;
      const newestByNumber = new Map();
      for (const c of cards) if (c.number && !newestByNumber.has(c.number)) newestByNumber.set(c.number, c);
      let apps = await listAllApplications();

      // 1. Link the files the team already has.
      const used = new Set();
      for (const app of apps.filter((a) => (a.applicantRole || 'main') === 'main')) {
        const card = cardFor(app, cards, newestByNumber);
        if (!card) {
          if (!normNumber(app.clientNumber)) result.unmatched++;
          continue;
        }
        // This card and the client's older cards are accounted for.
        for (const c of cards) if (c === card || (card.number ? c.number === card.number : sameName(c.name, card.name))) used.add(c.taskId);
        if (await linkFile(app, card, apps)) {
          result.linked++;
          log(`Linked ${card.number || ''} ${card.name} to its Odoo card`.trim(), app.id);
          apps = await listAllApplications();
        }
      }

      // 2. New cards become client files (the newest card per client only).
      if (create) {
        const owner = await ownerUser();
        const staff = (await listUsers()).filter((u) => ['admin', 'manager'].includes(effectiveRole(u)) && u.active !== false);
        const since = Date.now() - IMPORT_DAYS() * 86400000;
        const seenNames = [];
        for (const card of cards) {
          if (used.has(card.taskId) || store.imported[card.taskId]) continue;
          if (card.number && newestByNumber.get(card.number) !== card) continue;
          if (!card.number && seenNames.some((n) => sameName(n, card.name))) continue;
          seenNames.push(card.name);
          if (!card.number && !card.name) continue;
          if (card.number && apps.some((a) => normNumber(a.clientNumber) === card.number)) continue;
          if (card.createdAt && new Date(card.createdAt).getTime() < since) continue;
          if (!owner) {
            store.lastError = 'No admin account to own new files — sign in once with ADMIN_EMAIL.';
            break;
          }
          const app = await createApplication({
            userId: owner.id,
            createdBy: owner.id,
            type: card.type || 'trv-outside',
            title: card.name || `Client ${card.number}`,
            clientNumber: card.number,
            applicantRole: 'main',
            groupId: card.number || null,
            representation: 'firm',
            assignedTo: staff.filter((u) => card.assignees.includes(String(u.email).toLowerCase())).map((u) => u.id),
          });
          await updateApplication(
            app.id,
            (a) => {
              a.odoo = { taskId: card.taskId, title: card.title, number: card.number, url: cardUrl(card.taskId), linkedAt: new Date().toISOString(), manual: false, imported: true };
              if (!card.type) a.typeGuessed = true;
              return a;
            },
            { quiet: true }
          );
          store.imported[card.taskId] = app.id;
          result.created++;
          log(`New file from Odoo: ${card.number || ''} ${card.name}${card.type ? '' : ' (type to check)'}`.trim(), app.id);
        }
      }

    } catch (e) {
      store.lastError = e.message;
      result.error = e.message;
    }
    store.lastSyncAt = result.at;
    store.lastResult = result;
    store.log = store.log.slice(0, 50);
    await writeOdooStore(store);
    return result;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Link a file to a card chosen by the team (kept even if names differ). */
export async function linkToCard(appId, taskId) {
  const cards = await listCards({ all: true });
  const card = cards.find((c) => c.taskId === Number(taskId));
  if (!card) throw new Error('That Odoo card was not found in the project.');
  const apps = await listAllApplications();
  const app = apps.find((a) => a.id === appId);
  if (!app) throw new Error('File not found.');
  await linkFile(app, card, apps, { manual: true });
  const store = await readOdooStore();
  store.log.unshift({ at: new Date().toISOString(), text: `Linked by hand: ${card.number || ''} ${card.name}`.trim(), appId });
  store.log = store.log.slice(0, 50);
  await writeOdooStore(store);
  return card;
}

/* ------------------------------ background ------------------------------ */

const P = globalThis.__odooPoller || (globalThis.__odooPoller = { started: false });

/** Sync every ODOO_SYNC_MINUTES (called from /api/health, like the other pollers). */
export function ensureOdooSync() {
  if (P.started || !odooConfig().configured) return;
  P.started = true;
  const every = Number(process.env.ODOO_SYNC_MINUTES || 15) * 60 * 1000;
  const tick = () => syncOdoo().catch((e) => console.error(`[odoo] sync failed: ${e.message}`));
  setTimeout(tick, 120000).unref?.();
  setInterval(tick, every).unref?.();
}
