// End-to-end test of "Import from Google Drive" against a built server and a
// stub Google (OAuth token endpoint + Drive v3). The stub verifies the
// service-account JWT with the public half of a key generated here, and
// rejects any Drive call without the token it issued.
//   npm run build && node test/drive.test.mjs
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { jwtVerify, importSPKI } from 'jose';
import JSZip from 'jszip';

const PORT = 3321;
const GOOGLE = 3322;
const BASE = `http://127.0.0.1:${PORT}`;
const SA_EMAIL = 'platform-importer@firm-project.iam.gserviceaccount.com';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

/* ----------------------------- stub Google ----------------------------- */

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const spki = await importSPKI(publicKey, 'RS256');
const TOKEN = 'stub-access-token';
const stats = { tokens: 0, badAuth: 0, downloads: new Map(), exports: 0 };

const FOLDER = 'application/vnd.google-apps.folder';
const zip = new JSZip();
zip.file('110 - IELTS.pdf', '%PDF-1.4 ielts');
zip.file('notes.txt', 'hello');
zip.file('__MACOSX/._110 - IELTS.pdf', 'junk');
const zipBytes = await zip.generateAsync({ type: 'nodebuffer' });

const T1 = '2026-09-01T10:00:00.000Z';
// id → { meta, bytes?, children? }
const tree = {
  rootFolder0001: { meta: { name: 'S26300 - Test Client', mimeType: FOLDER }, children: ['filePass0001', 'fileBank0001', 'fileHeic0001', 'fileRar00001', 'fileHuge0001', 'gdocProf0001', 'folderSp0001', 'folderBk0001', 'shortLoa0001', 'fileZip00001'] },
  filePass0001: { meta: { name: '103 - Passport.pdf', mimeType: 'application/pdf' }, bytes: Buffer.from('%PDF-1.4 passport') },
  fileBank0001: { meta: { name: '112 - Bank statement.jpg', mimeType: 'image/jpeg' }, bytes: Buffer.from('jpegbytes') },
  fileHeic0001: { meta: { name: '104 - Photo.HEIC', mimeType: 'image/heic' }, bytes: Buffer.from('heic') },
  fileRar00001: { meta: { name: 'Everything.rar', mimeType: 'application/x-rar-compressed' }, bytes: Buffer.from('rar') },
  fileHuge0001: { meta: { name: '120 - Deed scan.pdf', mimeType: 'application/pdf', size: String(30 * 1024 * 1024) }, bytes: Buffer.from('never') },
  gdocProf0001: { meta: { name: '124 - Personal profile', mimeType: 'application/vnd.google-apps.document' }, exportBytes: Buffer.from('%PDF-1.4 exported') },
  folderSp0001: { meta: { name: 'Spouse', mimeType: FOLDER }, children: ['fileSpId0001'] },
  fileSpId0001: { meta: { name: '133 - Spouse ID.png', mimeType: 'image/png' }, bytes: Buffer.from('png') },
  folderBk0001: { meta: { name: 'bk', mimeType: FOLDER }, children: ['fileOld00001'] },
  fileOld00001: { meta: { name: '103 - Old passport.pdf', mimeType: 'application/pdf' }, bytes: Buffer.from('%PDF old') },
  shortLoa0001: { meta: { name: 'Shortcut to LOA', mimeType: 'application/vnd.google-apps.shortcut', shortcutDetails: { targetId: 'fileLoa00001', targetMimeType: 'application/pdf' } } },
  fileLoa00001: { meta: { name: '107 - LOA.pdf', mimeType: 'application/pdf' }, bytes: Buffer.from('%PDF-1.4 loa') },
  fileZip00001: { meta: { name: 'More docs.zip', mimeType: 'application/zip' }, bytes: zipBytes },
};
for (const [id, n] of Object.entries(tree)) {
  n.meta.id = id;
  n.meta.modifiedTime ||= T1;
  if (n.bytes && !n.meta.size) n.meta.size = String(n.bytes.length);
}

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

