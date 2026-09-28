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
  { id: 14, name: 'S26302 - Nazanin Rahimi', create_date: '2026-09-10 10:00:00', write_date: '2026-09-10 10:00:00', stage_id: [3, 'Documents Prepared'], fold: false, tag_ids: [], user_ids: [], partner_id: [55, 'Nazanin Rahimi'], email_from: 'Nazanin <Naz@Mail.test>' },
  { id: 15, name: 'S26100 - Old Closed', create_date: '2026-01-10 10:00:00', write_date: '2026-02-10 10:00:00', stage_id: [9, 'Done'], fold: true, tag_ids: [], user_ids: [] },
  { id: 16, name: 'S26400 - Parisa New', create_date: '2026-09-20 10:00:00', write_date: '2026-09-20 10:00:00', stage_id: [3, 'Documents Prepared'], fold: false, tag_ids: [], user_ids: [] },
  { id: 18, name: '000 Template', create_date: '2026-09-22 10:00:00', write_date: '2026-09-22 10:00:00', stage_id: [3, 'Documents Prepared'], fold: false, tag_ids: [], user_ids: [] },
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
  if (model === 'project.task' && method === 'fields_get') return reply({ name: {}, stage_id: {}, tag_ids: {}, user_ids: {}, partner_id: {}, email_from: {}, create_date: {}, write_date: {} });
  if (model === 'project.task') {
    projectsAsked.push(JSON.stringify(args[0]));
    const openOnly = JSON.stringify(args[0]).includes('stage_id.fold');
    const rows = tasks.filter((t) => !openOnly || !t.fold).sort((a, b) => b.create_date.localeCompare(a.create_date));
    return reply(rows.map(({ fold, ...t }) => ({ ...t, partner_id: t.partner_id || false, email_from: t.email_from || false })));
  }
  if (model === 'project.tags') return reply(args[0].map((i) => ({ id: i, name: i === 1 ? 'Study Permit' : 'Other' })));
  if (model === 'res.partner') return reply(args[0].map((i) => ({ id: i, email: i === 55 ? 'naz.partner@mail.test' : false })));
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
  ok(!st.lastError && st.lastResult?.cards === 6, `the sync reads only the cards in Documents Received / SOP Done / Documents Prepared (${st.lastResult?.cards} of 8)`);
  a = (await admin('GET', `/api/applications/${ana.id}`)).json.application;
  ok(a.clientNumber === 'S26213' && a.odoo?.taskId === 11, 'the unnumbered file is matched by name to the newest of its two cards');
  const c = (await admin('GET', `/api/applications/${child.id}`)).json.application;
  ok(c.clientNumber === 'S26213', 'the family member gets the same client number');
  const n = (await admin('GET', `/api/applications/${naz.id}`)).json.application;
  ok(n.odoo?.taskId === 14, 'a file with a number is linked to the card with that number');
  ok((n.odoo?.emails || []).sort().join() === 'naz.partner@mail.test,naz@mail.test', `the client's email addresses on the card are kept for matching their emails (${n.odoo?.emails})`);

  const all = (await admin('GET', '/api/applications')).json.applications;
  const reza = all.find((x) => x.clientNumber === 'S26301');
  ok(reza && reza.title === 'Reza Karimi' && reza.type === 'trv-outside', 'a new card becomes a client file, with the type read from the card');
  ok(reza && reza.assignedTo?.some?.((u) => u === maryam.id || u?.id === maryam.id), 'the card’s assignee in Odoo is assigned on the platform');
  const parisa = all.find((x) => x.clientNumber === 'S26400');
  const parisaFull = parisa && (await admin('GET', `/api/applications/${parisa.id}`)).json.application;
  ok(parisaFull?.typeGuessed === true, 'a card that doesn’t say the type is marked for the team to check');
  ok(!all.some((x) => x.clientNumber === 'S26100') && all.filter((x) => x.clientNumber === 'S26213').length === 2, 'no file for the closed card, and no second file for the older card');
  ok(!all.some((x) => x.clientNumber === 'S26500'), 'no file for a card in another stage (Submitted)');
  ok(!all.some((x) => /template/i.test(x.title)), 'no file for a template card');

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

  // Admin → Files → Unused: empty files that are archived, templates or unnumbered can be removed.
  const empty = (await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Test File' })).json.application;
  const tmpl = (await admin('POST', '/api/applications', { type: 'trv-outside', title: 'ApplyBoard Template' })).json.application;
  const filled = (await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Draft Without Number' })).json.application;
  await admin('PATCH', `/api/applications/${filled.id}`, { data: { givenName: 'Kian' } });
  tasks.find((t) => t.id === 13).stage_id = [4, 'Submitted'];
  await admin('POST', '/api/admin/odoo');
  let list = (await admin('GET', '/api/admin/applications')).json.applications;
  const why = (id) => list.find((x) => x.id === id)?.unused;
  ok(why(empty.id) && why(tmpl.id) === 'Template' && why(reza.id)?.startsWith('Archived'), 'empty unnumbered, template and archived-empty files are listed as unused');
  ok(!why(filled.id) && !why(naz.id) && !why(parisa.id), 'files with content and live clients are not unused');
  const staff = client();
  await staff('POST', '/api/auth/login', { email: 'maryam@firm.test', password: 'password123' });
  ok((await staff('POST', '/api/admin/applications/cleanup', { ids: [empty.id] })).status === 403, 'only an admin can remove files');
  const cl = (await admin('POST', '/api/admin/applications/cleanup', { ids: [empty.id, tmpl.id, reza.id, filled.id, naz.id] })).json;
  list = (await admin('GET', '/api/admin/applications')).json.applications;
  ok(cl.deleted === 3 && cl.kept.length === 2 && !list.some((x) => [empty.id, tmpl.id, reza.id].includes(x.id)), 'the unused files are removed; a file with content or a live client is kept even if asked');
  const kept = JSON.parse(await fs.readFile(path.join(dataDir, 'deleted', `${reza.id}.json`), 'utf8'));
  ok(kept.deletedAt && kept.title === 'Reza Karimi', 'a removed file is kept aside in DATA_DIR/deleted, not erased');
  tasks.find((t) => t.id === 13).stage_id = [2, 'SOP Done'];
  r = (await admin('POST', '/api/admin/odoo')).json;
  list = (await admin('GET', '/api/applications')).json.applications;
  ok(r.lastResult?.created === 1 && list.some((x) => x.clientNumber === 'S26301' && x.id !== reza.id), 'if its card comes back to work, the client gets a new file');
  // Team notes: account managers and admins write them; the writer (or an admin) removes them; clients never see them.
  await admin('POST', `/api/admin/applications/${naz.id}/assign`, { assignedTo: [maryam.id] });
  const mar = client();
  await mar('POST', '/api/auth/login', { email: 'maryam@firm.test', password: 'password123' });
  let nr = await mar('POST', `/api/applications/${naz.id}/notes`, { action: 'add', section: 'intake', text: 'Spouse employer to confirm by phone.' });
  ok(nr.status === 200 && nr.json.notes[0].by.name === 'Maryam' && nr.json.notes[0].section === 'intake' && nr.json.notes[0].at, 'an account manager adds a note; it keeps the writer and the time');
  nr = await admin('POST', `/api/applications/${naz.id}/notes`, { action: 'add', section: 'overview', text: 'Client prefers WhatsApp.' });
  const bossNote = nr.json.notes.find((x) => x.text === 'Client prefers WhatsApp.');
  ok((await mar('POST', `/api/applications/${naz.id}/notes`, { action: 'delete', id: bossNote.id })).status === 403, "an account manager cannot remove someone else's note");
  ok((await admin('POST', `/api/applications/${naz.id}/notes`, { action: 'add', docId: 'nope', text: 'x' })).status === 400, 'a note on a document that is not on the file is refused');
  nr = await admin('POST', `/api/applications/${naz.id}/notes`, { action: 'delete', id: nr.json.notes.find((x) => x.by.name === 'Maryam').id });
  ok(nr.status === 200 && nr.json.notes.length === 1, 'an admin can remove any note');
  // Mentions notify, and bring an account manager who is not on the file into it.
  const rezaU = (await admin('POST', '/api/admin/users', { email: 'reza@firm.test', name: 'Reza', password: 'password123', role: 'manager' })).json.user;
  const rz2 = client();
  await rz2('POST', '/api/auth/login', { email: 'reza@firm.test', password: 'password123' });
  ok((await rz2('GET', `/api/applications/${naz.id}`)).status === 403, 'Reza cannot open the file before he is mentioned');
  nr = await mar('POST', `/api/applications/${naz.id}/notes`, { action: 'add', section: 'overview', text: '@Reza please check the bank letter', mentions: [rezaU.id] });
  const mNote = nr.json.notes.find((x) => x.text.startsWith('@Reza'));
  ok(mNote?.mentions?.[0]?.id === rezaU.id, 'the note records who was mentioned');
  let inbox = (await rz2('GET', '/api/notifications')).json;
  ok(inbox.unread === 1 && inbox.items[0].kind === 'mention' && inbox.items[0].link === `/application/${naz.id}#notes:${mNote.id}` && /Maryam mentioned you/.test(inbox.items[0].text), 'the mentioned colleague gets a notification that opens the note');
  ok((await rz2('GET', `/api/applications/${naz.id}`)).status === 200, 'a mentioned account manager is added to the file so the link opens');
  ok(!(await mar('GET', '/api/notifications')).json.items.some((x) => x.kind === 'mention'), 'the writer is not notified of their own note');
  inbox = (await rz2('POST', '/api/notifications', { action: 'read' })).json;
  ok(inbox.unread === 0 && inbox.items[0].readAt, 'notifications can be marked read');
  ok((await rz2('GET', '/api/team')).json.team.some((u) => u.id === maryam.id), 'the team list for @mentions');
  // Being given a file.
  const parisaApp = (await admin('GET', '/api/applications')).json.applications.find((x) => x.clientNumber === 'S26400');
  await admin('POST', `/api/admin/applications/${parisaApp.id}/assign`, { assignedTo: [rezaU.id] });
  inbox = (await rz2('GET', '/api/notifications')).json;
  ok(inbox.unread === 1 && inbox.items[0].kind === 'assigned' && /gave you S26400/.test(inbox.items[0].text), 'an account manager is told when a file is given to them');

  // Three layers: super admin (ADMIN_EMAIL), admin, account manager.
  let ul = (await admin('GET', '/api/admin/users')).json;
  ok(ul.me.level === 'superadmin', 'the ADMIN_EMAIL account is the super admin');
  const negar = (await admin('POST', '/api/admin/users', { email: 'n.abedi@firm.test', name: 'Negar', password: 'password123', role: 'admin' })).json.user;
  ok(negar?.level === 'admin', 'the super admin creates an admin');
  const ng = client();
  await ng('POST', '/api/auth/login', { email: 'n.abedi@firm.test', password: 'password123' });
  ok((await ng('POST', '/api/admin/users', { email: 'x@firm.test', name: 'X', password: 'password123', role: 'admin' })).status === 403, 'an admin cannot create admins');
  const hamzeh = (await ng('POST', '/api/admin/users', { email: 'm.hamzeh@firm.test', name: 'Hamzeh', password: 'password123', role: 'manager' })).json.user;
  ok(hamzeh?.level === 'manager', 'an admin creates an account manager');
  const bossId = ul.users.find((u) => u.email === 'boss@firm.test').id;
  ok((await ng('PATCH', '/api/admin/users', { id: bossId, active: false })).status === 403, 'an admin cannot touch the super admin');
  ok((await ng('PATCH', '/api/admin/users', { id: hamzeh.id, role: 'admin' })).status === 403, 'an admin cannot promote someone to admin');
  ok((await admin('PATCH', '/api/admin/users', { id: bossId, role: 'admin' })).status === 400, 'the configured super admin cannot be demoted');
  const hz = client();
  await hz('POST', '/api/auth/login', { email: 'm.hamzeh@firm.test', password: 'password123' });
  ok((await hz('GET', `/api/applications/${naz.id}`)).status === 403 && (await ng('GET', `/api/applications/${naz.id}`)).status === 200, 'an admin opens every file; a new account manager none');
  let ac = await ng('POST', '/api/admin/access', { userId: hamzeh.id, add: [naz.id] });
  ok(ac.status === 200 && ac.json.added === 1 && (await hz('GET', `/api/applications/${naz.id}`)).status === 200, 'an admin gives an account manager a file; they can open it');
  ok((await hz('GET', '/api/notifications')).json.items.some((x) => x.kind === 'assigned'), 'and the manager is notified');
  ac = await ng('POST', '/api/admin/access', { userId: hamzeh.id, remove: [naz.id] });
  ok(ac.json.removed === 1 && (await hz('GET', `/api/applications/${naz.id}`)).status === 403, 'removing access closes the file for them');
  ok((await ng('POST', '/api/admin/access', { userId: negar.id, add: [naz.id] })).status === 400, 'access is set for account managers only (admins see everything)');
  ok((await hz('GET', '/api/admin/users')).status === 403, 'an account manager cannot open the admin panel');
  // A super admin can limit an admin to chosen files (by default admins see everything).
  ok((await ng('PATCH', '/api/admin/users', { id: negar.id, allFiles: false })).status === 403, 'an admin cannot limit their own (or another admin’s) files');
  ok((await admin('PATCH', '/api/admin/users', { id: negar.id, allFiles: false })).status === 200, 'the super admin limits an admin');
  ok((await ng('GET', `/api/applications/${naz.id}`)).status === 403, 'the limited admin no longer opens files not given to them');
  const ngList = (await ng('GET', '/api/admin/applications')).json.applications;
  ok(ngList.length === 0, 'and the admin panel lists only their files');
  await admin('POST', '/api/admin/access', { userId: negar.id, add: [naz.id] });
  ok((await ng('GET', `/api/applications/${naz.id}`)).status === 200, 'the super admin gives the admin a file');
  await admin('PATCH', '/api/admin/users', { id: negar.id, allFiles: true });
  ok((await ng('GET', '/api/admin/applications')).json.applications.length > 1, 'and can restore all files');
  // New files go to account managers automatically (unless turned off for them).
  let fresh = (await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Brand New', clientNumber: 'S29001' })).json.application;
  ok((await hz('GET', `/api/applications/${fresh.id}`)).status === 200, 'a new file is open to account managers by default');
  await ng('PATCH', '/api/admin/users', { id: hamzeh.id, autoNewFiles: false });
  fresh = (await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Another New', clientNumber: 'S29002' })).json.application;
  ok((await hz('GET', `/api/applications/${fresh.id}`)).status === 403, 'unless an admin turns that off for them');

  // Team activity log.
  await mar('PATCH', `/api/applications/${naz.id}`, { data: { givenName: 'Nazanin' } });
  await mar('PATCH', `/api/applications/${naz.id}`, { data: { familyName: 'Rahimi' } });
  let act = (await admin('GET', `/api/applications/${naz.id}/activity`)).json.activity;
  const intakeEntry = act.find((x) => x.action === 'Edited the intake' && x.by.name === 'Maryam');
  ok(intakeEntry && intakeEntry.items.includes('Given name(s)') && intakeEntry.items.includes('Family name (surname)') && intakeEntry.by.level === 'manager', 'intake edits are logged with who made them, merged into one entry');
  ok(act.some((x) => x.action === 'Added a note' && x.by.name === 'Maryam') && act.some((x) => x.action === 'Gave access to the file' && x.by.name === 'Negar'), 'notes and access changes are logged, with the person');
  ok((await hz('GET', `/api/applications/${naz.id}/activity`)).status === 403, 'someone without access to the file cannot read its activity');

  const { notesText } = await loadLib('notes.js');
  const withNotes = (await admin('GET', `/api/applications/${naz.id}`)).json.application;
  ok(/WhatsApp/.test(notesText(withNotes)) && /respect them/.test(notesText(withNotes)), 'the notes are given to the AI as the team’s decisions');
  const { forViewer } = await loadLib('emails.js');
  ok(!('notes' in forViewer(withNotes, false)) && forViewer(withNotes, true).notes.length >= 1, 'clients never receive the team’s notes');
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
