// End-to-end run of one client's application, the way the team works it:
//   open the file → the client emails documents → the team uploads the rest →
//   "Read documents & fill intake" → the team finishes the intake → letters and
//   forms → Build the final files → download every file → audit every box of
//   every IRCC form and the layout of every package.
//
//   npm run build && node test/e2e/run.mjs study-permit [more types…]
//
// Everything outside the platform is a stand-in: Google Drive, the mailbox and
// the AI (which "reads" each document as test/e2e/profiles.mjs says it reads).
// The filled forms are read back with test/e2e/audit_form.py. Output, with
// every downloaded file, goes to test/e2e/out/<type>/ (report.json, report.md).
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import zlib from 'zlib';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { jwtVerify, importSPKI } from 'jose';
import { PROFILES } from './profiles.mjs';
import { loadLib } from '../_load.mjs';

const { buildChecklist } = await loadLib('checklist.js');
const { getSchema } = await loadLib('schema.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const PY = process.env.PYTHON_BIN || 'python3';
const FORMS_CACHE = process.env.E2E_FORMS_CACHE || path.join(ROOT, 'uploads', 'forms-cache');
const types = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROFILES);
const PORT = 3460;
const STUB = 3461;
const GOOGLE = 3462;
const BASE = `http://127.0.0.1:${PORT}`;
const SA_EMAIL = 'e2e-importer@firm-project.iam.gserviceaccount.com';

/* ------------------------------ fictional documents ------------------------------ */
const docPdf = async (tag, title, pages = 1) => {
  const d = await PDFDocument.create();
  d.setSubject(`E2ETAG:${tag}`);
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const p = d.addPage([595, 842]);
    p.drawText(title, { x: 60, y: 760, size: 22, font });
    p.drawText(`Page ${i + 1} of ${pages} — fictional test document`, { x: 60, y: 730, size: 12, font });
    p.drawText(`E2ETAG:${tag}`, { x: 60, y: 60, size: 8, font });
  }
  return Buffer.from(await d.save({ useObjectStreams: false }));
};
const photo = () => sharp({ create: { width: 420, height: 540, channels: 3, background: '#e3e8ef' } }).jpeg().toBuffer();
const TAG = /E2ETAG:([A-Z0-9-]+)/;
/** The hidden tag of a fictional document: in its text, its (UTF-16) metadata or a compressed stream. */
const tagOf = (buf) => {
  const s = buf.toString('latin1');
  const m = s.match(TAG);
  if (m) return m[1];
  for (const h of s.match(/<([0-9A-Fa-f]{20,})>/g) || []) {
    const raw = Buffer.from(h.slice(1, -1), 'hex');
    const t = (raw.toString('latin1').replace(/\0/g, '').match(TAG)) || raw.toString('utf16le').match(TAG);
    if (t) return t[1];
  }
  const re = /stream\r?\n/g;
  let x;
  while ((x = re.exec(s))) {
    const end = s.indexOf('endstream', x.index);
    if (end < 0) break;
    try {
      const t = zlib.inflateSync(buf.subarray(x.index + x[0].length, end)).toString('latin1');
      const hit = t.match(TAG);
      if (hit) return hit[1];
      // Text drawn as hex glyph strings: <4532455441…>
      for (const h of t.match(/<([0-9A-Fa-f]{12,})>/g) || []) {
        const u = Buffer.from(h.slice(1, -1), 'hex').toString('latin1').match(TAG);
        if (u) return u[1];
      }
    } catch {}
  }
  return null;
};

