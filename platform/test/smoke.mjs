// End-to-end smoke test of roles, assignment, concurrency and type-driven
// generation, against a built server and a stub OpenAI endpoint.
//   npm run build && node test/smoke.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const PORT = 3311;
const STUB = 3312;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// --- stub OpenAI: returns a plausible letter or JSON depending on the prompt
const stub = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b || '{}');
    const wantsJson = body.response_format?.type === 'json_object';
    const content = wantsJson ? '{"readinessScore":70,"summary":"ok","missingDocuments":[],"weaknesses":[],"strengths":["x"]}' : 'Dear Visa Officer,\n\n**Introduction**\nThis is a stub letter.\n\nSincerely, Test';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => stub.listen(STUB, r));

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, AUTH_SECRET: 'smoke-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'),
         OPENAI_API_KEY: 'stub', OPENAI_BASE_URL: `http://127.0.0.1:${STUB}/v1`, ADMIN_EMAIL: 'boss@firm.test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));

const waitUp = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start\n' + logs); };

// tiny cookie-jar client
function client() {
  let cookie = '';
  return async (method, url, body, extra = {}) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', cookie, ...extra }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data, headers: r.headers };
  };
}

try {
  await waitUp();
  const admin = client(), mgr = client(), mgr2 = client(), applicant = client();

  // Admin bootstrap by email
  let r = await admin('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  ok(r.status === 201, 'admin registers');
  r = await admin('GET', '/api/admin/users');
  ok(r.status === 200 && r.data.users[0].role === 'admin', 'ADMIN_EMAIL account has admin role');

  // Admin creates two managers
  r = await admin('POST', '/api/admin/users', { email: 'ana@firm.test', name: 'Ana', password: 'password123', role: 'manager' });
  ok(r.status === 201 && r.data.user.role === 'manager', 'admin creates manager Ana');
  const anaId = r.data.user.id;
  r = await admin('POST', '/api/admin/users', { email: 'ben@firm.test', name: 'Ben', password: 'password123', role: 'manager' });
  const benId = r.data.user.id;
  await mgr('POST', '/api/auth/login', { email: 'ana@firm.test', password: 'password123' });
  await mgr2('POST', '/api/auth/login', { email: 'ben@firm.test', password: 'password123' });

  // Manager cannot reach admin API
  r = await mgr('GET', '/api/admin/users');
  ok(r.status === 403, 'manager blocked from admin API');

  // Admin creates a spousal OWP file for a client
  r = await admin('POST', '/api/applications', { type: 'sowp-inside', title: 'Maryam O.', clientNumber: 'S26213', representation: 'firm' });
  ok(r.status === 201 && r.data.application.type === 'sowp-inside' && r.data.application.clientNumber === 'S26213', 'admin creates SOWP file with client number');
  const appId = r.data.application.id;

  // Not assigned yet: Ana can't see or open it
  r = await mgr('GET', '/api/applications');
  ok(r.data.applications.length === 0, 'unassigned manager sees no files');
  r = await mgr('GET', `/api/applications/${appId}`);
  ok(r.status === 403, 'unassigned manager cannot open the file');

  // Assign Ana + Ben
  r = await admin('POST', `/api/admin/applications/${appId}/assign`, { assignedTo: [anaId, benId] });
  ok(r.status === 200 && r.data.assignedTo.length === 2, 'admin assigns two managers');
  r = await mgr('GET', '/api/applications');
  ok(r.data.applications.length === 1 && r.data.applications[0].assignedTo.length === 2, 'assigned manager sees the file with co-assignees');

  // Concurrent editing: both load version 1; Ana saves; Ben's stale save is rejected
  const v = (await mgr('GET', `/api/applications/${appId}`)).data.application.dataVersion || 0;
  r = await mgr('PATCH', `/api/applications/${appId}`, { data: { givenName: 'Maryam' }, baseDataVersion: v });
  ok(r.status === 200 && r.data.application.dataVersion === v + 1, 'first save bumps the intake version');
  r = await mgr2('PATCH', `/api/applications/${appId}`, { data: { givenName: 'WRONG' }, baseDataVersion: v });
  ok(r.status === 409 && r.data.conflict && r.data.application.data.givenName === 'Maryam', 'stale save rejected with 409 and latest copy');
  r = await mgr2('PATCH', `/api/applications/${appId}`, { data: { familyName: 'Omidbeygi' }, baseDataVersion: v + 1 });
  ok(r.status === 200 && r.data.application.data.givenName === 'Maryam' && r.data.application.data.familyName === 'Omidbeygi', 'save on the fresh version merges');

  // Type-driven generation for a non-study type
  r = await mgr('POST', `/api/applications/${appId}/generate`, { docs: ['sop', 'submission-letter', 'imm5710'] });
  const keys = (r.data?.produced || []).map((p) => p.key);
  ok(r.status === 200 && keys.includes('sop') && keys.includes('submission-letter') && keys.includes('imm5710'), `SOWP generates its letters + IMM 5710 data sheet (${keys.join(',')})`);
  ok(r.data.produced.find((p) => p.key === 'sop')?.filename.startsWith('Statement of Purpose'), 'primary letter title is the SOWP one');
  // Generating (or uploading / importing) changes the file but not the intake
  // answers, so an intake save made on the earlier answers must still go through.
  r = await mgr2('PATCH', `/api/applications/${appId}`, { data: { cityOfBirth: 'Tehran' }, baseDataVersion: v + 2 });
  ok(r.status === 200 && r.data.application.data.cityOfBirth === 'Tehran', 'generating files does not block the next intake save');

  // Guided-letter tab for a TRV type uses the visit question set
  r = await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Ali R.', clientNumber: 'S26186' });
  const trvId = r.data.application.id;
  r = await admin('POST', `/api/applications/${trvId}/sop`, { answers: { purpose: { selected: ['Tourism'], note: '' }, whyCanada: { selected: ['x'] } } });
  ok(r.status === 200 && r.data.answers.purpose && !r.data.answers.whyCanada, 'TRV builder keeps visit questions, drops study ones');
  ok(r.data.generated.find((g) => g.key === 'sop')?.filename.startsWith('Purpose of Travel'), 'TRV primary letter is Purpose of Travel');

  // --- the three inside-Canada types are genuinely distinct ------------------
  const mk = async (type, title) => (await admin('POST', '/api/applications', { type, title })).data.application.id;
  const spInsideId = await mk('study-permit-inside', 'SP inside');
  const trvInId = await mk('trv-inside', 'TRV inside');
  const vrId = await mk('visitor-record', 'Visitor record');

  r = await admin('POST', `/api/applications/${spInsideId}/generate`, { docs: ['sop', 'imm5709'] });
  let k = (r.data?.produced || []).map((p) => p.key);
  ok(r.status === 200 && k.includes('imm5709'), 'study permit inside uses IMM 5709');

  r = await admin('POST', `/api/applications/${trvInId}/generate`, { docs: ['imm5257'] });
  ok(r.status === 200 && r.data.produced.some((p) => p.key === 'imm5257'), 'TRV inside uses IMM 5257');
  r = await admin('POST', `/api/applications/${trvInId}/generate`, { docs: ['imm5708'] });
  ok(r.status === 502 || !(r.data?.produced || []).some((p) => p.key === 'imm5708'), 'TRV inside refuses IMM 5708');

  r = await admin('POST', `/api/applications/${vrId}/generate`, { docs: ['imm5708'] });
  ok(r.status === 200 && r.data.produced.some((p) => p.key === 'imm5708'), 'visitor record uses IMM 5708');
  r = await admin('POST', `/api/applications/${vrId}/generate`, { docs: ['imm5257'] });
  ok(r.status === 502 || !(r.data?.produced || []).some((p) => p.key === 'imm5257'), 'visitor record refuses IMM 5257');

  // Different primary letters, and question sets that do not bleed across types
  r = await admin('POST', `/api/applications/${vrId}/sop`, { answers: { reason: { selected: ['Medical treatment or recovery'] }, whyProgram: { selected: ['nope'] } } });
  ok(r.data.answers.reason && !r.data.answers.whyProgram, 'visitor record keeps its own questions only');
  ok(r.data.generated.find((g) => g.key === 'sop')?.filename.startsWith('Letter of Explanation'), 'visitor record primary letter is the extension letter');
  r = await admin('POST', `/api/applications/${trvInId}/sop`, { answers: { purpose: { selected: ['Tourism'] } } });
  ok(r.data.generated.find((g) => g.key === 'sop')?.filename.startsWith('Purpose of Travel'), 'TRV inside primary letter is Purpose of Travel');
  r = await admin('POST', `/api/applications/${spInsideId}/sop`, { answers: { reason: { selected: ['More time to finish my current program'] } } });
  ok(r.data.generated.find((g) => g.key === 'sop')?.filename.startsWith('Statement of Purpose'), 'study permit inside primary letter is a Statement of Purpose');

  // Self-registered applicant: no rep documents, own files only
  r = await applicant('POST', '/api/auth/register', { email: 'client@x.test', password: 'password123', name: 'Client' });
  r = await applicant('POST', '/api/applications', { type: 'pgwp', clientNumber: 'HACK', representation: 'firm' });
  ok(r.data.application.representation === 'self' && r.data.application.clientNumber === '', 'applicant cannot set client number / firm representation');
  r = await applicant('GET', `/api/applications/${appId}`);
  ok(r.status === 403, "applicant cannot open another client's file");

  // Deactivation locks the account out
  r = await admin('PATCH', '/api/admin/users', { id: benId, active: false });
  ok(r.status === 200, 'admin deactivates Ben');
  r = await mgr2('GET', '/api/applications');
  ok(r.status === 403, 'deactivated manager is locked out');
  r = await admin('PATCH', '/api/admin/users', { id: r.data ? benId : benId, active: true });

  // Admin page renders for admin, redirects for manager
  const pageA = await fetch(`${BASE}/admin`, { headers: { cookie: (await admin('GET', '/api/health')).headers && '' } });
  r = await admin('GET', '/admin');
  ok(r.status === 200, 'admin page renders for admin');
  r = await mgr('GET', '/admin');
  ok(r.status === 307 || r.status === 302, 'admin page redirects a manager');
} catch (e) {
  console.error('ERROR', e);
  failures++;
} finally {
  server.kill('SIGKILL');
  stub.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nALL SMOKE CHECKS PASS');
if (failures) console.log(logs.slice(-3000));
process.exit(failures ? 1 : 0);
