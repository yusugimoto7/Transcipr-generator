import fs from 'fs';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { SignJWT, importPKCS8 } from 'jose';

/**
 * Minimal Google Drive v3 client (REST, no SDK) for importing a client's
 * document folder.
 *
 * Auth, in order of preference:
 *   GOOGLE_SERVICE_ACCOUNT_JSON  a service-account key (the JSON file's
 *                                contents, or that JSON base64-encoded).
 *                                Share the firm's client folder with the
 *                                service account's email once and every
 *                                client subfolder becomes importable — the
 *                                folders stay private.
 *   GOOGLE_API_KEY               only reads folders shared as "Anyone with
 *                                the link"; not recommended for client data.
 *
 * The server never fetches the URL the user pasted: it extracts the Drive ID
 * and only ever calls the Google API base, so a pasted link can't make the
 * server request an arbitrary host.
 */

const API = process.env.GOOGLE_DRIVE_API_BASE || 'https://www.googleapis.com/drive/v3';
const TOKEN_URL = process.env.GOOGLE_OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token';
// Full Drive access: the platform also files documents that clients email in
// (lib/mailIntake.js). Writes only succeed in folders shared with the service
// account as Editor; folders shared as Viewer stay read-only.
const SCOPE = 'https://www.googleapis.com/auth/drive';
const UPLOAD_API = API.replace('/drive/v3', '/upload/drive/v3');
const ALL_DRIVES = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
const FIELDS = 'id,name,mimeType,size,modifiedTime,shortcutDetails(targetId,targetMimeType)';

export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';

/* ------------------------------ links ------------------------------ */

const ID = '([A-Za-z0-9_-]{10,})';

/** Pull the Drive item ID out of any common Drive / Docs link, or a bare ID. */
export function parseDriveLink(input) {
  const s = String(input || '').trim();
  const patterns = [
    [new RegExp(`/folders/${ID}`), 'folder'],
    [new RegExp(`/file/d/${ID}`), 'file'],
    [new RegExp(`/(?:document|spreadsheets|presentation)/d/${ID}`), 'file'],
    [new RegExp(`[?&]id=${ID}`), 'unknown'],
  ];
  for (const [re, kind] of patterns) {
    const m = s.match(re);
    if (m) return { id: m[1], kind };
  }
  if (new RegExp(`^${ID}$`).test(s)) return { id: s, kind: 'unknown' };
  return null;
}

/* ------------------------------ auth ------------------------------ */

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const tryParse = (t) => {
    try {
      const j = JSON.parse(t);
      return j && j.client_email && j.private_key ? j : null;
    } catch {
      return null;
    }
  };
  return tryParse(raw) || tryParse(Buffer.from(raw, 'base64').toString('utf8'));
}

/** What the server can do, for the UI: { mode, email? } */
export function driveStatus() {
  const sa = serviceAccount();
  if (sa) return { mode: 'service-account', email: sa.client_email };
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return { mode: 'invalid', error: 'GOOGLE_SERVICE_ACCOUNT_JSON is set but is not a valid service-account key.' };
  if (process.env.GOOGLE_API_KEY) return { mode: 'api-key' };
  return { mode: 'none' };
}

let cached = { token: null, exp: 0 };

async function accessToken() {
  const sa = serviceAccount();
  if (!sa) return null;
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new DriveError(`Google sign-in failed: ${data.error_description || data.error || res.status}`, 502);
  }
  cached = { token: data.access_token, exp: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cached.token;
}

export class DriveError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function call(pathAndQuery, { raw = false, method = 'GET', body = null, headers: extraHeaders = {}, base = API } = {}) {
  const status = driveStatus();
  if (status.mode === 'none') {
    throw new DriveError('Google Drive is not connected. An admin must set GOOGLE_SERVICE_ACCOUNT_JSON on the server.', 503);
  }
  if (status.mode === 'invalid') throw new DriveError(status.error, 503);

  const headers = { ...extraHeaders };
  let url = `${base}${pathAndQuery}`;
  const token = await accessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  else url += `${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(process.env.GOOGLE_API_KEY)}`;

  const res = await fetch(url, { method, headers, body });
  if (res.status === 404 || res.status === 403) {
    const who = status.email ? `the service account (${status.email})` : 'this server';
    if (method !== 'GET') {
      // 404: the account cannot see the folder at all; 403: it can see it but not write.
      throw new DriveError(
        res.status === 404
          ? `Drive can't find the folder for ${who} (404): it has no access there. If the client folders are in a shared drive, add that address as a member of the shared drive with the Content manager role; otherwise share the folder with it as Editor.`
          : `Drive refused to write there (403). Give ${who} write access: Content manager on the shared drive, or Editor on the folder (not Viewer).`,
        403
      );
    }
    throw new DriveError(`Drive item not found or not shared with ${who}. Add that address to the shared drive (or share the folder with it) and try again.`, 404);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new DriveError(`Google Drive error ${res.status}: ${t.slice(0, 200)}`, 502);
  }
  return raw ? Buffer.from(await res.arrayBuffer()) : res.json();
}

/* ------------------------------ reads ------------------------------ */

export async function getItem(id) {
  return call(`/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(FIELDS)}&supportsAllDrives=true`);
}

export async function listChildren(folderId) {
  const out = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const data = await call(
      `/files?q=${q}&fields=${encodeURIComponent(`nextPageToken,files(${FIELDS})`)}&pageSize=1000&${ALL_DRIVES}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
    );
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return out;
}

/** Raw bytes of a binary file. */
export async function downloadFile(id) {
  return call(`/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { raw: true });
}

