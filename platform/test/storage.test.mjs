// End-to-end test of Drive as the file store: uploads and built files are
// copied to the client's Drive folder, the server cache is trimmed, and a file
// that left the cache is fetched back from Drive when it is opened.
//   npm run build && node test/storage.test.mjs
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { jwtVerify, importSPKI } from 'jose';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PORT = 3395;
const GOOGLE = 3396;
const BASE = `http://127.0.0.1:${PORT}`;
const SA_EMAIL = 'platform@firm-project.iam.gserviceaccount.com';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pdf = async (label) => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([595, 842]).drawText(label, { x: 60, y: 700, size: 28, font });
  return Buffer.from(await d.save());
};

/* ------------------------------ stub Google Drive ------------------------------ */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const spki = await importSPKI(publicKey, 'RS256');
const TOKEN = 'stub-token';
const FOLDER = 'application/vnd.google-apps.folder';
const tree = {
  clientsRoot01: { name: 'Clients', mimeType: FOLDER, parents: [] },
  yearFolder001: { name: '0005 - 2026 FILES', mimeType: FOLDER, parents: ['clientsRoot01'] },
};
const log = { uploads: [], updates: [], trashed: [], downloads: 0 };
const sessions = {}; // resumable upload sessions
let nextId = 1;
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const meta = (id) => ({ id, name: tree[id].name, mimeType: tree[id].mimeType, modifiedTime: '2026-09-27T10:00:00.000Z', parents: tree[id].parents, size: String(tree[id].bytes?.length || 0) });
/** { json, mime, bytes } from a multipart/related upload. */
function multipart(req, body) {
  const boundary = req.headers['content-type'].match(/boundary=([^;]+)/)[1];
  const parts = body.toString('latin1').split(`--${boundary}`).slice(1, -1);
  const [h1, ...j] = parts[0].split('\r\n\r\n');
  const json = JSON.parse(Buffer.from(j.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1').toString('utf8'));
  const [h2, ...b] = parts[1].split('\r\n\r\n');
  void h1;
  return { json, mime: h2.match(/Content-Type: ([^\r\n]+)/)[1], bytes: Buffer.from(b.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1') };
}
const google = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${GOOGLE}`);
  let body = Buffer.alloc(0);
  let chunks = 0;
  for await (const c of req) { body = Buffer.concat([body, c]); chunks++; }
  if (req.method === 'POST' && u.pathname === '/token') {
    const form = new URLSearchParams(body.toString());
    try {
      await jwtVerify(form.get('assertion'), spki, { issuer: SA_EMAIL, audience: `http://127.0.0.1:${GOOGLE}/token` });
      return send(res, 200, { access_token: TOKEN, expires_in: 3600 });
    } catch (e) {
      return send(res, 400, { error: 'invalid_grant', error_description: e.message });
    }
  }
  // Resumable upload, step 2: the session URL takes the bytes (no auth header, as with Google).
  const sess = u.pathname.match(/^\/upload\/session\/(\w+)$/);
  if (req.method === 'PUT' && sess && sessions[sess[1]]) {
    const { id, json, mime } = sessions[sess[1]];
    delete sessions[sess[1]];
    log.maxChunk = Math.max(log.maxChunk || 0, chunks);
    if (id) {
      Object.assign(tree[id], { name: json.name, bytes: body });
      log.updates.push({ id, name: json.name });
      return send(res, 200, meta(id));
    }
    const nid = `up${String(nextId++).padStart(8, '0')}`;
    tree[nid] = { name: json.name, mimeType: mime, parents: json.parents, bytes: body };
    log.uploads.push({ id: nid, parent: json.parents[0], name: json.name });
    return send(res, 200, meta(nid));
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'unauthenticated' });
  // Resumable upload, step 1: metadata, answered with the session URL.
  if (u.searchParams.get('uploadType') === 'resumable') {
    const um = u.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/);
    if (!um) return send(res, 404, { error: 'notFound' });
    const id = um[1] ? decodeURIComponent(um[1]) : null;
    if (id && !tree[id]) return send(res, 404, { error: 'notFound' });
    const sid = crypto.randomBytes(6).toString('hex');
    sessions[sid] = { id, json: JSON.parse(body.toString() || '{}'), mime: req.headers['x-upload-content-type'] };
    res.writeHead(200, { Location: `http://127.0.0.1:${GOOGLE}/upload/session/${sid}` });
    return res.end();
  }
  if (req.method === 'POST' && u.pathname === '/upload/drive/v3/files') {
    const { json, mime, bytes } = multipart(req, body);
    const id = `up${String(nextId++).padStart(8, '0')}`;
    tree[id] = { name: json.name, mimeType: mime, parents: json.parents, bytes };
    log.uploads.push({ id, parent: json.parents[0], name: json.name });
    return send(res, 200, meta(id));
  }
  const up = u.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
  if (req.method === 'PATCH' && up) {
    const id = decodeURIComponent(up[1]);
    if (!tree[id]) return send(res, 404, { error: 'notFound' });
    const { json, bytes } = multipart(req, body);
    Object.assign(tree[id], { name: json.name, bytes });
    log.updates.push({ id, name: json.name });
    return send(res, 200, meta(id));
  }
  if (req.method === 'POST' && u.pathname === '/drive/v3/files') {
    const j = JSON.parse(body.toString());
    const id = `f${String(nextId++).padStart(9, '0')}`;
    tree[id] = { name: j.name, mimeType: j.mimeType, parents: j.parents };
    return send(res, 200, meta(id));
  }
  if (u.pathname === '/drive/v3/files') {
    const q = u.searchParams.get('q') || '';
    const parent = q.match(/'([^']+)' in parents/)?.[1];
    const contains = q.match(/name contains '([^']*)'/)?.[1];
    const folderOnly = /mimeType = 'application\/vnd\.google-apps\.folder'/.test(q);
    const files = Object.keys(tree)
      .filter((id) => !tree[id].trashed && (!parent || tree[id].parents.includes(parent)) && (!contains || tree[id].name.toLowerCase().includes(contains.toLowerCase())) && (!folderOnly || tree[id].mimeType === FOLDER))
      .map(meta);
    return send(res, 200, { files });
  }
  const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  const id = m && decodeURIComponent(m[1]);
  if (id && tree[id]) {
    if (req.method === 'PATCH') {
      const j = JSON.parse(body.toString() || '{}');
      if (j.trashed) { tree[id].trashed = true; log.trashed.push(id); }
      return send(res, 200, { id });
    }
    if (u.searchParams.get('alt') === 'media') {
      log.downloads++;
      res.writeHead(200, { 'Content-Type': tree[id].mimeType });
      return res.end(tree[id].bytes || Buffer.alloc(0));
    }
    return send(res, 200, meta(id));
  }
  return send(res, 404, { error: 'notFound' });
});
await new Promise((r) => google.listen(GOOGLE, r));

