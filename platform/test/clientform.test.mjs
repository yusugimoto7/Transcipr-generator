// The client questionnaire: pre-fill from the intake, checks, the mapping back
// to the intake, and the link → save → submit → review → accept flow against a
// built server.   npm run build && node test/clientform.test.mjs
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { loadLib } from './_load.mjs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const cf = await loadLib('clientForm.js');

// --- pre-fill: what the intake already has (fictional person)
const intake = {
  givenName: 'Sara', familyName: 'Example', dob: '1990-04-12', countryOfBirth: 'Iran', cityOfBirth: 'Shiraz',
  passportNumber: 'X00000000', passportCountry: 'Iran', maritalStatus: 'Married', spouseGivenName: 'Ali', spouseFamilyName: 'Example',
  jobs: [{ from: '2020-01', to: '', occupation: 'Accountant', employer: 'Demo Co', city: 'Shiraz', country: 'Iran' }],
  immigrationApps: [{ country: 'Germany', kind: 'Visitor visa', applied: '2023-02', result: 'Refused', decided: '2023-04', details: '' }],
};
const pre = cf.prefill(intake);
ok(pre.givenName === 'Sara' && pre.dob === '1990-04-12' && pre.birthCity === 'Shiraz', 'pre-fills names and date of birth from the intake');
ok(pre.passportNumber === 'X00000000' && pre.marital === 'Married' && pre.spouseGivenName === 'Ali', 'pre-fills passport and spouse');
ok(pre.jobs?.[0]?.title === 'Accountant' && pre.jobs[0].company === 'Demo Co', 'pre-fills jobs');
ok(pre.refused === true && pre.refusals?.[0]?.country === 'Germany', 'pre-fills refusals');

// --- checks
ok(cf.answerProblem({ type: 'text', latin: true }, 'سارا') !== null, 'Persian letters refused in an English-only answer');
ok(cf.answerProblem({ type: 'month', notFuture: true }, '2999-01') !== null, 'future month refused');
ok(cf.answerProblem({ type: 'date', notFuture: true }, '2999-01-01') !== null, 'future date refused');
ok(cf.answerProblem({ type: 'email' }, 'not-an-email') !== null, 'bad email refused');
ok(cf.clientProblems({}).length > 10, 'an empty questionnaire lists what is missing');
const bilingual = cf.clientProblems({})[0];
ok(bilingual.fa && bilingual.en, 'problems are in Persian and English');

// A complete set of answers (fictional): every yes/no "no" except the ones with rows.
const full = {
  ...pre,
  sex: 'F', email: 'sara@example.test', mobile: '+98 912 000 0000', addressStreet: '1 Example St', addressCity: 'Shiraz', addressPostal: '00000', addressCountry: 'Iran',
  passportIssue: '2022-01-01', passportExpiry: '2032-01-01',
  spouseDob: '1988-02-02', marriageDate: '2015-06-06', previouslyMarried: false, hasChildren: false, hasSiblings: false,
  education: [{ level: 'Bachelor', school: 'Shiraz University', field: 'Accounting', city: 'Shiraz', country: 'Iran', from: '2008-09', to: '2012-06' }],
  hasLanguageTest: false, served: false, travelled: false,
  refusals: [{ country: 'Germany', kind: 'Visitor visa', decided: '2023-04' }], canadaFile: false,
  tb: false, medical: false, refusedEntry: true, overstay: false, appliedCanada: false, historyDetails: 'German visitor visa refused in April 2023.',
  criminal: false, organization: false, illTreatment: false,
};
// Fill whatever else is required with a neutral value, so the test follows the form.
for (const p of cf.clientProblems(full)) {
  if (p.row != null) continue;
  const f = cf.CLIENT_SECTIONS.flatMap((s) => s.fields).find((x) => x.id === p.id);
  if (!f) continue;
  full[p.id] = f.type === 'yesno' ? false : f.type === 'select' ? f.options[0].v : f.type === 'date' ? '1960-01-01' : f.type === 'month' ? '2000-01' : 'Example';
}
const left = cf.clientProblems(full);
ok(left.length === 0, `complete answers pass the checks${left.length ? ` (left: ${left.map((x) => x.en).join('; ')})` : ''}`);
ok(cf.clientProgress(full) === 1, 'progress is 100% when complete');

