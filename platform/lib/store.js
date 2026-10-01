import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { deriveData } from './schema';

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
 *
 * Concurrency: every read-modify-write of a file goes through a per-file
 * queue (withLock) so two staff members saving the same file at once can't
 * interleave. On top of that, applications carry a `version` counter that
 * the PATCH route uses for optimistic checks ("someone else saved first").
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), 'data');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const APPS_DIR = path.join(DATA_DIR, 'applications');

export const ROLES = ['superadmin', 'admin', 'manager', 'applicant'];
export const LEVEL_LABEL = { superadmin: 'Super admin', admin: 'Admin', manager: 'Account manager', applicant: 'Client' };

// Serialize writes to a given file to avoid interleaved read-modify-write races.
const locks = new Map();
export async function withLock(key, fn) {
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

function normEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** The configured admin email(s) — ADMIN_EMAIL=a@x.com,b@y.com. */
export function adminEmails() {
  return String(process.env.ADMIN_EMAIL || '')
    .split(',')
    .map(normEmail)
    .filter(Boolean);
}

/**
 * Three layers of staff:
 *   super admin      the ADMIN_EMAIL account(s) and anyone made super admin — everything,
 *                    including who is an admin;
 *   admin            every file; manages account managers and which files they can open;
 *   account manager  only the files given to them (app.assignedTo).
 * `level` is that layer; `effectiveRole` is the access role used everywhere
 * else, where a super admin counts as an admin.
 */
export function userLevel(user) {
  if (!user) return null;
  if (adminEmails().includes(user.email)) return 'superadmin';
  // The signed-in user (lib/auth getCurrentUser) carries its level; a stored record its role.
  if (ROLES.includes(user.level)) return user.level;
  return ROLES.includes(user.role) ? user.role : 'applicant';
}
export const isSuperAdmin = (user) => userLevel(user) === 'superadmin';

/** Role a user record effectively has for access (a super admin is an admin). */
export function effectiveRole(user) {
  const level = userLevel(user);
  return level === 'superadmin' ? 'admin' : level;
}

export async function getUserByEmail(email) {
  const users = await readJson(USERS_FILE, []);
  const norm = normEmail(email);
  return users.find((u) => u.email === norm) || null;
}

export async function getUserById(id) {
  const users = await readJson(USERS_FILE, []);
  return users.find((u) => u.id === id) || null;
}

export async function listUsers() {
  const users = await readJson(USERS_FILE, []);
  // eslint-disable-next-line no-unused-vars
  return users.map(({ passwordHash, ...u }) => ({ ...u, role: effectiveRole(u), level: userLevel(u), fixed: adminEmails().includes(u.email), allFilesAccess: seesAllFiles(u) }));
}

export async function createUser({ email, name, passwordHash, role = 'applicant', createdBy = null }) {
  const norm = normEmail(email);
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
      role: ROLES.includes(role) ? role : 'applicant',
      active: true,
      createdBy,
      createdAt: nowIso(),
    };
    users.push(user);
    await writeJson(USERS_FILE, users);
    return user;
  });
}

/** Update a user's role / active flag / name / password hash. */
export async function updateUser(id, patch) {
  return withLock(USERS_FILE, async () => {
    const users = await readJson(USERS_FILE, []);
    const u = users.find((x) => x.id === id);
    if (!u) return null;
    if (patch.role && ROLES.includes(patch.role)) u.role = patch.role;
    if (typeof patch.active === 'boolean') u.active = patch.active;
    if (typeof patch.name === 'string') u.name = patch.name.trim();
    if (typeof patch.autoNewFiles === 'boolean') u.autoNewFiles = patch.autoNewFiles;
    if (typeof patch.allFiles === 'boolean') u.allFiles = patch.allFiles;
    if (typeof patch.passwordHash === 'string') u.passwordHash = patch.passwordHash;
    u.updatedAt = nowIso();
    await writeJson(USERS_FILE, users);
    return u;
  });
}

/* -------------------------- Applications -------------------------- */