/* ------------------------------ stand-in Google Drive ------------------------------ */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const spki = await importSPKI(publicKey, 'RS256');
const TOKEN = 'e2e-token';
const FOLDER = 'application/vnd.google-apps.folder';
const tree = {
  clientsRoot01: { name: 'Clients', mimeType: FOLDER, parents: [] },
  yearFolder001: { name: `0006 - ${new Date().getFullYear()} FILES`, mimeType: FOLDER, parents: ['clientsRoot01'] },
};
const sessions = {};
let nextId = 1;
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const meta = (id) => ({ id, name: tree[id].name, mimeType: tree[id].mimeType, modifiedTime: new Date().toISOString(), parents: tree[id].parents, size: String(tree[id].bytes?.length || 0) });
function multipart(req, body) {
  const boundary = req.headers['content-type'].match(/boundary=([^;]+)/)[1];
  const parts = body.toString('latin1').split(`--${boundary}`).slice(1, -1);
  const [, ...j] = parts[0].split('\r\n\r\n');
  const json = JSON.parse(Buffer.from(j.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1').toString('utf8'));
  const [h2, ...b] = parts[1].split('\r\n\r\n');
  return { json, mime: h2.match(/Content-Type: ([^\r\n]+)/)[1], bytes: Buffer.from(b.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1') };
}
const google = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${GOOGLE}`);
  let body = Buffer.alloc(0);
  for await (const c of req) body = Buffer.concat([body, c]);
  if (req.method === 'POST' && u.pathname === '/token') {
    try {
      await jwtVerify(new URLSearchParams(body.toString()).get('assertion'), spki, { issuer: SA_EMAIL, audience: `http://127.0.0.1:${GOOGLE}/token` });
      return send(res, 200, { access_token: TOKEN, expires_in: 3600 });
    } catch (e) {
      return send(res, 400, { error: 'invalid_grant', error_description: e.message });
    }
  }
  const sess = u.pathname.match(/^\/upload\/session\/(\w+)$/);
  if (req.method === 'PUT' && sess && sessions[sess[1]]) {
    const { id, json, mime } = sessions[sess[1]];
    delete sessions[sess[1]];
    if (id) {
      Object.assign(tree[id], { name: json.name || tree[id].name, bytes: body });
      return send(res, 200, meta(id));
    }
    const nid = `up${String(nextId++).padStart(8, '0')}`;
    tree[nid] = { name: json.name, mimeType: mime, parents: json.parents, bytes: body };
    return send(res, 200, meta(nid));
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'unauthenticated' });
  if (u.searchParams.get('uploadType') === 'resumable') {
    const um = u.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/);
    const id = um?.[1] ? decodeURIComponent(um[1]) : null;
    const sid = crypto.randomBytes(6).toString('hex');
    sessions[sid] = { id, json: JSON.parse(body.toString() || '{}'), mime: req.headers['x-upload-content-type'] };
    res.writeHead(200, { Location: `http://127.0.0.1:${GOOGLE}/upload/session/${sid}` });
    return res.end();
  }
  if (req.method === 'POST' && u.pathname === '/upload/drive/v3/files') {
    const { json, mime, bytes } = multipart(req, body);
    const id = `up${String(nextId++).padStart(8, '0')}`;
    tree[id] = { name: json.name, mimeType: mime, parents: json.parents, bytes };
    return send(res, 200, meta(id));
  }
  const up = u.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
  if (req.method === 'PATCH' && up) {
    const id = decodeURIComponent(up[1]);
    const { json, bytes } = multipart(req, body);
    Object.assign(tree[id], { name: json.name || tree[id].name, bytes });
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
    const exact = q.match(/name = '([^']*)'/)?.[1];
    const folderOnly = /mimeType = 'application\/vnd\.google-apps\.folder'/.test(q);
    const files = Object.keys(tree)
      .filter((id) => !tree[id].trashed && (!parent || tree[id].parents.includes(parent)) && (!contains || tree[id].name.toLowerCase().includes(contains.toLowerCase())) && (!exact || tree[id].name === exact) && (!folderOnly || tree[id].mimeType === FOLDER))
      .map(meta);
    return send(res, 200, { files });
  }
  const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  const id = m && decodeURIComponent(m[1]);
  if (id && tree[id]) {
    if (req.method === 'PATCH') {
      const j = JSON.parse(body.toString() || '{}');
      if (j.trashed) tree[id].trashed = true;
      if (j.name) tree[id].name = j.name;
      const add = u.searchParams.get('addParents');
      const remove = u.searchParams.get('removeParents');
      if (add) tree[id].parents = [...tree[id].parents.filter((p) => p !== remove), add];
      return send(res, 200, meta(id));
    }
    if (u.searchParams.get('alt') === 'media') {
      res.writeHead(200, { 'Content-Type': tree[id].mimeType });
      return res.end(tree[id].bytes || Buffer.alloc(0));
    }
    return send(res, 200, meta(id));
  }
  return send(res, 404, { error: 'notFound' });
});
await new Promise((r) => google.listen(GOOGLE, r));
/** The Drive tree under a folder, as indented lines. */
const driveTree = (id, depth = 0) =>
  Object.keys(tree)
    .filter((k) => !tree[k].trashed && tree[k].parents.includes(id))
    .sort((a, b) => tree[a].name.localeCompare(tree[b].name))
    .flatMap((k) => [`${'  '.repeat(depth)}${tree[k].mimeType === FOLDER ? '📁 ' : ''}${tree[k].name}`, ...(tree[k].mimeType === FOLDER ? driveTree(k, depth + 1) : [])]);