const google = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${GOOGLE}`);
  if (req.method === 'POST' && u.pathname === '/token') {
    let b = ''; for await (const c of req) b += c;
    const form = new URLSearchParams(b);
    try {
      const { payload } = await jwtVerify(form.get('assertion'), spki, { issuer: SA_EMAIL, audience: `http://127.0.0.1:${GOOGLE}/token` });
      if (form.get('grant_type') !== 'urn:ietf:params:oauth:grant-type:jwt-bearer' || !/drive\.readonly/.test(payload.scope)) throw new Error('bad grant');
      stats.tokens++;
      return send(res, 200, { access_token: TOKEN, expires_in: 3600, token_type: 'Bearer' });
    } catch (e) {
      return send(res, 400, { error: 'invalid_grant', error_description: e.message });
    }
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) { stats.badAuth++; return send(res, 401, { error: 'unauthenticated' }); }

  // GET /drive/v3/files?q='<id>' in parents ...  (paged: 4 per page)
  if (u.pathname === '/drive/v3/files') {
    const parent = (u.searchParams.get('q') || '').match(/'([^']+)' in parents/)?.[1];
    const node = tree[parent];
    if (!node?.children) return send(res, 404, { error: 'notFound' });
    const start = Number(u.searchParams.get('pageToken') || 0);
    const page = node.children.slice(start, start + 4).map((id) => tree[id].meta);
    const next = start + 4 < node.children.length ? String(start + 4) : undefined;
    return send(res, 200, { files: page, ...(next ? { nextPageToken: next } : {}) });
  }
  const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)(\/export)?$/);
  const node = m && tree[decodeURIComponent(m[1])];
  if (!node) return send(res, 404, { error: 'notFound' });
  if (m[2]) {
    stats.exports++;
    return send(res, 200, node.exportBytes, 'application/pdf');
  }
  if (u.searchParams.get('alt') === 'media') {
    stats.downloads.set(node.meta.id, (stats.downloads.get(node.meta.id) || 0) + 1);
    await new Promise((r) => setTimeout(r, 200)); // slow enough to watch progress
    return send(res, 200, node.bytes, 'application/octet-stream');
  }
  return send(res, 200, node.meta);
});
await new Promise((r) => google.listen(GOOGLE, r));

/* ------------------------------- server ------------------------------- */

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'drive-data-'));
const saJson = JSON.stringify({ type: 'service_account', client_email: SA_EMAIL, private_key: privateKey });
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env,
    AUTH_SECRET: 'drive-secret-value-at-least-32-chars',
    DATA_DIR: dataDir,
    UPLOAD_DIR: path.join(dataDir, 'up'),
    OPENAI_API_KEY: 'unused',
    ADMIN_EMAIL: 'boss@firm.test',
    GOOGLE_SERVICE_ACCOUNT_JSON: Buffer.from(saJson).toString('base64'), // base64 form is accepted too
    GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${GOOGLE}/drive/v3`,
    GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${GOOGLE}/token`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));

const waitUp = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start\n' + logs); };

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data };
  };
}

// Start an import and poll it to the end, keeping every progress snapshot.
async function importAndWait(as, appId, body) {
  const t0 = Date.now();
  const start = await as('POST', `/api/applications/${appId}/drive-import`, body);
  const startMs = Date.now() - t0;
  if (start.status !== 202) return { ...start, startMs, snapshots: [] };
  const snapshots = [start.data.job];
  for (let i = 0; i < 400; i++) {
    await new Promise((res) => setTimeout(res, 50));
    const r = await as('GET', `/api/applications/${appId}/drive-import`);
    snapshots.push(r.data.job);
    if (r.data.job?.status === 'done') return { status: 200, data: r.data.job.result, startMs, snapshots };
    if (r.data.job?.status === 'failed') return { status: 500, data: { error: r.data.job.error }, startMs, snapshots };
  }
  throw new Error('import never finished');
}

