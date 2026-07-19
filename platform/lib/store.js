import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

/**
 * File-based JSON data store.
 *
 * Intentionally small and dependency-free so the platform runs anywhere with
 * zero native modules. Everything goes through this module, so swapping to a
 * real database (Postgres, SQLite, etc.) later only touches this file.
 *
 * Layout:
 *   <DATA_DIR>/users.json                  -> array of user records
 *   <DATA_DIR>/applications/<id>.json      -> one application per file
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const APPS_DIR = path.join(DATA_DIR, 'applications');

// Serialize writes to a given file to avoid interleaved read-modify-write races.
const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  locks.set(key, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (locks.get(key) === next) locks.delete(key);
  }
}

async function ensureDirs() {
  await fs.mkdir(APPS_DIR, { recursive: true });
}

async function readJson(file, fallback) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJson(file, data) {
  await ensureDirs();
  const tmp = `${file}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

/* ----------------------------- Users ----------------------------- */

export async function getUserByEmail(email) {
  const users = await readJson(USERS_FILE, []);
  const norm = String(email || '').trim().toLowerCase();
  return users.find((u) => u.email === norm) || null;
}

export async function getUserById(id) {
  const users = await readJson(USERS_FILE, []);
  return users.find((u) => u.id === id) || null;
}

export async function createUser({ email, name, passwordHash }) {
  const norm = String(email).trim().toLowerCase();
  return withLock(USERS_FILE, async () => {
    const users = await readJson(USERS_FILE, []);
    if (users.some((u) => u.email === norm)) {
      const e = new Error('An account with this email already exists.');
      e.code = 'EMAIL_TAKEN';
      throw e;
    }
    const user = {
      id: newId(),
      email: norm,
      name: name || '',
      passwordHash,
      createdAt: nowIso(),
    };
    users.push(user);
    await writeJson(USERS_FILE, users);
    return user;
  });
}

/* -------------------------- Applications -------------------------- */

function appFile(id) {
  return path.join(APPS_DIR, `${id}.json`);
}

export async function listApplications(userId) {
  await ensureDirs();
  let files = [];
  try {
    files = await fs.readdir(APPS_DIR);
  } catch {
    return [];
  }
  const apps = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const app = await readJson(path.join(APPS_DIR, f), null);
    if (app && app.userId === userId) apps.push(app);
  }
  apps.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return apps;
}

export async function getApplication(id) {
  return readJson(appFile(id), null);
}

export async function createApplication({ userId, type, title }) {
  const app = {
    id: newId(),
    userId,
    type: type || 'study-permit',
    title: title || 'Study Permit Application',
    status: 'draft',
    data: {},            // intake answers keyed by field id
    documents: [],       // uploaded files metadata
    generated: [],       // generated output files metadata
    review: null,        // last AI readiness review
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await writeJson(appFile(app.id), app);
  return app;
}

/**
 * Apply a mutation to an application under a per-file lock and persist it.
 * `mutator` receives the current app and may mutate it in place or return a new one.
 */
export async function updateApplication(id, mutator) {
  return withLock(appFile(id), async () => {
    const app = await readJson(appFile(id), null);
    if (!app) return null;
    const next = (await mutator(app)) || app;
    next.updatedAt = nowIso();
    await writeJson(appFile(id), next);
    return next;
  });
}

export async function deleteApplication(id) {
  try {
    await fs.unlink(appFile(id));
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

export { DATA_DIR };