/* ------------------------------ stand-in AI ------------------------------ */
let current = null; // the profile being run
const aiLog = { extract: 0, verify: 0, letters: 0, facts: 0, other: 0 };
const ai = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b || '{}');
    const parts = body.messages?.flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: 'text', text: String(m.content || '') }])) || [];
    const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    const json = body.response_format?.type === 'json_object';
    let content;
    if (/Pull out the FACTS/.test(b)) {
      aiLog.facts++;
      content = JSON.stringify({ summary: 'The client sends their documents.', facts: [], fields: {}, requests: [] });
    } else if (/"datePairs"/.test(text)) {
      aiLog.verify++;
      content = JSON.stringify({ documentType: 'document', languages: ['en'], parts: { translation: true, certifiedCopy: true, original: true, translatorSeal: true }, legibility: 'good', facts: {}, datePairs: [], findings: [] });
    } else if (/Return JSON of the form/.test(text) && /--- Document \d+:/.test(text)) {
      aiLog.extract++;
      // Read each document as the profile says it reads.
      const fields = {}, confidence = {}, sources = {}, cats = {}, owners = {};
      let n = 0;
      let header = null;
      for (const p of parts) {
        if (p.type === 'text' && /^--- Document \d+:/.test(p.text)) {
          n = Number(p.text.match(/^--- Document (\d+):/)[1]);
          header = p.text.match(/^--- Document \d+: (.+?) ---/)?.[1];
          continue;
        }
        if (!n || (p.type !== 'file' && p.type !== 'image_url')) continue;
        const data = p.file?.file_data || p.image_url?.url || '';
        const buf = Buffer.from(data.replace(/^data:[^,]+,/, ''), 'base64');
        const tag = tagOf(buf) || (header && Object.keys(current.reads).find((t) => (current.docNames[t] || []).some((nm) => header.includes(nm.replace(/\.[a-z]+$/i, '')))));
        const r = tag && current.reads[tag];
        if (!r) continue;
        cats[n] = r.category;
        owners[n] = r.owner || 'applicant';
        if ((r.owner || 'applicant') === 'applicant' || r.owner === 'father') {
          for (const [k, v] of Object.entries(r.fields || {})) {
            fields[k] = v;
            confidence[k] = 'high';
            sources[k] = header;
          }
        }
        n = 0;
      }
      content = JSON.stringify({ fields, confidence, sources, documentCategories: cats, documentOwners: owners, notes: [] });
    } else if (json) {
      aiLog.other++;
      content = JSON.stringify({ readinessScore: 80, summary: 'Ready.', missingDocuments: [], weaknesses: [], strengths: ['complete'], rotations: {}, mirrored: [], pages: {}, sure: {} });
    } else {
      aiLog.letters++;
      const who = current?.file?.title || 'the applicant';
      content = `Dear Visa Officer,\n\n**Introduction**\nI, ${who}, respectfully submit this application.\n\n**Purpose**\nThe purpose is set out in the enclosed documents.\n\nSincerely,\n${who}`;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => ai.listen(STUB, r));

