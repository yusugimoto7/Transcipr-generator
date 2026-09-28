// End-to-end test of email intake: messages in a stub mailbox (.eml files)
// are matched to files, their documents saved, read and checked, named the
// team's way and filed on a stub Google Drive.
//   npm run build && node test/mail.test.mjs
import { spawn } from 'child_process';
import { loadLib } from './_load.mjs';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { jwtVerify, importSPKI } from 'jose';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PORT = 3391;
const STUB = 3392; // OpenAI
const GOOGLE = 3393; // Drive + token
const BASE = `http://127.0.0.1:${PORT}`;
const SA_EMAIL = 'platform-importer@firm-project.iam.gserviceaccount.com';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const pdf = async (label) => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([595, 842]).drawText(label, { x: 60, y: 700, size: 28, font });
  return Buffer.from(await d.save());
};

/* ------------------------------ stub Google ------------------------------ */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const spki = await importSPKI(publicKey, 'RS256');
const TOKEN = 'stub-token';
const FOLDER = 'application/vnd.google-apps.folder';
// id -> { name, mimeType, parents }
const tree = {
  clientsRoot01: { name: 'Clients', mimeType: FOLDER, parents: [] },
  yearFolder001: { name: '0005 - 2026 FILES', mimeType: FOLDER, parents: ['clientsRoot01'] },
  clientAli0001: { name: 'S26170 - Ali Test', mimeType: FOLDER, parents: ['yearFolder001'] },
  aliDocs000001: { name: '01 - Documents', mimeType: FOLDER, parents: ['clientAli0001'] },
  elsewhere0001: { name: 'S26160 - Zahra Mousavi', mimeType: FOLDER, parents: ['unrelatedRoot'] }, // same name, NOT under the clients folder
};
const uploads = []; // { parent, name, mime, size }
let nextId = 1;
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const meta = (id) => ({ id, name: tree[id].name, mimeType: tree[id].mimeType, modifiedTime: '2026-09-27T10:00:00.000Z', parents: tree[id].parents });
const google = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${GOOGLE}`);
  let body = Buffer.alloc(0);
  for await (const c of req) body = Buffer.concat([body, c]);
  if (req.method === 'POST' && u.pathname === '/token') {
    const form = new URLSearchParams(body.toString());
    try {
      const { payload } = await jwtVerify(form.get('assertion'), spki, { issuer: SA_EMAIL, audience: `http://127.0.0.1:${GOOGLE}/token` });
      if (!/auth\/drive$/.test(payload.scope)) throw new Error(`scope ${payload.scope} cannot write`);
      return send(res, 200, { access_token: TOKEN, expires_in: 3600 });
    } catch (e) {
      return send(res, 400, { error: 'invalid_grant', error_description: e.message });
    }
  }
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'unauthenticated' });
  if (u.pathname === '/upload/drive/v3/files') {
    const text = body.toString('latin1');
    const m = text.match(/\{[^]*?\}/);
    const j = JSON.parse(Buffer.from(m[0], 'latin1').toString('utf8'));
    const parts = text.split(/--sugimoto-[a-z0-9]+/);
    const filePart = parts[2] || '';
    const mime = filePart.match(/Content-Type: ([^\r\n]+)/)?.[1];
    const size = Buffer.byteLength(filePart.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1');
    const id = `up${String(nextId++).padStart(8, '0')}`;
    tree[id] = { name: j.name, mimeType: mime, parents: j.parents };
    uploads.push({ id, parent: j.parents[0], name: j.name, mime, size });
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
      .filter((id) => (!parent || tree[id].parents.includes(parent)) && (!contains || tree[id].name.toLowerCase().includes(contains.toLowerCase())) && (!folderOnly || tree[id].mimeType === FOLDER))
      .map(meta);
    return send(res, 200, { files });
  }
  const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  if (m && tree[decodeURIComponent(m[1])]) return send(res, 200, meta(decodeURIComponent(m[1])));
  return send(res, 404, { error: 'notFound' });
});
await new Promise((r) => google.listen(GOOGLE, r));