/* --------------------------------- server --------------------------------- */
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-data-'));
const uploadDir = path.join(dataDir, 'up');
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env, AUTH_SECRET: 'storage-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: uploadDir, ADMIN_EMAIL: 'boss@firm.test',
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: SA_EMAIL, private_key: privateKey }),
    GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${GOOGLE}/drive/v3`, GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${GOOGLE}/token`,
    DRIVE_CLIENTS_FOLDER: 'https://drive.google.com/drive/folders/clientsRoot01',
    CACHE_MAX_MB: '0', CACHE_IDLE_MINUTES: '0', DRIVE_SYNC_MINUTES: '60',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));
const stop = () => { try { process.kill(-server.pid); } catch {} google.close(); };

let cookie = '';
async function call(method, url, body, raw = false) {
  const isForm = body instanceof FormData;
  const r = await fetch(BASE + url, { method, headers: { ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }), cookie }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const set = r.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  if (raw) return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) };
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
const getApp = async (id) => (await call('GET', `/api/applications/${id}`)).json.application;
async function until(fn, what, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${what}\n${logs.slice(-2000)}`);
}

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await sleep(500); }
  await call('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  const app = (await call('POST', '/api/applications', { type: 'owp-worker-spouse', title: 'Test Person', clientNumber: 'S26990' })).json.application;

  // 1. An upload is copied to the client's Drive folder (created for a new client).
  const passport = await pdf('PASSPORT');
  const fd = new FormData();
  fd.append('files', new Blob([passport], { type: 'application/pdf' }), '103 - Passport - Test.pdf');
  ok((await call('POST', `/api/applications/${app.id}/upload`, fd)).status === 201, 'a document uploads');
  const doc = await until(async () => (await getApp(app.id)).documents.find((d) => d.driveId), 'the upload to reach Drive');
  const folder = Object.entries(tree).find(([, v]) => v.name === 'S26990 - Test Person');
  ok(Boolean(folder) && folder[1].parents[0] === 'yearFolder001', "a client folder \"S26990 - Test Person\" is created under this year's FILES folder");
  const docsFolder = Object.entries(tree).find(([, v]) => v.name === '01 - Documents' && v.parents[0] === folder?.[0]);
  ok(log.uploads.some((u) => u.parent === docsFolder?.[0] && u.name === '103 - Passport - Test.pdf'), 'the file lands in 01 - Documents with its name');
  ok(tree[doc.driveId].bytes.equals(passport), 'Drive holds the exact bytes');

  // 2. The cache is trimmed: the local copy goes once it is safely on Drive.
  const local = path.join(uploadDir, app.id, doc.stored);
  const st = (await call('POST', '/api/admin/storage')).json;
  ok(st.evicted?.removed >= 1 && !(await fs.stat(local).catch(() => null)), 'the cache removes the local copy of a file that is on Drive');
  ok(st.pendingDocs === 0 && st.drive === true, 'the storage status shows nothing waiting for Drive');

  // 3. Opening it fetches it back from Drive.
  const before = log.downloads;
  const view = await call('GET', `/api/applications/${app.id}/upload?docId=${doc.id}`, null, true);
  ok(view.status === 200 && view.bytes.equals(passport) && log.downloads === before + 1, 'opening the document fetches it back from Drive');
  ok(Boolean(await fs.stat(local).catch(() => null)), 'and caches it again');
  const pages = await call('GET', `/api/applications/${app.id}/preview?docId=${doc.id}&info=1`);
  ok(pages.json.pages === 1, 'the preview works from the fetched copy');

  // 3b. A large file streams to Drive in pieces and comes back intact.
  const big = Buffer.concat([passport, crypto.randomBytes(6 * 1024 * 1024)]);
  const fd2 = new FormData();
  fd2.append('files', new Blob([big], { type: 'application/pdf' }), '112 - Bank Statement - Test.pdf');
  await call('POST', `/api/applications/${app.id}/upload`, fd2);
  const bigDoc = await until(async () => (await getApp(app.id)).documents.find((d) => d.filename.startsWith('112') && d.driveId), 'the large file to reach Drive');
  ok(tree[bigDoc.driveId].bytes.equals(big) && log.maxChunk > 1, 'a large file is streamed to Drive in pieces, byte for byte');
  await call('POST', '/api/admin/storage');
  const bigBack = await call('GET', `/api/applications/${app.id}/upload?docId=${bigDoc.id}`, null, true);
  ok(bigBack.bytes.equals(big), 'and streamed back intact');

  // 4. Built files go to 91 - Generated Files, each new version a new file numbered after the last one.
  ok((await call('POST', `/api/applications/${app.id}/sop`, { answers: {}, editedText: 'Dear Officer, first draft.' })).status === 200, 'a letter is saved');
  const rec = await until(async () => (await getApp(app.id)).driveGenerated?.sop, 'the letter to reach Drive');
  const gen = Object.entries(tree).find(([, v]) => v.name === '91 - Generated Files' && v.parents[0] === folder?.[0]);
  ok(Boolean(gen) && tree[rec.id].parents[0] === gen[0], 'the letter is saved in 91 - Generated Files');
  ok(/ - 001\.pdf$/.test(tree[rec.id].name), `and numbered 001 (${tree[rec.id].name})`);
  await sleep(50);
  await call('POST', `/api/applications/${app.id}/sop`, { answers: {}, editedText: 'Dear Officer, second draft, longer than the first one.' });
  const rec2 = await until(async () => { const r = (await getApp(app.id)).driveGenerated?.sop; return r && r.id !== rec.id ? r : null; }, 'the new version to reach Drive');
  ok(/ - 002\.pdf$/.test(tree[rec2.id].name) && tree[rec2.id].parents[0] === gen[0], `the new version is a new file, numbered 002 (${tree[rec2.id].name})`);
  ok(Boolean(tree[rec.id]) && !tree[rec.id].trashed, 'and the first version stays');
  ok(!Object.values(tree).some((v) => v.name === '03 - Working Files'), 'nothing goes to 03 - Working Files any more');

  // 5. A built file that left the cache downloads from Drive.
  await until(async () => { const a = await getApp(app.id); return a.driveGenerated?.sop?.syncedAt >= (a.generated.find((g) => g.key === 'sop')?.generatedAt || ''); }, 'the second version to be recorded');
  await call('POST', '/api/admin/storage');
  const dl = await call('GET', `/api/applications/${app.id}/download/sop`, null, true);
  ok(dl.status === 200 && dl.bytes.equals(tree[rec2.id].bytes), 'downloading the letter serves the latest version from Drive');
} catch (e) {
  failures++;
  console.log('FAIL ', e.message);
  try { console.log('storage status:', JSON.stringify((await call('GET', '/api/admin/storage')).json)); } catch {}
} finally {
  stop();
}
console.log(failures ? `\n${failures} failure(s)` : '\nALL STORAGE CHECKS PASS');
process.exit(failures ? 1 : 0);