/* ------------------------------ mailbox ------------------------------ */
const mailDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-mail-'));
let mailSeq = 0; // the mailbox reads messages in name order, like UIDs
const eml = (from, subject, atts, text) => {
  const bd = 'E2EB0UNDARY';
  let s = `From: ${from}\r\nTo: visa@sugimotovisa.com\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <${crypto.randomBytes(6).toString('hex')}@e2e>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${bd}"\r\n\r\n--${bd}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`;
  for (const a of atts) s += `--${bd}\r\nContent-Type: ${a.mime}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${a.buf.toString('base64').replace(/(.{76})/g, '$1\r\n')}\r\n`;
  return s + `--${bd}--\r\n`;
};

/* ------------------------------ server ------------------------------ */
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-data-'));
const uploadDir = path.join(dataDir, 'up');
await fs.mkdir(path.join(uploadDir, 'forms-cache'), { recursive: true });
for (const f of await fs.readdir(FORMS_CACHE).catch(() => [])) await fs.copyFile(path.join(FORMS_CACHE, f), path.join(uploadDir, 'forms-cache', f));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  cwd: ROOT,
  env: {
    ...process.env, AUTH_SECRET: 'e2e-secret-value-at-least-32-characters', DATA_DIR: dataDir, UPLOAD_DIR: uploadDir, ADMIN_EMAIL: 'boss@firm.test',
    OPENAI_API_KEY: 'stub', OPENAI_BASE_URL: `http://127.0.0.1:${STUB}/v1`, ANTHROPIC_API_KEY: '', PYTHON_BIN: PY,
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: SA_EMAIL, private_key: privateKey }),
    GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${GOOGLE}/drive/v3`, GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${GOOGLE}/token`,
    DRIVE_CLIENTS_FOLDER: 'https://drive.google.com/drive/folders/clientsRoot01', DRIVE_SYNC_MINUTES: '60',
    MAIL_STUB_DIR: mailDir, MAIL_POLL_MINUTES: '600', ODOO_URL: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));