/* ------------------------------ stub OpenAI ------------------------------ */
const stub = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const parts = JSON.parse(b || '{}').messages?.flatMap((m) => (Array.isArray(m.content) ? m.content : [])) || [];
    const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    let out;
    if (/Pull out the FACTS/.test(b)) {
      const father = /father will pay/i.test(b);
      out = father
        ? { summary: 'The client explains who pays and where she was born.', facts: [{ topic: 'finances', about: 'applicant', text: 'Her father will pay for the trip.', quote: 'My father will pay for everything' }, { topic: 'identity', about: 'applicant', text: 'She was born in Shiraz.', quote: 'I was born in Shiraz' }], fields: { cityOfBirth: 'Shiraz', givenName: 'Zahra Sadat', notAField: 'x' }, requests: ['Will send the bank letter next week.'] }
        : { summary: 'A short note.', facts: [], fields: {}, requests: [] };
    } else if (/"datePairs"/.test(text)) {
      out = { documentType: 'stub', parts: { translation: true, certifiedCopy: true, original: true, translatorSeal: true }, legibility: 'good', facts: {}, datePairs: [], findings: /bank/i.test(text) ? [{ severity: 'medium', kind: 'vague', text: 'No balance stated.', page: 1 }] : [] };
    } else {
      const headers = parts.filter((p) => p.type === 'text' && /^--- Document \d+:/.test(p.text)).map((p) => p.text);
      const cats = {};
      const owners = {};
      headers.forEach((h, i) => {
        owners[i + 1] = 'applicant';
        cats[i + 1] = /passport/i.test(h) ? 'passport' : /birth/i.test(h) ? 'national-id' : /bank/i.test(h) ? 'proof-of-funds' : /letter/i.test(h) ? 'employment-letter' : 'other';
      });
      out = { fields: {}, confidence: {}, sources: {}, documentCategories: cats, documentOwners: owners, notes: [] };
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(out) } }] }));
  });
});
await new Promise((r) => stub.listen(STUB, r));

/* ------------------------------ stub mailbox ------------------------------ */
const mailDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mail-eml-'));
const eml = (from, subject, atts, text = 'Hello, my documents are attached.') => {
  const b = 'B0UNDARY42';
  let s = `From: ${from}\r\nTo: visa@sugimotovisa.com\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <${crypto.randomBytes(6).toString('hex')}@test>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${b}"\r\n\r\n--${b}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}\r\n`;
  for (const a of atts) s += `--${b}\r\nContent-Type: ${a.mime}; name="${a.name}"\r\nContent-Disposition: attachment; filename="${a.name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${a.buf.toString('base64').replace(/(.{76})/g, '$1\r\n')}\r\n`;
  return s + `--${b}--\r\n`;
};
const zip = new JSZip();
zip.file('birth certificate.pdf', await pdf('BIRTH'));
zip.file('__MACOSX/._x', 'junk');
const zipBuf = await zip.generateAsync({ type: 'nodebuffer' });
await fs.writeFile(path.join(mailDir, '001.eml'), eml('Zahra <client@mail.test>', 'my documents', [{ name: 'passport scan.pdf', mime: 'application/pdf', buf: await pdf('PASSPORT') }, { name: 'docs.zip', mime: 'application/zip', buf: zipBuf }]));
await fs.writeFile(path.join(mailDir, '002.eml'), eml('stranger@x.test', 'papers', [{ name: 'bank.jpg', mime: 'image/jpeg', buf: Buffer.from('ffd8ffe000104a46494600', 'hex') }]));
await fs.writeFile(path.join(mailDir, '003.eml'), eml('other@x.test', 'S26170 documents', [{ name: 'employment letter.pdf', mime: 'application/pdf', buf: await pdf('LETTER') }]));
await fs.writeFile(path.join(mailDir, '004.eml'), eml('nobody@x.test', 'question', [], 'Is the fee refundable?'));
await fs.writeFile(path.join(mailDir, '005.eml'), eml('Zahra M <zahra.card@mail.test>', 'about my trip', [], 'Hello,\nMy father will pay for everything. I was born in Shiraz.\n\nOn Mon, 1 Sep 2026 at 10:00 Team <visa@sugimotovisa.com> wrote:\n> What is your plan?'));
await fs.writeFile(path.join(mailDir, '006.eml'), eml('someone.else@x.test', 'hello', [], 'Regarding file S26170: I will travel in May.'));

/* --------------------------------- server --------------------------------- */
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mail-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env, AUTH_SECRET: 'mail-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'),
    OPENAI_API_KEY: 'stub', OPENAI_BASE_URL: `http://127.0.0.1:${STUB}/v1`, ADMIN_EMAIL: 'boss@firm.test',
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: SA_EMAIL, private_key: privateKey }),
    GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${GOOGLE}/drive/v3`, GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${GOOGLE}/token`,
    MAIL_STUB_DIR: mailDir, MAIL_POLL_MINUTES: '60', DRIVE_CLIENTS_FOLDER: 'https://drive.google.com/drive/folders/clientsRoot01',
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
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data };
  };
}

