// The same document sent more than once (lib/docVersions.js): numbered names,
// the newest copy in use, different documents of one name kept apart, and the
// team's switch — on its own and through the documents API.
//   npm run build && node test/versions.test.mjs
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { loadLib } from './_load.mjs';

const v = await loadLib('docVersions.js');
const { checklistStatus } = await loadLib('checklist.js');
let bad = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) bad++; };

// Names
const named = [{ id: 'a', filename: '103 - Passport - Sara.pdf' }, { id: 'b', filename: '103 - Passport - Sara - 2.pdf' }];
ok(v.numberedName([], 'x.pdf') === 'x.pdf', 'a free name is kept');
ok(v.numberedName(named.slice(0, 1), '103 - Passport - Sara.pdf') === '103 - Passport - Sara - 2.pdf', 'a taken name gets " - 2"');
ok(v.numberedName(named, '103 - Passport - Sara.pdf') === '103 - Passport - Sara - 3.pdf', 'then " - 3"');

// The very same file again: a newer copy.
const passport = (id, at, n, sha1 = id) => ({ id, category: 'passport', uploadedAt: at, sha1, verification: { status: 'green', facts: { passportNumber: n } } });
let docs = [passport('p1', '2026-01-01', 'X1234567', 'same'), passport('p2', '2026-02-01', null, 'same')];
ok(v.linkCopies(docs).length === 1 && docs[1].replaces === 'p1', 'the same file sent again is a newer copy');
ok(v.currentDocs(docs).map((d) => d.id).join() === 'p2', 'only the newest copy is in use');
ok(v.copiesOf(docs, docs[0]).map((d) => d.id).join() === 'p1,p2', 'its copies, oldest first');

// A current and a previous passport: different numbers, both used.
docs = [passport('p1', '2026-01-01', 'X1111111'), passport('p2', '2026-02-01', 'Y2222222')];
ok(v.linkCopies(docs).length === 0 && v.currentDocs(docs).length === 2, 'two passports with different numbers are both used');
// The same passport scanned again: same number, a newer copy.
docs = [passport('p1', '2026-01-01', 'X1111111'), passport('p2', '2026-02-01', 'X 111 1111')];
ok(v.linkCopies(docs).length === 1 && v.currentDocs(docs)[0].id === 'p2', 'the same passport number again is a newer copy');
// Three bank statements reporting the same account number: all used.
const bank = (id, at) => ({ id, category: 'proof-of-funds', uploadedAt: at, sha1: id, verification: { facts: { documentNumber: '0123456789' } } });
docs = [bank('b1', '2026-01-01'), bank('b2', '2026-02-01'), bank('b3', '2026-03-01')];
ok(v.linkCopies(docs).length === 0 && v.currentDocs(docs).length === 3, 'bank statements are never merged by number');
// The team said "separate": never linked again.
docs = [passport('p1', '2026-01-01', 'X1111111'), { ...passport('p2', '2026-02-01', 'X1111111'), separateFrom: ['p1'] }];
ok(v.linkCopies(docs).length === 0, 'documents the team marked separate are not linked again');
// The checklist counts the newest copy only.
const app = { type: 'study-permit', data: {}, documents: [{ id: 'o', filename: '103 - Passport.pdf', category: 'passport' }, { id: 'n', filename: '103 - Passport - 2.pdf', category: 'passport', replaces: 'o' }] };
ok(JSON.stringify(checklistStatus(app).find((c) => c.code === '103').docIds) === '["n"]', 'the checklist shows the newest copy');

// Through the API: upload the same file twice, then the team's switch.
const PORT = 3393;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'versions-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, AUTH_SECRET: 'versions-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'), ADMIN_EMAIL: 'boss@firm.test', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', GOOGLE_SERVICE_ACCOUNT_JSON: '' },
  stdio: 'ignore',
  detached: true,
});
let cookie = '';
const call = async (method, url, body, form) => {
  const r = await fetch(BASE + url, { method, headers: form ? { cookie } : { 'Content-Type': 'application/json', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return { status: r.status, data: await r.json().catch(() => null) };
};
try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  await call('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  const id = (await call('POST', '/api/applications', { type: 'study-permit', clientNumber: 'S99998', title: 'Sara Example', representation: 'firm' })).data.application.id;
  const d = await PDFDocument.create();
  d.addPage([200, 200]);
  const bytes = Buffer.from(await d.save());
  const up = async () => {
    const fd = new FormData();
    fd.append('files', new Blob([bytes], { type: 'application/pdf' }), '103 - Passport - Sara.pdf');
    return call('POST', `/api/applications/${id}/upload`, null, fd);
  };
  await up();
  await new Promise((r) => setTimeout(r, 30));
  let r = await up();
  const [first, second] = r.data.documents;
  ok(first.filename === '103 - Passport - Sara.pdf' && second.filename === '103 - Passport - Sara - 2.pdf', `the second copy is numbered (${r.data.documents.map((x) => x.filename).join(', ')})`);
  ok(second.replaces === first.id, 'and replaces the first in use');
  r = await call('PATCH', `/api/applications/${id}/upload`, { docId: second.id, replaces: null });
  ok(!r.data.documents[1].replaces && r.data.documents[1].separateFrom?.includes(first.id), 'the team can mark it a separate document');
  r = await call('PATCH', `/api/applications/${id}/upload`, { docId: second.id, replaces: first.id });
  ok(r.data.documents[1].replaces === first.id && !(r.data.documents[1].separateFrom || []).length, 'and a newer copy again');
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(bad ? `\n${bad} FAILED` : '\nALL VERSION CHECKS PASS');
process.exit(bad ? 1 : 0);