try {
  await waitUp();
  const admin = client(), applicant = client();
  await admin('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  await applicant('POST', '/api/auth/register', { email: 'client@mail.test', password: 'password123', name: 'Client' });

  // Applicants can never drive the service account, even on their own file.
  let r = await applicant('POST', '/api/applications', { type: 'study-permit', title: 'Mine' });
  const ownId = r.data.application.id;
  r = await applicant('POST', `/api/applications/${ownId}/drive-import`, { url: 'https://drive.google.com/drive/folders/rootFolder0001' });
  ok(r.status === 403, 'applicant is refused Drive import on their own file');
  r = await applicant('GET', `/api/applications/${ownId}/drive-import`);
  ok(r.status === 403, 'applicant cannot see the service-account email');

  r = await admin('POST', '/api/applications', { type: 'study-permit', title: 'S26300', clientNumber: 'S26300' });
  const appId = r.data.application.id;

  r = await admin('GET', `/api/applications/${appId}/drive-import`);
  ok(r.status === 200 && r.data.drive.mode === 'service-account' && r.data.drive.email === SA_EMAIL, 'status shows the service-account email to share with');

  r = await admin('POST', `/api/applications/${appId}/drive-import`, { url: 'not a link' });
  ok(r.status === 400, 'rejects text that is not a Drive link');
  r = await admin('POST', `/api/applications/${appId}/drive-import`, { url: 'https://drive.google.com/drive/folders/notSharedFolder01' });
  ok(r.status === 404 && r.data.error.includes(SA_EMAIL), 'unshared folder explains which address to share with');

  // --- first import ---------------------------------------------------------
  r = await importAndWait(admin, appId, { url: 'https://drive.google.com/drive/folders/rootFolder0001?usp=sharing' });
  ok(r.status === 200, `import succeeds (${r.status} ${r.data?.error || ''})`);
  ok(r.startMs < 2000, `the Import button returns at once and the download runs in the background (${r.startMs} ms)`);
  const dl = r.snapshots.filter((j) => j?.phase === 'downloading' && j.status === 'running');
  ok(dl.length > 1 && dl.every((j) => j.total === 9), `progress reports the file total while downloading (${dl.length} updates)`);
  ok(dl.some((j) => j.done > 0 && j.done < j.total && j.bytesDone > 0 && j.totalBytes > j.bytesDone), 'progress moves through files and megabytes');
  ok(dl.some((j) => typeof j.current === 'string' && j.current.length), 'progress names the file being downloaded');
  ok(r.snapshots.at(-1).done === r.snapshots.at(-1).total, 'progress ends at 100%');
  const docs = r.data.documents || [];
  const byName = Object.fromEntries(docs.map((d) => [d.filename, d]));
  const names = Object.keys(byName).sort();
  ok(names.join('|') === ['103 - Passport.pdf', '107 - LOA.pdf', '110 - IELTS.pdf', '112 - Bank statement.jpg', '124 - Personal profile.pdf', '133 - Spouse ID.png'].join('|'), `imports exactly the usable files (${names.join(', ')})`);
  ok(stats.tokens >= 1 && stats.badAuth === 0, 'signs in with a verified service-account JWT; every Drive call carries the token');
  ok(byName['124 - Personal profile.pdf']?.mime === 'application/pdf' && stats.exports === 1, 'Google Doc is exported to PDF');
  ok(byName['107 - LOA.pdf']?.driveId === 'fileLoa00001', 'shortcut resolves to its target file');
  ok(byName['133 - Spouse ID.png']?.drivePath === 'Spouse/133 - Spouse ID.png', 'subfolders are followed and the path kept');
  ok(byName['110 - IELTS.pdf']?.drivePath === 'More docs.zip/110 - IELTS.pdf', 'zip archive is unpacked');
  ok(byName['103 - Passport.pdf']?.category === 'passport' && byName['107 - LOA.pdf']?.category === 'loa' && byName['110 - IELTS.pdf']?.category === 'language', 'files are classified by their checklist code');
  ok(r.data.source?.rootName === 'S26300 - Test Client' && r.data.source.url.includes('rootFolder0001'), 'the link is remembered on the file for "Sync again"');

  const skipped = Object.fromEntries((r.data.skipped || []).map((s) => [s.name, s.reason]));
  ok(/backup/.test(skipped['bk/'] || ''), 'backup folder "bk" is skipped');
  ok(!stats.downloads.has('fileOld00001'), 'nothing inside the backup folder is downloaded');
  ok(/HEIC/.test(skipped['104 - Photo.HEIC'] || ''), 'HEIC photo skipped with a how-to-fix reason');
  ok(/RAR/.test(skipped['Everything.rar'] || ''), 'RAR archive skipped with a how-to-fix reason');
  ok(/too large/.test(skipped['120 - Deed scan.pdf'] || '') && !stats.downloads.has('fileHuge0001'), 'oversized file skipped before downloading');
  ok(/unsupported/.test(skipped['More docs.zip/notes.txt'] || '') && !Object.keys(skipped).some((k) => k.includes('__MACOSX')), 'zip junk ignored; unsupported entries reported');

  const stored = await fs.readdir(path.join(dataDir, 'up', appId));
  ok(stored.length === 6, 'six files written to storage');

  // --- sync again: nothing changed -> nothing downloaded -------------------
  const before = stats.downloads.get('filePass0001');
  r = await importAndWait(admin, appId, {});
  ok(r.status === 200 && r.data.added.length === 0 && r.data.updated.length === 0 && r.data.unchanged === 6, `sync again with no changes re-downloads nothing (unchanged=${r.data?.unchanged})`);
  ok(stats.downloads.get('filePass0001') === before && stats.downloads.get('fileZip00001') === 1, 'unchanged files and zips are not fetched again');

  // --- a file changes in Drive: it replaces the old copy, keeps a manual category
  const passDoc = r.data.documents.find((d) => d.driveId === 'filePass0001');
  r = await admin('PATCH', `/api/applications/${appId}/upload`, { docId: passDoc.id, category: 'national-id' });
  ok(r.status === 200, 'staff re-categorise an imported file');
  tree.filePass0001.meta.modifiedTime = '2026-09-20T10:00:00.000Z';
  tree.filePass0001.bytes = Buffer.from('%PDF-1.4 passport v2');
  r = await importAndWait(admin, appId, {});
  const passNow = r.data.documents.filter((d) => d.driveId === 'filePass0001');
  ok(r.data.updated.length === 1 && r.data.updated[0] === '103 - Passport.pdf' && passNow.length === 1 && passNow[0].id !== passDoc.id, 'changed file replaces the old copy (no duplicate)');
  ok(passNow[0]?.category === 'national-id', 'the replacement keeps the category staff set by hand');
  const storedAfter = await fs.readdir(path.join(dataDir, 'up', appId));
  ok(storedAfter.length === 6 && !storedAfter.includes(passDoc.stored), 'the old copy is deleted from storage');
} catch (e) {
  console.error('ERROR', e);
  failures++;
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  google.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nALL DRIVE IMPORT CHECKS PASS');
if (failures) console.log(logs.slice(-3000));
process.exit(failures ? 1 : 0);