function appFile(id) {
  return path.join(APPS_DIR, `${id}.json`);
}

async function readAllApplications() {
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
    if (app) apps.push(app);
  }
  apps.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return apps;
}

/** Can this user open this application? */
/**
 * Does this user see every file? Super admins always; admins unless a super
 * admin switched their "All files" off (then, like account managers, they see
 * the files given to them).
 */
export function seesAllFiles(user) {
  const level = userLevel(user);
  return level === 'superadmin' || (level === 'admin' && user.allFiles !== false);
}

export function canAccess(user, app) {
  if (!user || !app) return false;
  if (seesAllFiles(user)) return true;
  const role = effectiveRole(user);
  if (app.userId === user.id || app.createdBy === user.id) return true;
  if (role === 'manager' || role === 'admin') return (app.assignedTo || []).includes(user.id);
  return false;
}

/** Applications visible to a user: admin = all; manager = assigned/created; applicant = own. */
export async function listApplicationsFor(user) {
  const all = await readAllApplications();
  return all.filter((a) => canAccess(user, a));
}

/** Back-compat: an applicant's own applications. */
export async function listApplications(userId) {
  const all = await readAllApplications();
  return all.filter((a) => a.userId === userId);
}

export async function listAllApplications() {
  return readAllApplications();
}

export async function getApplication(id) {
  const app = await readJson(appFile(id), null);
  // Answers saved before the intake changed shape (e.g. jobs as rows) are read in the current shape.
  if (app?.data) deriveData(app.data);
  return app;
}

export async function createApplication({
  userId,
  type,
  title,
  createdBy = null,
  clientNumber = '',
  applicantRole = 'main',
  groupId = null,
  representation = 'self',
  assignedTo = [],
}) {
  // Account managers get every new file by default (autoNewFiles, set per person in Team & access).
  const auto = (await readJson(USERS_FILE, []))
    .filter((u) => u.active !== false && (userLevel(u) === 'manager' || (userLevel(u) === 'admin' && u.allFiles === false)) && u.autoNewFiles !== false)
    .map((u) => u.id);
  const app = {
    id: newId(),
    userId,
    createdBy: createdBy || userId,
    assignedTo: [...new Set([...(Array.isArray(assignedTo) ? assignedTo : []), ...auto])],
    type: type || 'study-permit',
    title: title || 'Study Permit Application',
    clientNumber: String(clientNumber || '').trim(),
    applicantRole, // main | spouse | child | parent | other (lib/cases.js)
    groupId, // links the applications of one family file
    representation, // self | firm (adds IMM 5476 + Submission Letter)
    stage: 'documents',
    status: 'draft',
    version: 1,
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
 * Every successful write bumps `version` and records who saved (`opts.by`).
 */
export async function updateApplication(id, mutator, opts = {}) {
  return withLock(appFile(id), async () => {
    const app = await readJson(appFile(id), null);
    if (!app) return null;
    const result = await mutator(app);
    if (result === false) return app; // mutator declined (e.g. version conflict): nothing written
    const next = result || app;
    next.version = (Number(next.version) || 0) + 1;
    // Background bookkeeping (e.g. Drive sync) passes { quiet: true }: not a change anyone made.
    if (!opts.quiet) next.updatedAt = nowIso();
    if (opts.by) next.lastEditedBy = opts.by;
    await writeJson(appFile(id), next);
    return next;
  });
}

/**
 * Remove a file from the platform. The record is moved to DATA_DIR/deleted
 * (not erased), so it can be recovered by hand if needed. Drive and Odoo are
 * never touched.
 */
export async function deleteApplication(id, { by = null } = {}) {
  return withLock(appFile(id), async () => {
    const app = await readJson(appFile(id), null);
    if (!app) return false;
    const dir = path.join(DATA_DIR, 'deleted');
    await fs.mkdir(dir, { recursive: true });
    await writeJson(path.join(dir, `${id}.json`), { ...app, deletedAt: nowIso(), deletedBy: by });
    await fs.unlink(appFile(id));
    return true;
  });
}

export { DATA_DIR };