/** A Google Docs / Sheets / Slides file exported to another format (PDF). */
export async function exportFile(id, mimeType = 'application/pdf') {
  return call(`/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(mimeType)}`, { raw: true });
}

/* ------------------------------ writes ------------------------------ */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Files in a folder whose name contains `text` (case-insensitive on Drive's side). */
export async function findChildren(parentId, text, { folder = false } = {}) {
  const q = [`'${parentId}' in parents`, 'trashed = false', `name contains '${String(text).replace(/'/g, "\\'")}'`];
  if (folder) q.push(`mimeType = '${FOLDER_MIME}'`);
  const data = await call(`/files?q=${encodeURIComponent(q.join(' and '))}&fields=${encodeURIComponent(`files(${FIELDS})`)}&pageSize=50&${ALL_DRIVES}`);
  return data.files || [];
}

/** Folders anywhere the service account can see whose name contains `text`. */
export async function searchFolders(text) {
  const q = [`mimeType = '${FOLDER_MIME}'`, 'trashed = false', `name contains '${String(text).replace(/'/g, "\\'")}'`];
  const data = await call(`/files?q=${encodeURIComponent(q.join(' and '))}&fields=${encodeURIComponent(`files(${FIELDS},parents)`)}&pageSize=50&${ALL_DRIVES}`);
  return data.files || [];
}

export async function getParents(id) {
  const data = await call(`/files/${encodeURIComponent(id)}?fields=id,name,parents&supportsAllDrives=true`);
  return data.parents || [];
}

export async function createFolder(parentId, name) {
  return call(`/files?supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
}

/** Upload a file into a folder (multipart, one request). Returns its metadata. */
export async function uploadFile(parentId, name, mime, buffer) {
  const boundary = `sugimoto-${Date.now().toString(36)}`;
  const meta = Buffer.from(JSON.stringify({ name, parents: [parentId] }));
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    meta,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return call(`/files?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    base: UPLOAD_API,
  });
}

/** Replace a file's content (and name) in place — same file id, Drive keeps the old version. */
export async function updateFile(id, name, mime, buffer) {
  const boundary = `sugimoto-${Date.now().toString(36)}`;
  const meta = Buffer.from(JSON.stringify({ name }));
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    meta,
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  return call(`/files/${encodeURIComponent(id)}?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
    base: UPLOAD_API,
  });
}

/** Rename a Drive file (metadata only). */
export async function renameFile(id, name) {
  return call(`/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

/** Move a file to Drive's bin (recoverable for 30 days). */
export async function trashFile(id) {
  return call(`/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ trashed: true }),
  });
}

/* ------------------------- streaming (large files) ------------------------- */
// Final files can be hundreds of MB; holding one in memory (twice, for a
// multipart body) would exceed a small server's RAM. These stream from and to
// disk: memory use stays flat whatever the file size.

async function authorized(url, init = {}) {
  const status = driveStatus();
  if (status.mode === 'none') throw new DriveError('Google Drive is not connected. An admin must set GOOGLE_SERVICE_ACCOUNT_JSON on the server.', 503);
  if (status.mode === 'invalid') throw new DriveError(status.error, 503);
  const token = await accessToken();
  if (!token) throw new DriveError('Writing to Drive needs a service account (GOOGLE_SERVICE_ACCOUNT_JSON).', 503);
  return fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
}

async function failed(res, what) {
  const t = await res.text().catch(() => '');
  const who = driveStatus().email ? ` Share the client folders with ${driveStatus().email} as Editor.` : '';
  if (res.status === 403 || res.status === 404) return new DriveError(`Drive refused to ${what} (${res.status}).${who}`, res.status);
  return new DriveError(`Google Drive error ${res.status} while trying to ${what}: ${t.slice(0, 200)}`, 502);
}

/**
 * PUT a file from disk with Node's http(s) streams, which respect back-pressure:
 * at most a few chunks are in memory at once. (fetch/undici held a whole
 * 300 MB request body in memory in testing.)
 */
async function putFile(url, headers, file) {
  const { request } = await (url.startsWith('https:') ? import('https') : import('http'));
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'PUT', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    pipeline(fs.createReadStream(file, { highWaterMark: 1024 * 1024 }), req).catch(reject);
  });
}

/**
 * Upload a file from disk, streamed (Drive's resumable upload). With `id` the
 * existing Drive file's content and name are replaced in place; otherwise a
 * new file is created in `parentId`.
 */
export async function uploadFromDisk({ parentId, id, name, mime, file }) {
  const size = (await fs.promises.stat(file)).size;
  const init = await authorized(
    `${UPLOAD_API}/files${id ? `/${encodeURIComponent(id)}` : ''}?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`,
    {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) },
      body: JSON.stringify(id ? { name } : { name, parents: [parentId] }),
    }
  );
  if (!init.ok) throw await failed(init, id ? 'replace a file' : 'save a file');
  const session = init.headers.get('location');
  if (!session) throw new DriveError('Drive did not start the upload.', 502);
  const res = await putFile(session, { 'Content-Type': mime, 'Content-Length': String(size) }, file);
  if (!res.ok) {
    throw res.status === 403 || res.status === 404
      ? new DriveError(`Drive refused to upload a file (${res.status}).`, res.status)
      : new DriveError(`Google Drive error ${res.status} while uploading: ${res.text.slice(0, 200)}`, 502);
  }
  return JSON.parse(res.text);
}

/** Download a Drive file (or export a Google Doc as PDF) straight to disk. */
export async function downloadToDisk(id, file, { exportPdf = false } = {}) {
  const url = exportPdf
    ? `${API}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent('application/pdf')}`
    : `${API}/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`;
  const res = await authorized(url);
  if (!res.ok || !res.body) throw await failed(res, 'read a file');
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
}