// --- mapping back to the intake
const mapped = cf.toIntake(full);
ok(mapped.givenName === 'Sara' && mapped.cityOfBirth === 'Shiraz', 'maps names and place of birth back');
ok(mapped.highestEducation && mapped.lastInstitution === 'Shiraz University' && mapped.lastEduFrom === '2008-09' && mapped.lastEduCity === 'Shiraz', 'maps education to the intake fields');
ok(mapped.jobs?.[0]?.occupation === 'Accountant', 'maps jobs to intake rows');
ok(mapped.immigrationApps?.[0]?.result === 'Refused' && mapped.immigrationApps[0].country === 'Germany', 'maps refusals to the immigration history');
ok(mapped.previousRefusal === true && /German/.test(mapped.refusalDetails || ''), 'maps the refusal answer and details');
ok(mapped.phoneCountryCode === '98' && mapped.phoneNumber === '9120000000', 'splits the phone number');
ok(!('spouseGivenName' in cf.toIntake({ ...full, marital: 'Single' })), 'a hidden follow-up gives nothing');
ok(Object.keys(cf.cleanAnswers({ givenName: 'A', bogus: 'x', __proto__: { y: 1 } })).every((k) => k !== 'bogus'), 'unknown answers are dropped');

// --- end to end against the built server
const PORT = 3391;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cq-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, AUTH_SECRET: 'cq-secret-value-at-least-32-characters', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'), ADMIN_EMAIL: 'boss@firm.test', OPENAI_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let data = null;
    try { data = await r.json(); } catch {}
    return { status: r.status, data };
  };
}
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  const admin = client();
  const anon = client();
  await admin('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  let r = await admin('POST', '/api/applications', { type: 'owp-outside', title: 'Sara Example', clientNumber: 'S99999', representation: 'firm' });
  const id = r.data.application.id;
  await admin('PATCH', `/api/applications/${id}`, { data: intake });

  r = await admin('GET', `/api/applications/${id}/client-form`);
  ok(r.status === 200 && r.data.link === null && r.data.form === null, 'no link at first');
  r = await anon('GET', `/api/applications/${id}/client-form`);
  ok(r.status === 401 || r.status === 403, 'the team view needs a staff login');

  r = await admin('POST', `/api/applications/${id}/client-form`, { action: 'link' });
  const url = r.data.link?.url || '';
  const token = decodeURIComponent(url.split('/q/')[1] || '');
  ok(r.status === 200 && token.startsWith(`${id}.`) && token.length > 30, 'makes a link');

  r = await anon('GET', `/api/q/${encodeURIComponent(token)}`);
  ok(r.status === 200 && r.data.answers.givenName === 'Sara' && r.data.status === 'new', 'the link opens the pre-filled questionnaire without a login');
  ok(!JSON.stringify(r.data).includes('clientNumber') && !('data' in r.data), 'the client sees only the questionnaire');
  r = await anon('GET', `/api/q/${encodeURIComponent(`${id}.wrongsecretwrongsecretwrongsecret`)}`);
  ok(r.status === 404, 'a wrong secret is refused');
  const page = await fetch(`${BASE}/q/${encodeURIComponent(token)}`);
  const html = await page.text();
  ok(page.status === 200 && /dir="rtl"/.test(html) && html.includes('پرسشنامه'), 'the page opens in Persian, right to left');

  r = await anon('PUT', `/api/q/${encodeURIComponent(token)}`, { answers: { email: 'sara@example.test', bogus: 1 } });
  ok(r.status === 200, 'saves a draft');
  r = await anon('GET', `/api/q/${encodeURIComponent(token)}`);
  ok(r.data.answers.email === 'sara@example.test' && r.data.answers.givenName === 'Sara' && !('bogus' in r.data.answers), 'the draft keeps the pre-fill and drops unknown answers');

  r = await anon('POST', `/api/q/${encodeURIComponent(token)}`, { answers: { email: 'x@example.test' }, agree: true, name: 'Sara Example' });
  ok(r.status === 422 && r.data.problems?.length > 0, 'cannot submit with answers missing');
  r = await anon('POST', `/api/q/${encodeURIComponent(token)}`, { answers: full, agree: false, name: 'Sara Example' });
  ok(r.status === 409, 'cannot submit without the confirmation');
  r = await anon('POST', `/api/q/${encodeURIComponent(token)}`, { answers: full, agree: true, name: 'Sara Example' });
  ok(r.status === 200 && r.data.status === 'submitted' && r.data.confirmation?.name === 'Sara Example', 'submits with the confirmation');
  r = await anon('PUT', `/api/q/${encodeURIComponent(token)}`, { answers: { email: 'changed@example.test' } });
  ok(r.status === 409, 'no changes after submitting');
  r = await anon('GET', `/api/q/${encodeURIComponent(token)}`);
  ok(r.status === 200 && r.data.status === 'submitted' && r.data.answers.email === 'sara@example.test', 'the link still opens, read-only');

  r = await admin('GET', `/api/applications/${id}/client-form`);
  ok(r.data.form.status === 'submitted' && r.data.form.confirmation.name === 'Sara Example', 'the team sees the submission and confirmation');
  const rows = r.data.review;
  const emailRow = rows.find((x) => x.id === 'email');
  ok(emailRow && !emailRow.same, 'review shows a new answer next to the intake');
  ok(rows.find((x) => x.id === 'givenName')?.same, 'review marks unchanged answers');
  r = await admin('GET', `/api/applications/${id}`);
  ok(!r.data.application.data.email, 'nothing reaches the intake before the team accepts');

  r = await admin('POST', `/api/applications/${id}/client-form`, { action: 'accept', ids: ['email', 'lastInstitution', 'lastEduFrom', 'jobs'] });
  ok(r.status === 200 && r.data.data.email === 'sara@example.test' && r.data.data.lastInstitution === 'Shiraz University', 'accepting writes the answers into the intake');
  ok(r.data.review.find((x) => x.id === 'email')?.accepted, 'accepted answers are marked');
  r = await admin('GET', `/api/applications/${id}`);
  ok(r.data.application.data.email === 'sara@example.test', 'the accepted answer is saved');

  r = await admin('POST', `/api/applications/${id}/client-form`, { action: 'reopen' });
  ok(r.data.form.status === 'draft', 'the team can reopen it');
  r = await anon('PUT', `/api/q/${encodeURIComponent(token)}`, { answers: { addressCity: 'Tehran' } });
  ok(r.status === 200, 'the client can change it again after reopening');

  r = await admin('POST', `/api/applications/${id}/client-form`, { action: 'revoke' });
  r = await anon('GET', `/api/q/${encodeURIComponent(token)}`);
  ok(r.status === 410, 'a turned-off link stops working');
  r = await admin('POST', `/api/applications/${id}/client-form`, { action: 'link' });
  const token2 = decodeURIComponent(r.data.link.url.split('/q/')[1]);
  ok(token2 !== token && (await anon('GET', `/api/q/${encodeURIComponent(token2)}`)).status === 200, 'a new link works and keeps the answers');
} catch (e) {
  failures++;
  console.log('FAIL ', e.stack, '\n', logs.slice(-2000));
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch { server.kill('SIGKILL'); }
  await fs.rm(dataDir, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} failure(s)` : '\nAll client questionnaire tests passed.');
process.exit(failures ? 1 : 0);