try {
  await waitUp();
  const admin = client(), applicant = client();
  await admin('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  await applicant('POST', '/api/auth/register', { email: 'someone@mail.test', password: 'password123', name: 'S' });
  let r = await admin('POST', '/api/applications', { type: 'owp-worker-spouse', title: 'Zahra Mousavi', clientNumber: 'S26160' });
  const zahra = r.data.application.id;
  await admin('PATCH', `/api/applications/${zahra}`, { data: { givenName: 'Zahra', familyName: 'Mousavi', email: 'client@mail.test' } });
  r = await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Ali Test', clientNumber: 'S26170' });
  const ali = r.data.application.id;
  await admin('PATCH', `/api/applications/${ali}`, { data: { givenName: 'Ali', familyName: 'Test' } });

  // The client's email on their Odoo card (normally set by the Odoo sync).
  const zFile = path.join(dataDir, 'applications', `${zahra}.json`);
  const zj = JSON.parse(await fs.readFile(zFile, 'utf8'));
  zj.odoo = { taskId: 99, emails: ['zahra.card@mail.test'] };
  await fs.writeFile(zFile, JSON.stringify(zj));

  r = await applicant('GET', '/api/admin/mail');
  ok(r.status === 403, 'applicants cannot see the mailbox');

  r = await admin('POST', '/api/admin/mail', { action: 'check' });
  ok(r.status === 200 && r.data.counts.fetched === 6 && r.data.counts.processed === 4 && r.data.counts.unassigned === 1 && r.data.counts.noAttachments === 1, `one check fetched 6 messages: 4 filed, 1 waiting, 1 without documents or file (${JSON.stringify(r.data?.counts)})`);

  r = await admin('GET', '/api/admin/mail');
  const byFrom = Object.fromEntries(r.data.messages.map((m) => [m.from.address, m]));
  const z = byFrom['client@mail.test'];
  ok(z.status === 'processed' && z.appId === zahra && /sender client@mail.test/.test(z.how), 'the intake email address matches the message to the file');
  const names = z.files.map((f) => f.filename).sort();
  ok(names.join(' | ') === '101 - Birth Certificate and National ID - Zahra.pdf | 103 - Passport - Zahra.pdf', `documents are named the team's way after reading (${names.join(' | ')})`);
  ok(z.files.every((f) => f.driveId) && z.drive.uploaded === 2 && z.drive.folderCreated === true, 'both documents were filed on Drive in a folder created for the client');
  const created = Object.entries(tree).find(([, t]) => t.name === 'S26160 - Zahra Mousavi' && t.parents[0] === 'yearFolder001');
  ok(Boolean(created), "the new client folder is 'S26160 - Zahra Mousavi' under this year's FILES folder (not the same-named folder elsewhere)");
  const sub = Object.values(tree).filter((t) => t.parents[0] === created?.[0]).map((t) => t.name).sort();
  ok(sub.join(',') === '01 - Documents,02 - Final Files', `with the firm's subfolders (${sub.join(', ')})`);
  const docsFolder = Object.entries(tree).find(([, t]) => t.name === '01 - Documents' && t.parents[0] === created?.[0])?.[0];
  ok(uploads.filter((u) => u.parent === docsFolder).map((u) => u.name).sort().join(' | ') === names.join(' | '), 'the copies on Drive carry the same names, inside 01 - Documents');
  ok(uploads.find((u) => u.name.startsWith('103'))?.mime === 'application/pdf' && uploads.find((u) => u.name.startsWith('103')).size > 500, 'uploaded PDFs carry their bytes');

  const zApp = (await admin('GET', `/api/applications/${zahra}`)).data.application;
  ok(zApp.documents.length === 2 && zApp.documents.every((d) => d.source === 'email' && d.category && d.verification?.status && d.driveId), 'on the file: 2 documents from email, categorised, checked and linked to Drive');
  ok(zApp.driveSource?.rootId === created?.[0] && zApp.driveSource.docsFolderId === docsFolder, "the file remembers the client's Drive folder");
  ok(!zApp.documents.some((d) => /__MACOSX|\._x/.test(d.filename)), 'zip junk is ignored');

  // Retry: copying an email's documents to Drive again is safe (already there → nothing re-uploaded).
  const before = uploads.length;
  r = await admin('POST', '/api/admin/mail', { action: 'drive', id: z.id });
  ok(r.status === 200 && !r.data.message.drive.error && r.data.message.drive.uploaded === 0 && uploads.length === before && r.data.message.files.every((f) => f.driveId), 'Save to Drive again re-checks the documents without uploading them twice');

  const a = byFrom['other@x.test'];
  ok(a.status === 'processed' && a.appId === ali && /client number S26170/.test(a.how), 'a client number in the subject matches the message to the file');
  ok(a.files[0].filename === '113 - Employment - Ali.pdf' && !a.drive.folderCreated && uploads.some((u) => u.parent === 'aliDocs000001' && u.name === '113 - Employment - Ali.pdf'), "the existing client folder's 01 - Documents is used");
  ok(byFrom['nobody@x.test'].status === 'no-attachments' && /refundable/.test(byFrom['nobody@x.test'].body), 'a message without documents or file is listed with its text');

  // Email text and facts on the file.
  const card = byFrom['zahra.card@mail.test'];
  ok(card.status === 'processed' && card.appId === zahra && /Odoo card/.test(card.how), `a text-only email from the address on the Odoo card reaches the file (${card.how})`);
  const six = byFrom['someone.else@x.test'];
  ok(six.status === 'processed' && six.appId === ali && /S26170/.test(six.how), 'a client number in the text (not the subject) reaches the file');
  let zf = (await admin('GET', `/api/applications/${zahra}`)).data.application;
  const e5 = zf.emails.find((e) => e.from.address === 'zahra.card@mail.test');
  ok(zf.emails.length === 2 && /father will pay/.test(e5.body) && zf.emails.some((e) => /documents are attached/.test(e.body)), 'the text of every email is kept on the file');
  ok(e5.analysis?.facts?.length === 2 && e5.analysis.facts[0].topic === 'finances' && e5.analysis.requests.length === 1, 'the email is read for facts, grouped by topic');
  ok(zf.data.cityOfBirth === 'Shiraz' && e5.analysis.filled.includes('cityOfBirth'), 'an empty intake field is filled from the email');
  ok(zf.data.givenName === 'Zahra' && e5.analysis.conflicts.some((c) => c.field === 'givenName' && c.email === 'Zahra Sadat'), 'an answer is never overwritten: a different value is shown to the team');
  ok(!('notAField' in zf.data), 'values for unknown fields are dropped');
  r = await admin('POST', `/api/applications/${zahra}/emails`, { action: 'dismiss', emailId: e5.id, factId: e5.analysis.facts[1].id });
  ok(r.status === 200 && r.data.emails.find((e) => e.id === e5.id).analysis.facts[1].dismissed === true, 'the team can leave a fact out');
  const { emailFactsText } = await loadLib('emails.js');
  zf = (await admin('GET', `/api/applications/${zahra}`)).data.application;
  const ft = emailFactsText(zf);
  ok(/father will pay/.test(ft) && !/Shiraz/.test(ft), 'the facts the letters and review get leave the dismissed one out');
  r = await applicant('POST', `/api/applications/${zahra}/emails`, { action: 'analyze', emailId: e5.id });
  ok(r.status === 403 || r.status === 404, 'clients cannot use the emails API');

  // Staff can file a text-only email that matched nothing.
  r = await admin('POST', '/api/admin/mail', { action: 'assign', id: byFrom['nobody@x.test'].id, appId: ali });
  let af = (await admin('GET', `/api/applications/${ali}`)).data.application;
  ok(r.status === 200 && r.data.message.status === 'processed' && af.emails.some((e) => /refundable/.test(e.body)), 'staff file a text-only email; its text lands on the file');

  // Emails filed before the text was kept: "Save the text of earlier emails".
  const aFile = path.join(dataDir, 'applications', `${ali}.json`);
  const aj = JSON.parse(await fs.readFile(aFile, 'utf8'));
  aj.emails = [];
  await fs.writeFile(aFile, JSON.stringify(aj));
  r = await admin('POST', '/api/admin/mail', { action: 'backfill' });
  for (let i = 0; i < 40 && (r.data?.backfill?.running ?? true); i++) { await new Promise((x) => setTimeout(x, 250)); r = await admin('GET', '/api/admin/mail'); }
  af = (await admin('GET', `/api/applications/${ali}`)).data.application;
  ok(r.data.backfill.saved === 3 && af.emails.length === 3 && af.emails.every((e) => e.body), `earlier emails get their text back on the file (${r.data.backfill.saved} saved)`);

  const s = byFrom['stranger@x.test'];
  ok(s.status === 'unassigned' && s.candidates.length === 0, 'an unknown sender waits for staff');
  r = await admin('POST', '/api/admin/mail', { action: 'assign', id: s.id, appId: zahra, remember: true });
  ok(r.status === 200 && r.data.message.status === 'processed' && r.data.message.files[0].filename === '112 - Bank Statement - Zahra.jpg', `staff file a waiting message; it is named from the reading (${r.data?.message?.files?.[0]?.filename})`);
  ok(r.data.message.files[0].check === 'orange', 'and checked (the vague bank letter is orange)');
  const zApp2 = (await admin('GET', `/api/applications/${zahra}`)).data.application;
  ok((zApp2.clientEmails || []).includes('stranger@x.test'), 'the sender is remembered on the file');

  r = await admin('POST', '/api/admin/mail', { action: 'check' });
  ok(r.data.counts.fetched === 0, 'a second check fetches nothing new');
} catch (e) {
  console.error('ERROR', e);
  failures++;
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  stub.close();
  google.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(mailDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nALL EMAIL INTAKE CHECKS PASS');
if (failures) console.log(logs.slice(-3000));
process.exit(failures ? 1 : 0);
