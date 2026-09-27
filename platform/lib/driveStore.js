import fs from 'fs/promises';
import path from 'path';
import { UPLOAD_DIR } from './paths';
import { getApplication, updateApplication, listAllApplications } from './store';
import {
  driveStatus,
  parseDriveLink,
  getItem,
  findChildren,
  searchFolders,
  getParents,
  createFolder,
  trashFile,
  downloadFile,
  uploadFromDisk,
  downloadToDisk,
} from './drive';
import { normNumber, isDefaultTitle } from './cases';

/**
 * Google Drive is where every file lives; the server's disk is only a cache.
 *
 *   Client folder  "S26901 - Sara Karimi" (found under DRIVE_CLIENTS_FOLDER, or
 *                  the folder the file was imported from; created if missing)
 *     01 - Documents      everything the client sends: imported, emailed, uploaded
 *     02 - Final Files    the numbered files for the IRCC portal
 *     03 - Working Files  letters, form data sheets, filled forms, next steps
 *
 * Documents imported from Drive already live there (their `driveId`). Uploads,
 * and everything the platform builds, are copied up in the background by
 * `queueSync` (plus a sweep every few minutes). Reading a file goes through
 * `docFile` / `genFile`: the cached copy if present, otherwise it is fetched
 * from Drive again. `evictCache` keeps the cache under CACHE_MAX_MB by removing
 * the least recently used files that are safely on Drive — never a file that
 * isn't on Drive yet.
 *
 * Without a Drive connection everything stays on the server disk, as before.
 */

export const DOCS_FOLDER = '01 - Documents';
export const FINAL_FOLDER = '02 - Final Files';
export const WORK_FOLDER = '03 - Working Files';

const MB = 1024 * 1024;
const CACHE_MAX = () => Number(process.env.CACHE_MAX_MB || 600) * MB;
const IDLE_MS = Number(process.env.CACHE_IDLE_MINUTES ?? 30) * 60 * 1000; // a file used this recently stays cached
const SWEEP_MS = Number(process.env.DRIVE_SYNC_MINUTES || 10) * 60 * 1000;

export const driveOn = () => driveStatus().mode === 'service-account';
export const clientsRoot = () => parseDriveLink(process.env.DRIVE_CLIENTS_FOLDER || '')?.id || null;

/* ------------------------------ client folder ------------------------------ */

/** Is folder `id` somewhere under the clients folder (up to 4 levels)? */
async function underClients(id, rootId) {
  let cur = [id];
  for (let depth = 0; depth < 4 && cur.length; depth++) {
    const next = [];
    for (const c of cur) {
      let parents = [];
      try {
        parents = await getParents(c);
      } catch {
        /* unreadable */
      }
      if (parents.includes(rootId)) return true;
      next.push(...parents);
    }
    cur = next;
  }
  return false;
}

/**
 * The client's folder on Drive and its "01 - Documents" folder: the folder the
 * file was imported from, else a folder named with the client number (or the
 * name) under the clients folder, else a new "S26160 - First Last" folder.
 * A family shares one folder, named after the main applicant.
 */