let cookie = '';
const call = async (method, url, body, form) => {
  const r = await fetch(BASE + url, { method, headers: form ? { cookie } : { 'Content-Type': 'application/json', cookie }, body: form || (body ? JSON.stringify(body) : undefined), redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let data = null;
  try {
    data = await r.json();
  } catch {}
  return { status: r.status, data };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, ms = 180000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(400);
  }
  throw new Error(`timed out: ${what}`);
};

/* ------------------------------ one client ------------------------------ */
async function runType(type) {
  const P = PROFILES[type];
  if (!P) throw new Error(`no fictional client for ${type}`);
  current = { ...P, docNames: {} };
  const out = path.join(here, 'out', type);
  await fs.rm(out, { recursive: true, force: true });
  await fs.mkdir(out, { recursive: true });
  const report = { type, steps: [], forms: {}, files: [], problems: [], drive: [] };
  const step = (what, ok, detail = '') => {
    report.steps.push({ what, ok, detail });
    console.log(`${ok ? 'OK  ' : 'FAIL'}  ${what}${detail ? ` — ${detail}` : ''}`);
  };

  // 1. Open the file, as the team does when the contract is signed.
  let r = await call('POST', '/api/applications', { type, ...P.file });
  const id = r.data?.application?.id;
  step('open the file', r.status === 201 && !!id, `${P.file.clientNumber} ${P.file.title}`);
  await call('PATCH', `/api/applications/${id}`, { data: { email: P.email } });

  // 2. The client emails their first documents.
  const atts = [];
  for (const d of P.emailed) {
    current.docNames[d.tag] = [d.name];
    const buf = d.image ? await photo() : await docPdf(d.tag, d.name, d.pages || 1);
    atts.push({ name: d.name, mime: d.image ? 'image/jpeg' : 'application/pdf', buf });
  }
  await fs.writeFile(path.join(mailDir, `${String(++mailSeq).padStart(3, '0')}-${type}.eml`), eml(`${P.file.title} <${P.email}>`, 'My documents', atts, 'Hello,\nPlease find my documents attached.\nThank you'));
  r = await call('POST', '/api/admin/mail', { action: 'check' });
  // A family sharing one email address: the message matches several files
  // and waits in the Email intake inbox — staff assign it, as the team does.
  await sleep(4000);
  const inbox = (await call('GET', '/api/admin/mail')).data?.messages || [];
  const waiting = inbox.find((m) => m.status === 'unassigned' && m.from?.address === P.email);
  if (waiting) {
    const a = await call('POST', '/api/admin/mail', { action: 'assign', id: waiting.id, appId: id });
    step('email: shared address — staff assign the message to this file', a.status === 200, a.data?.error || '');
  }
  const mailed = await until(async () => {
    const a = (await call('GET', `/api/applications/${id}`)).data?.application;
    return (a?.documents || []).length >= P.emailed.length ? a : null;
  }, 'emailed documents on the file');
  step('email: the documents arrive on the file', mailed.documents.length >= P.emailed.length, `${mailed.documents.length} documents`);

  // 3. The team uploads the rest: the tagged documents, and one document for
  // every other item of the type's checklist the client provides.
  let uploads = [...P.uploaded];
  if (P.fromChecklist) {
    // Name each tagged document with this type's own code for its category (codes differ per service).
    const items = buildChecklist({ ...P.team, sex: P.reads.PASSPORT?.fields?.sex }, type);
    uploads = uploads.map((u) => {
      const cat = P.reads[u.tag]?.category;
      const it = items.find((i) => i.key === cat);
      const rest = u.name.replace(/^[\dA-Za-z-]+ - /, '');
      return { ...u, name: it ? `${it.code} - ${rest}` : rest };
    });
    current.docNames = Object.fromEntries(uploads.map((u) => [u.tag, [u.name]]).concat(Object.entries(current.docNames)));
  }
  if (P.fromChecklist) {
    const who = P.file.title.split(' ')[0];
    const have = new Set([...uploads.map((u) => u.name.split(' - ')[0]), '101', '102', '103', '104', '105', '106']);
    for (const it of buildChecklist({ ...P.team, sex: P.reads.PASSPORT?.fields?.sex }, type)) {
      if (it.party === 'firm' || it.cond || ['internal', 'questionnaire', 'rep-form'].includes(it.key) || have.has(String(it.code))) continue;
      have.add(String(it.code));
      const label = it.label.split(/ — | \(/)[0].replace(/[\\/:*?"<>|]/g, '-');
      uploads.push({ name: `${it.code} - ${label} - ${who}.pdf`, tag: `CL${String(it.code).replace(/\W/g, '')}`, pages: 2 });
    }
  }
  report.uploads = uploads.map((u) => u.name);
  const fd = new FormData();
  for (const d of uploads) {
    const buf = d.image ? await photo() : await docPdf(d.tag, d.name, d.pages || 1);
    current.docNames[d.tag] = [d.name];
    fd.append('files', new Blob([buf], { type: d.image ? 'image/jpeg' : 'application/pdf' }), d.name);
  }
  r = await call('POST', `/api/applications/${id}/upload`, null, fd);
  step('upload the other documents', r.status === 201, `${uploads.length} uploaded, ${r.data?.documents?.length ?? r.data?.error} on the file`);

  // 4. Read documents & fill intake (the emailed ones were read on arrival).
  await until(async () => (await call('GET', `/api/applications/${id}/extract`)).data?.job?.status !== 'running', 'first read');
  r = await call('POST', `/api/applications/${id}/extract`, { applicant: P.file.title });
  const job = await until(async () => {
    const j = (await call('GET', `/api/applications/${id}/extract`)).data?.job;
    return j && j.status !== 'running' ? j : null;
  }, 'reading documents');
  step('read documents & fill intake', job.status === 'done', `${job.status}${job.error ? ` ${job.error}` : ''}`);
  let app = (await call('GET', `/api/applications/${id}`)).data.application;
  // Only answers this type's intake asks (a reconsideration has no family or education section).
  const asked = new Set(getSchema(type).steps.flatMap((st) => st.fields.map((f) => f.id)));
  const read = Object.entries(P.reads).flatMap(([, x]) => Object.keys(x.fields || {})).filter((k) => asked.has(k));
  const missed = read.filter((k) => app.data[k] === undefined || app.data[k] === '' || (Array.isArray(app.data[k]) && !app.data[k].length));
  step('the intake holds what the documents say', !missed.length, missed.length ? `not filled: ${missed.join(', ')}` : `${read.length} answers`);
  const mis = (app.documents || []).filter((d) => !d.category || d.category === 'other');
  step('every document is recognised', !mis.length, mis.map((d) => d.filename).join(', '));
  report.documents = (app.documents || []).map((d) => ({ filename: d.filename, category: d.category, original: d.originalName || d.originalFilename }));

  // 5. The team finishes the intake.
  r = await call('PATCH', `/api/applications/${id}`, { data: P.team, baseDataVersion: app.dataVersion });
  step('the team finishes the intake', r.status === 200, r.data?.error || '');
  app = (await call('GET', `/api/applications/${id}`)).data.application;
  const prog = (await call('GET', `/api/applications/${id}`)).data;
  report.intakeMissing = prog.missing || prog.application?.missing || null;


  // 7. Build the final files.
  r = await call('GET', `/api/applications/${id}/final-files`);
  report.plan = (r.data?.plan || []).map((e) => ({ n: e.n, filename: e.filename, slot: e.slot, kind: e.kind, contents: (e.contents || []).map((s) => ({ name: s.name, files: s.files, children: (s.children || []).map((c) => ({ name: c.name, files: c.files })) })) }));
  report.unplaced = (r.data?.unplaced || []).map((u) => u.filename || u);
  r = await call('POST', `/api/applications/${id}/final-files`, { cleanPages: true, fixRotation: true });
  const build = await until(async () => {
    const j = (await call('GET', `/api/applications/${id}/final-files`)).data?.job;
    return j && j.status !== 'running' ? j : null;
  }, 'building the final files', 600000);
  step('build the final files', build.status === 'done', `${build.status} ${build.error || ''}`);
  const res = build.result || {};
  report.buildProblems = res.problems || [];
  for (const p of res.problems || []) step(`build problem: ${p.filename}`, false, p.reason);

  // Drive: the client folder, its documents and the final files (saved in the background).
  await until(async () => {
    const fin = Object.keys(tree).find((k) => tree[k].name === '02 - Final Files' && !tree[k].trashed && Object.keys(tree).some((c) => tree[c].parents.includes(k)));
    return fin || null;
  }, 'final files on Drive', 60000).catch(() => null);
  await sleep(2000);
  const clientFolder = Object.keys(tree).find((k) => tree[k].mimeType === FOLDER && tree[k].name.startsWith(`${P.file.clientNumber} - `));
  report.drive = clientFolder ? [`📁 ${tree[clientFolder].name}`, ...driveTree(clientFolder, 1)] : driveTree('clientsRoot01');
  const finals = report.drive.filter((l) => /^\s{4}\d\d - /.test(l));
  step('Drive: the client folder holds the documents and the final files', report.drive.some((l) => /01 - Documents/.test(l)) && finals.length > 0, `${finals.length} final files on Drive`);
  // Duplicate names inside one folder of this client (other clients' folders may reuse names).
  const mine = Object.keys(tree).find((k) => tree[k].mimeType === FOLDER && tree[k].name.startsWith(`${P.file.clientNumber} - `));
  const dupes = [];
  for (const f of Object.keys(tree).filter((k) => tree[k].mimeType === FOLDER && (k === mine || tree[k].parents.includes(mine)))) {
    const names = Object.keys(tree).filter((k) => !tree[k].trashed && tree[k].parents.includes(f) && tree[k].mimeType !== FOLDER).map((k) => tree[k].name);
    dupes.push(...names.filter((n, i) => names.indexOf(n) !== i).map((n) => `${tree[f].name}/${n}`));
  }
  step('Drive: no two documents share a name', !dupes.length, dupes.join(', '));

  // 8. Download every built file and the zip; audit them.
  app = (await call('GET', `/api/applications/${id}`)).data.application;
  const ff = app.finalFiles?.files || res.files || [];
  for (const f of ff) {
    const dl = await fetch(`${BASE}/api/applications/${id}/download/${f.key}`, { headers: { cookie } });
    const buf = Buffer.from(await dl.arrayBuffer());
    const fname = f.filename || f.name;
    await fs.writeFile(path.join(out, fname.replace(/[\\/]/g, '_')), buf);
    const info = { name: fname, bytes: buf.length, ok: dl.ok };
    if (/\.pdf$/i.test(fname) && dl.ok) {
      try {
        const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
        info.pages = doc.getPageCount();
      } catch (e) {
        info.error = e.message;
      }
      info.text = spawnSync('pdftotext', ['-l', '3', '-', '-'], { input: buf }).stdout?.toString().slice(0, 1500);
    }
    report.files.push(info);
  }
  step('download every final file', report.files.length > 0 && report.files.every((f) => f.ok), `${report.files.length} files`);
  const zip = await fetch(`${BASE}/api/applications/${id}/final-files/zip`, { headers: { cookie } });
  if (zip.ok) {
    const z = await JSZip.loadAsync(Buffer.from(await zip.arrayBuffer()));
    report.zip = Object.keys(z.files);
  }
  step('download the zip', zip.ok, `${report.zip?.length || 0} entries`);

  // The pre-filled forms: every box, read back as Adobe shows it.
  for (const g of (app.generated || []).filter((x) => /-filled$/.test(x.key))) {
    const formKey = g.key.replace(/-filled$/, '');
    const dl = await fetch(`${BASE}/api/applications/${id}/download/${g.key}`, { headers: { cookie } });
    const buf = Buffer.from(await dl.arrayBuffer());
    const file = path.join(out, `${formKey}-filled.pdf`);
    await fs.writeFile(file, buf);
    const a = spawnSync(PY, [path.join(here, 'audit_form.py'), file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (a.status !== 0) {
      step(`audit ${formKey}`, false, a.stderr.slice(-300));
      continue;
    }
    const audit = JSON.parse(a.stdout);
    // Every box the applicant or the team fills (not the form's own bookkeeping, barcodes or signatures).
    const META = /(^|\/)(FormVersion|FormName|ReaderInfo|ApplicationValidat\w*|FormValidated|Validated\w*|CRCNum|Page\d\/TextField1(\[\d\])?|num(\[\d\])?|totPage(\[\d\])?|FormNumber(\[\d\])?|signat\w*(\[\d\])?|Signature\w*|dateSigned(\[\d\])?|date\w*Signed|C1CertificateIssueDate|Page\d\/TextField2|Barcode\w*)$/i;
    const real = audit.fields.filter((f) => !META.test(f.path) && !/ValidationDate\//.test(f.path));
    const filled = real.filter((f) => f.value);
    const empty = real.filter((f) => !f.value);
    const nil = audit.fields.filter((f) => f.nil && f.value);
    report.forms[formKey] = {
      checks: g.checks || [],
      filled: filled.map((f) => ({ path: f.path, caption: f.caption, value: f.shown })),
      empty: empty.map((f) => ({ path: f.path, caption: f.caption, kind: f.kind })),
      rows: audit.rows,
      nil: nil.map((f) => f.path),
    };
    for (const [end, want] of Object.entries(P.expect?.[formKey] || {})) {
      const f = audit.fields.find((x) => x.path.endsWith(end));
      const okv = f && new RegExp(`^(${want})$`).test(f.value);
      step(`${formKey}: ${end}`, !!okv, `${f ? `"${f.value}"` : 'no such box'} (want ${want})`);
    }
    step(`${formKey}: no answered box left marked empty`, !nil.length, nil.map((f) => f.path).join(', '));
    // The applicant's core facts must be on every main form.
    if (/^imm(1294|1295|5257|5708|5709|5710)$/.test(formKey)) {
      const values = new Set(audit.fields.map((f) => String(f.value || '').trim().toLowerCase()));
      const all = audit.fields.map((f) => String(f.value || '')).join(' | ').toLowerCase();
      const d = app.data || {};
      const core = ['familyName', 'givenName', 'passportNumber', 'cityOfBirth', 'email', 'nationalIdNumber', 'mailingStreet', 'mailingCity'].filter((k) => d[k]);
      const lost = core.filter((k) => !values.has(String(d[k]).trim().toLowerCase()) && !all.includes(String(d[k]).trim().toLowerCase()));
      if (d.dob && !values.has(d.dob.slice(0, 4))) lost.push('dob');
      step(`${formKey}: the applicant's core facts are on the form`, !lost.length, lost.length ? `missing: ${lost.join(', ')}` : core.join(', '));
    }
    console.log(`      ${formKey}: ${filled.length} boxes filled, ${empty.length} empty, ${(g.checks || []).length} to check`);
  }

  // A readable report: everything to look over by hand.
  const md = [`# ${type} — ${P.file.clientNumber} ${P.file.title}`, '', '## Steps', ...report.steps.map((s) => `- ${s.ok ? '✓' : '✗'} ${s.what}${s.detail ? ` — ${s.detail}` : ''}`), '', '## Documents', ...(report.documents || []).map((d) => `- ${d.filename} (${d.category})${d.original ? ` ← ${d.original}` : ''}`), '', '## Drive', '```', ...report.drive, '```', '', '## Final files', ...report.files.map((f) => `- ${f.name} — ${f.pages ?? '?'} pages, ${Math.round(f.bytes / 1024)} KB`), '', `Unplaced: ${report.unplaced.join(', ') || 'none'}`, ''];
  for (const [k, f] of Object.entries(report.forms)) {
    md.push(`## ${k}`, '', `### Still to check (${f.checks.length})`, ...f.checks.map((c) => `- ${typeof c === 'string' ? c : `${c.text}${c.field ? ` → ${c.field}` : ''}`}`), '', `### Filled (${f.filled.length})`, ...f.filled.map((x) => `- ${x.caption || '(no caption)'}: **${x.value}**  \`${x.path}\``), '', `### Extra rows`, ...f.rows.map((x) => `- \`${x.path}\` ${x.value}`), '', `### Empty (${f.empty.length})`, ...f.empty.map((x) => `- ${x.caption}  \`${x.path}\` (${x.kind})`), '');
  }
  md.push('## Package contents', ...report.files.filter((f) => f.text).map((f) => `### ${f.name}\n\`\`\`\n${f.text.slice(0, 1200)}\n\`\`\``));
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  await fs.writeFile(path.join(out, 'report.md'), md.join('\n'));
  return report;
}

let failed = 0;
try {
  await until(async () => {
    try {
      return (await fetch(`${BASE}/api/health`)).ok;
    } catch {
      return false;
    }
  }, 'server start', 60000);
  await call('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'E2E Admin' });
  for (const t of types) {
    console.log(`\n=== ${t} ===`);
    try {
      const rep = await runType(t);
      failed += rep.steps.filter((s) => !s.ok).length;
    } catch (e) {
      failed++;
      console.log(`FAIL  ${t}: ${e.stack}\n${logs.slice(-3000)}`);
    }
  }
  console.log('\nAI calls:', JSON.stringify(aiLog));
} finally {
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    server.kill('SIGKILL');
  }
  google.close();
  ai.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failed ? `\n${failed} step(s) failed — see test/e2e/out/<type>/report.md` : '\nAll steps passed — see test/e2e/out/<type>/report.md');
process.exit(failed ? 1 : 0);
