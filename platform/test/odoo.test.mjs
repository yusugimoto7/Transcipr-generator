// Odoo TR Visa sync against a stub Odoo (JSON-RPC): files get their card's
// number and name, the newest card wins, families share the number, new cards
// become files, closed cards are ignored, a card chosen by hand sticks.
//   npm run build && node test/odoo.test.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { loadLib } from './_load.mjs';

const PORT = 3398;
const ODOO = 3399;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

/* ------------------------------ parsing ------------------------------ */
const { parseTitle, detectType } = await loadLib('odoo.js');
let p = parseTitle('S26213 - Anahita Mousavi - Study Permit');
ok(p.number === 'S26213' && p.name === 'Anahita Mousavi' && p.rest === 'Study Permit', 'a card title splits into number, name and the rest');
p = parseTitle('Reza Karimi S26301');
ok(p.number === 'S26301' && p.name === 'Reza Karimi', 'the number may come after the name');
ok(parseTitle('27673 Vv').number === '27673', 'a number without a letter is read too');
ok(detectType('Study Permit') === 'study-permit' && detectType('Visitor visa') === 'trv-outside' && detectType('100-304') === 'owp-worker-spouse' && detectType('Nazanin') === null, 'the application type is read from words or the service code');

/* ------------------------------ stub Odoo ------------------------------ */
const projectsAsked = [];
const tasks = [
  { id: 11, name: 'S26213 - Anahita Mousavi', create_date: '2026-03-01 10:00:00', write_date: '2026-09-01 10:00:00', stage_id: [1, 'Documents Received from Client'], fold: false, tag_ids: [1], user_ids: [] },
  { id: 12, name: 'S26213 - Anahita Mousavi - 2025', create_date: '2025-10-01 10:00:00', write_date: '2025-10-01 10:00:00', stage_id: [1, 'Documents Received from Client'], fold: false, tag_ids: [], user_ids: [] },
  { id: 13, name: 'S26301 - Reza Karimi - Visitor', create_date: '2026-09-01 10:00:00', write_date: '2026-09-02 10:00:00', stage_id: [2, 'SOP Done'], fold: false, tag_ids: [], user_ids: [5] },
  { id: 14, name: 'S26302 - Nazanin Rahimi', create_date: '2026-09-10 10:00:00', write_date: '2026-09-10 10:00:00', stage_id: [3, 'Documents Prepared'], fold: false, tag_ids: [], user_ids: [] },
  { id: 15, name: 'S26100 - Old Closed', create_date: '2026-01-10 10:00:00', write_date: '2026-02-10 10:00:00', stage_id: [9, 'Done'], fold: true, tag_ids: [], user_ids: [] },
  { id: 16, name: 'S26400 - Parisa New', create_date: '2026-09-20 10:00:00', write_date: '2026-09-20 10:00:00', stage_id: [3, 'Documents Prepared'], fold: false, tag_ids: [], user_ids: [] },
  { id: 17, name: 'S26500 - Other Stage', create_date: '2026-09-21 10:00:00', write_date: '2026-09-21 10:00:00', stage_id: [4, 'Submitted'], fold: false, tag_ids: [], user_ids: [] },
];
let writes = 0;
const odoo = http.createServer(async (req, res) => {
  let b = '';
  for await (const c of req) b += c;
  const { params, id } = JSON.parse(b || '{}');
  const reply = (result) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id, result })); };
  const fail = (message) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { message, data: { message } } })); };
  if (params.service === 'common') return params.args[0] === 'firm' && params.args[2] === 'key-123' ? reply(7) : reply(false);
  const [db, uid, key, model, method, args, kwargs] = params.args;
  if (db !== 'firm' || uid !== 7 || key !== 'key-123') return fail('Access denied');
  if (!['search_read', 'read', 'fields_get'].includes(method)) { writes++; return fail('read only in this test'); }
  if (model === 'project.project') return reply([{ id: 1, name: 'Visa - PR' }, { id: 2, name: 'SUV-Biz-Team' }, { id: 3, name: 'Visa - TR' }, { id: 4, name: 'Marketing' }]);
  if (model === 'project.task' && method === 'fields_get') return reply({ name: {}, stage_id: {}, tag_ids: {}, user_ids: {}, partner_id: {}, create_date: {}, write_date: {} });
  if (model === 'project.task') {
    projectsAsked.push(JSON.stringify(args[0]));
    const openOnly = JSON.stringify(args[0]).includes('stage_id.fold');
    const rows = tasks.filter((t) => !openOnly || !t.fold).sort((a, b) => b.create_date.localeCompare(a.create_date));
    return reply(rows.map(({ fold, ...t }) => ({ ...t, partner_id: false })));
  }
  if (model === 'project.tags') return reply(args[0].map((i) => ({ id: i, name: i === 1 ? 'Study Permit' : 'Other' })));
  if (model === 'res.users') return reply(args[0].map((i) => ({ id: i, login: i === 5 ? 'maryam@firm.test' : 'x@y', email: i === 5 ? 'maryam@firm.test' : 'x@y' })));
  return fail(`unknown ${model}.${method}`);
});
await new Promise((r) => odoo.listen(ODOO, r));

/* --------------------------------- server --------------------------------- */
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'odoo-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env, AUTH_SECRET: 'odoo-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'), ADMIN_EMAIL: 'boss@firm.test',
    ODOO_URL: `http://127.0.0.1:${ODOO}`, ODOO_DB: 'firm', ODOO_USER: 'bot@firm.test', ODOO_API_KEY: 'key-123', ODOO_SYNC_MINUTES: '600',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };
}