export async function ensureClientFolder(app) {
  const root = clientsRoot();
  if ((app.applicantRole || 'main') !== 'main' && app.clientNumber) {
    const main = (await listAllApplications()).find(
      (a) => a.id !== app.id && normNumber(a.clientNumber) === normNumber(app.clientNumber) && (a.applicantRole || 'main') === 'main'
    );
    if (main) app = { ...app, data: main.data, title: main.title, driveSource: app.driveSource || main.driveSource };
  }
  let clientFolder = null;
  if (app.driveSource?.rootId) {
    try {
      const r = await getItem(app.driveSource.rootId);
      if (/01\s*-\s*Documents/i.test(r.name)) {
        const parents = await getParents(r.id);
        return { docsFolderId: r.id, clientFolderId: parents[0] || null, created: false };
      }
      clientFolder = r;
    } catch {
      clientFolder = null;
    }
  }
  const name = `${app.data?.givenName || ''} ${app.data?.familyName || ''}`.trim() || (isDefaultTitle(app.title) ? '' : app.title);
  if (!clientFolder && root) {
    const keys = [app.clientNumber, name].filter((k) => k && k.length >= 3);
    for (const key of keys) {
      const found = (await searchFolders(key)).filter((f) => !/final files|documents|working files/i.test(f.name));
      for (const f of found) {
        if (await underClients(f.id, root)) {
          clientFolder = f;
          break;
        }
      }
      if (clientFolder) break;
    }
  }
  let created = false;
  if (!clientFolder) {
    if (!root) throw new Error('DRIVE_CLIENTS_FOLDER is not set — the platform does not know where the client folders are.');
    if (!app.clientNumber && !name) throw new Error('Give this client a name or a file number first, so their Drive folder can be named.');
    // New client: "S26160 - First Last" under this year's "… FILES" folder if the team has one, else the clients root.
    const year = String(new Date().getFullYear());
    const yearFolder = (await findChildren(root, `${year} FILES`, { folder: true }))[0];
    const folderName = `${app.clientNumber ? `${app.clientNumber} - ` : ''}${name || 'New client'}`.trim();
    clientFolder = await createFolder(yearFolder?.id || root, folderName);
    await createFolder(clientFolder.id, FINAL_FOLDER);
    created = true;
  }
  const docs = await subfolder(clientFolder.id, DOCS_FOLDER);
  await updateApplication(
    app.id,
    (a) => {
      a.driveSource = { ...(a.driveSource || {}), url: `https://drive.google.com/drive/folders/${clientFolder.id}`, rootId: clientFolder.id, rootName: clientFolder.name, docsFolderId: docs.id };
      return a;
    },
    { quiet: true }
  );
  return { docsFolderId: docs.id, clientFolderId: clientFolder.id, created };
}

/** A named folder inside `parentId`, created if missing. */
async function subfolder(parentId, name) {
  const found = (await findChildren(parentId, name, { folder: true })).find((f) => f.name.trim().toLowerCase() === name.toLowerCase());
  return found || createFolder(parentId, name);
}

/* ------------------------------ reading ------------------------------ */

/**
 * Write a Drive file to `file`, streamed; "zipId:entry" is a file inside a zip
 * on Drive (the zip is read, the one entry written).
 */
export async function fetchDriveTo(driveId, file) {
  const i = String(driveId).indexOf(':');
  if (i > 0) {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await downloadFile(driveId.slice(0, i)));
    const entry = zip.file(driveId.slice(i + 1));
    if (!entry) throw new Error('The file is no longer in its zip on Google Drive.');
    await fs.writeFile(file, await entry.async('nodebuffer'));
    return;
  }
  const item = await getItem(driveId);
  await downloadToDisk(driveId, file, { exportPdf: /^application\/vnd\.google-apps\./.test(item.mimeType || '') });
}

const docPath = (appId, doc) => path.join(UPLOAD_DIR, appId, path.basename(doc.stored || ''));
const genPath = (appId, meta) => path.join(UPLOAD_DIR, appId, 'generated', path.basename(meta.stored || ''));
const exists = (p) => fs.stat(p).then(() => true, () => false);
const touch = (p) => fs.utimes(p, new Date(), new Date()).catch(() => {});
const inflight = new Map(); // path -> Promise, so two readers fetch once

async function cacheFrom(p, writeTo) {
  if (await exists(p)) {
    await touch(p);
    return p;
  }
  if (!inflight.has(p)) {
    inflight.set(
      p,
      (async () => {
        await fs.mkdir(path.dirname(p), { recursive: true });
        const tmp = `${p}.part-${process.pid}`;
        try {
          await writeTo(tmp);
          await fs.rename(tmp, p);
        } catch (e) {
          await fs.unlink(tmp).catch(() => {});
          throw e;
        }
        evictSoon();
        return p;
      })().finally(() => inflight.delete(p))
    );
  }
  return inflight.get(p);
}

/** Local path of an uploaded document — fetched from Drive when not cached. */
export async function docFile(appId, doc) {
  if (!doc?.stored) throw new Error('This document has no stored file.');
  return cacheFrom(docPath(appId, doc), async (tmp) => {
    if (!doc.driveId) throw new Error(`${doc.filename} is missing on the server and was never saved to Google Drive.`);
    await fetchDriveTo(doc.driveId, tmp);
  });
}

/** Local path of a generated file — fetched from Drive when not cached. */
export async function genFile(app, meta) {
  if (!meta?.stored) throw new Error('This file has not been generated yet.');
  return cacheFrom(genPath(app.id, meta), async (tmp) => {
    const rec = app.driveGenerated?.[meta.key];
    if (!rec?.id) throw new Error(`${meta.filename || meta.key} is missing on the server and was never saved to Google Drive — build it again.`);
    await downloadToDisk(rec.id, tmp);
  });
}

/* ------------------------------ saving to Drive ------------------------------ */

const SYNCED_MIME = new Set(['application/pdf', 'image/jpeg']);
const genFolder = (key) => (key.startsWith('final-') ? FINAL_FOLDER : WORK_FOLDER);
const genSynced = (app, g) => {
  const rec = app.driveGenerated?.[g.key];
  return Boolean(rec?.id && String(rec.syncedAt || '') >= String(g.generatedAt || ''));
};

/** What of this file still has to go to Drive. */
export function pendingFor(app) {
  const docs = (app.documents || []).filter((d) => !d.driveId && d.stored);
  const gens = (app.generated || []).filter((g) => g.stored && SYNCED_MIME.has(g.mime || 'application/pdf') && !genSynced(app, g));
  const live = new Set((app.generated || []).map((g) => g.key));
  const gone = Object.keys(app.driveGenerated || {}).filter((k) => !live.has(k));
  return { docs, gens, gone };
}

/** Copy one file's new documents and generated files to its Drive folder. */
export async function syncApp(appId) {
  if (!driveOn()) return { skipped: 'Google Drive is not connected.' };
  const app = await getApplication(appId);
  if (!app) return { skipped: 'no such file' };
  const { docs, gens, gone } = pendingFor(app);
  if (!docs.length && !gens.length && !gone.length) return { uploaded: 0 };

  const record = (patch) =>
    updateApplication(appId, (a) => {
      a.driveSync = { ...(a.driveSync || {}), ...patch, at: new Date().toISOString() };
      return a;
    }, { quiet: true });

  let folders;
  try {
    folders = await ensureClientFolder(app);
  } catch (e) {
    await record({ error: e.message });
    return { error: e.message };
  }

  let uploaded = 0;
  const errors = [];
  for (const d of docs) {
    try {
      const file = docPath(appId, d);
      await fs.access(file);
      const up = await uploadFromDisk({ parentId: folders.docsFolderId, name: d.filename, mime: d.mime, file });
      await updateApplication(appId, (a) => {
        const x = (a.documents || []).find((y) => y.id === d.id);
        if (x) Object.assign(x, { driveId: up.id, driveModified: up.modifiedTime, drivePath: `${DOCS_FOLDER}/${d.filename}` });
        return a;
      }, { quiet: true });
      uploaded++;
    } catch (e) {
      if (e.code !== 'ENOENT') errors.push(`${d.filename}: ${e.message}`);
    }
  }

  const folderIds = {};
  for (const g of gens) {
    try {
      const file = genPath(appId, g);
      await fs.access(file);
      const name = g.filename || g.stored;
      const fname = genFolder(g.key);
      folderIds[fname] = folderIds[fname] || (await subfolder(folders.clientFolderId, fname)).id;
      const prev = app.driveGenerated?.[g.key];
      let up = null;
      if (prev?.id) {
        try {
          up = await uploadFromDisk({ id: prev.id, name, mime: g.mime || 'application/pdf', file });
        } catch {
          up = null; // deleted on Drive: upload it again
        }
      }
      if (!up) up = await uploadFromDisk({ parentId: folderIds[fname], name, mime: g.mime || 'application/pdf', file });
      await updateApplication(appId, (a) => {
        a.driveGenerated = { ...(a.driveGenerated || {}), [g.key]: { id: up.id, name, folder: fname, syncedAt: g.generatedAt || new Date().toISOString() } };
        return a;
      }, { quiet: true });
      uploaded++;
    } catch (e) {
      if (e.code !== 'ENOENT') errors.push(`${g.filename || g.key}: ${e.message}`);
    }
  }

  // Final files dropped by a rebuild: move their Drive copies to the bin (recoverable).
  for (const key of gone) {
    const rec = app.driveGenerated[key];
    try {
      if (rec?.id) await trashFile(rec.id);
    } catch {
      /* already gone */
    }
    await updateApplication(appId, (a) => {
      if (a.driveGenerated) delete a.driveGenerated[key];
      return a;
    }, { quiet: true });
  }

  await record({ error: errors.length ? errors.slice(0, 3).join(' · ') : null, uploaded });
  return { uploaded, errors };
}