try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const admin = client();
  await admin('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  const maryam = (await admin('POST', '/api/admin/users', { email: 'maryam@firm.test', name: 'Maryam', password: 'password123', role: 'manager' })).json.user;

  // A file made without a name or number; its intake has the name.
  const ana = (await admin('POST', '/api/applications', { type: 'study-permit' })).json.application;
  await admin('PATCH', `/api/applications/${ana.id}`, { data: { givenName: 'Anahita', familyName: 'Mousavi' } });
  let a = (await admin('GET', `/api/applications/${ana.id}`)).json.application;
  ok(a.title === 'Anahita Mousavi', 'a file without a name takes the name from its intake');
  const child = (await admin('POST', '/api/applications', { type: 'study-permit-minor', title: 'Sara Mousavi', applicantRole: 'child', groupId: ana.id })).json.application;
  const naz = (await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Nazanin Rahimi', clientNumber: 'S26302' })).json.application;

  const st = (await admin('POST', '/api/admin/odoo')).json;
  ok(projectsAsked.length > 0 && projectsAsked.every((d) => d.includes('["project_id","=",3]')), 'the "Visa - TR" project is found among the others');
  ok(!st.lastError && st.lastResult?.cards === 5, `the sync reads only the cards in Documents Received / SOP Done / Documents Prepared (${st.lastResult?.cards} of 7)`);
  a = (await admin('GET', `/api/applications/${ana.id}`)).json.application;
  ok(a.clientNumber === 'S26213' && a.odoo?.taskId === 11, 'the unnumbered file is matched by name to the newest of its two cards');
  const c = (await admin('GET', `/api/applications/${child.id}`)).json.application;
  ok(c.clientNumber === 'S26213', 'the family member gets the same client number');
  const n = (await admin('GET', `/api/applications/${naz.id}`)).json.application;
  ok(n.odoo?.taskId === 14, 'a file with a number is linked to the card with that number');

  const all = (await admin('GET', '/api/applications')).json.applications;
  const reza = all.find((x) => x.clientNumber === 'S26301');
  ok(reza && reza.title === 'Reza Karimi' && reza.type === 'trv-outside', 'a new card becomes a client file, with the type read from the card');
  ok(reza && reza.assignedTo?.some?.((u) => u === maryam.id || u?.id === maryam.id), 'the card’s assignee in Odoo is assigned on the platform');
  const parisa = all.find((x) => x.clientNumber === 'S26400');
  const parisaFull = parisa && (await admin('GET', `/api/applications/${parisa.id}`)).json.application;
  ok(parisaFull?.typeGuessed === true, 'a card that doesn’t say the type is marked for the team to check');
  ok(!all.some((x) => x.clientNumber === 'S26100') && all.filter((x) => x.clientNumber === 'S26213').length === 2, 'no file for the closed card, and no second file for the older card');
  ok(!all.some((x) => x.clientNumber === 'S26500'), 'no file for a card in another stage (Submitted)');

  const again = (await admin('POST', '/api/admin/odoo')).json;
  ok(again.lastResult?.created === 0 && again.lastResult?.linked === 0, 'a second sync changes nothing');

  // Archiving: a card that leaves the working stages hides its file; nothing is deleted.
  const countBefore = (await admin('GET', '/api/applications')).json.applications.length;
  tasks.find((t) => t.id === 13).stage_id = [4, 'Submitted'];
  tasks.find((t) => t.id === 14).stage_id = [4, 'Submitted'];
  let r = (await admin('POST', '/api/admin/odoo')).json;
  let rz = (await admin('GET', `/api/applications/${reza.id}`)).json.application;
  let nz = (await admin('GET', `/api/applications/${naz.id}`)).json.application;
  ok(r.lastResult?.archived === 2 && rz.archived?.by === 'odoo' && nz.archived?.by === 'odoo', 'files whose cards left the working stages are archived');
  ok((await admin('GET', '/api/applications')).json.applications.length === countBefore, 'archiving deletes nothing');
  tasks.find((t) => t.id === 13).stage_id = [2, 'SOP Done'];
  r = (await admin('POST', '/api/admin/odoo')).json;
  rz = (await admin('GET', `/api/applications/${reza.id}`)).json.application;
  ok(r.lastResult?.restored === 1 && !rz.archived, 'a file comes back when its card returns to a working stage');
  await admin('PATCH', `/api/applications/${naz.id}`, { archived: false });
  r = (await admin('POST', '/api/admin/odoo')).json;
  nz = (await admin('GET', `/api/applications/${naz.id}`)).json.application;
  ok(!nz.archived && r.lastResult?.archived === 0, 'a file restored by the team is not archived again');
  tasks.find((t) => t.id === 14).stage_id = [3, 'Documents Prepared'];

  const found = (await admin('GET', '/api/odoo/cards?q=Anahita')).json.cards || [];
  ok(found.length === 2, 'searching Odoo by name finds both of Anahita’s cards');
  await admin('POST', `/api/applications/${ana.id}/odoo`, { taskId: 12 });
  await admin('POST', '/api/admin/odoo');
  a = (await admin('GET', `/api/applications/${ana.id}`)).json.application;
  ok(a.odoo?.taskId === 12 && a.odoo.manual === true && a.clientNumber === 'S26213', 'a card chosen by hand stays linked after the next sync');
  ok(writes === 0, 'nothing is ever written to Odoo');
} catch (e) {
  failures++;
  console.log('FAIL ', e.message, logs.slice(-1500));
} finally {
  try { process.kill(-server.pid); } catch {}
  odoo.close();
}
console.log(failures ? `\n${failures} failure(s)` : '\nALL ODOO CHECKS PASS');
process.exit(failures ? 1 : 0);