/* ------------------------------ background ------------------------------ */

const Q = globalThis.__driveSyncQueue || (globalThis.__driveSyncQueue = { timers: new Map(), running: new Set(), again: new Set(), started: false, evictTimer: null });

/** Save a file's pending uploads to Drive shortly (debounced, one run per file at a time). */
export function queueSync(appId, delay = 1500) {
  if (!driveOn() || !appId) return;
  clearTimeout(Q.timers.get(appId));
  Q.timers.set(appId, setTimeout(() => runSync(appId), delay));
}

async function runSync(appId) {
  Q.timers.delete(appId);
  if (Q.running.has(appId)) {
    Q.again.add(appId);
    return;
  }
  Q.running.add(appId);
  try {
    await syncApp(appId);
  } catch (e) {
    console.error(`[drive] sync ${appId} failed: ${e.message}`);
  } finally {
    Q.running.delete(appId);
    if (Q.again.delete(appId)) queueSync(appId);
    evictSoon();
  }
}

/** Every file with something not yet on Drive. */
export async function sweep() {
  if (!driveOn()) return;
  for (const a of await listAllApplications()) {
    const p = pendingFor(a);
    if (p.docs.length || p.gens.length || p.gone.length) await runSync(a.id);
  }
}

/** Start the periodic sweep and cache clean-up (called from /api/health, like the mail poller). */
export function ensureDriveSync() {
  if (Q.started) return;
  Q.started = true;
  const tick = () => sweep().then(() => evictCache()).catch((e) => console.error(`[drive] sweep failed: ${e.message}`));
  setTimeout(tick, 90000); // after start-up, so the site is serving first
  setInterval(tick, SWEEP_MS).unref?.();
}

/* ------------------------------ cache size ------------------------------ */

function evictSoon() {
  clearTimeout(Q.evictTimer);
  Q.evictTimer = setTimeout(() => evictCache().catch(() => {}), 5000);
  Q.evictTimer.unref?.();
}

async function du(dir) {
  let total = 0;
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += await du(p);
    else total += (await fs.stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/** How much of the disk the cache uses, and what is still waiting for Drive. */
export async function cacheStatus() {
  const apps = await listAllApplications();
  let pendingDocs = 0;
  let pendingGen = 0;
  const errors = [];
  for (const a of apps) {
    const p = pendingFor(a);
    pendingDocs += p.docs.length;
    pendingGen += p.gens.length;
    if (a.driveSync?.error) errors.push({ id: a.id, title: a.title, clientNumber: a.clientNumber || '', error: a.driveSync.error, at: a.driveSync.at });
  }
  return { drive: driveOn(), clientsFolder: Boolean(clientsRoot()), usedBytes: await du(UPLOAD_DIR), capBytes: CACHE_MAX(), pendingDocs, pendingGen, errors };
}

/**
 * Keep the cache under CACHE_MAX_MB: delete the least recently used cached
 * files that are safely on Drive and haven't been used for 30 minutes.
 */
export async function evictCache() {
  if (!driveOn()) return { removed: 0 };
  const cap = CACHE_MAX();
  let used = await du(UPLOAD_DIR);
  if (used <= cap) return { removed: 0, used };
  const cands = [];
  for (const a of await listAllApplications()) {
    for (const d of a.documents || []) if (d.driveId && d.stored) cands.push(docPath(a.id, d));
    for (const g of a.generated || []) if (g.stored && genSynced(a, g)) cands.push(genPath(a.id, g));
  }
  const stats = [];
  for (const p of cands) {
    const st = await fs.stat(p).catch(() => null);
    if (st && Date.now() - st.mtimeMs > IDLE_MS) stats.push({ p, size: st.size, t: st.mtimeMs });
  }
  stats.sort((x, y) => x.t - y.t);
  let removed = 0;
  for (const s of stats) {
    if (used <= cap * 0.8) break;
    await fs.unlink(s.p).catch(() => {});
    used -= s.size;
    removed++;
  }
  return { removed, used };
}
