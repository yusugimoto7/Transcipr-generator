// End-to-end test of IRCC checklist tracking, against a built server, a stub
// IRCC (canada.ca + ircc.canada.ca) and a stub OpenAI.
//   npm run build && node test/ircc.test.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PORT = 3351;
const STUB = 3352; // OpenAI
const IRCC = 3353; // canada.ca and ircc.canada.ca (their paths don't overlap)
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const pdf = async (lines) => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  const page = d.addPage([612, 792]);
  lines.forEach((l, i) => page.drawText(l, { x: 40, y: 740 - i * 18, size: 11, font }));
  return Buffer.from(await d.save());
};

/* ------------------------------- stub IRCC ------------------------------- */
const FORMS = '/en/immigration-refugees-citizenship/services/application/application-forms-guides';
const files = {
  [`${FORMS}/imm5484.html`]: ['text/html', `<html><main><h1>IMM 5484</h1><a href="https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5484/01-05-2026/imm5484e.pdf">Document Checklist [IMM 5484]</a></main></html>`],
  '/content/dam/ircc/documents/pdf/english/kits/forms/imm5484/01-05-2026/imm5484e.pdf': ['application/pdf', await pdf(['DOCUMENT CHECKLIST FOR A TEMPORARY RESIDENT VISA', 'IMM 5484 E (05-2026)', 'Application form IMM 5257', 'Fee payment receipt', 'Passport information page', 'Proof of financial support', 'Copies of previous visas (travel history)', 'Minors: custody documents or letter of authorization'])],
  [`${FORMS}/imm5558.html`]: ['text/html', `<html><main><a href="https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5558/01-08-2018/imm5558e.pdf">IMM 5558</a></main></html>`],
  '/content/dam/ircc/documents/pdf/english/kits/forms/imm5558/01-08-2018/imm5558e.pdf': ['application/pdf', await pdf(['DOCUMENT CHECKLIST VISITOR IN CANADA', 'IMM 5558 E (08-2018)', 'Passport', 'Proof of status in Canada'])],
  '/english/information/applications/visa.asp': ['text/html', `<html><main><h4>This application package is for applicants in Iran:</h4><ul>
    <li><a href="https://www.canada.ca/content/dam/ircc/migration/ircc/english/pdf/kits/forms/imm5484e.pdf">Document Checklist [IMM&nbsp;5484]</a></li>
    <li><a href="/english/pdf/kits/forms/imm5855e.pdf">Visa office instructions &ndash; Visit [IMM 5855]</a></li>
    <li><a href="https://www.canada.ca/content/dam/ircc/migration/ircc/english/pdf/kits/forms/imm5707e.pdf">Family Information Form [IMM 5707]</a></li></ul></main></html>`],
  [`${FORMS}/imm5488.html`]: ['text/html', `<html><main><a href="https://www.canada.ca/content/dam/ircc/documents/pdf/english/kits/forms/imm5488/01-02-2026/imm5488e.pdf">IMM 5488</a></main></html>`],
  '/content/dam/ircc/documents/pdf/english/kits/forms/imm5488/01-02-2026/imm5488e.pdf': ['application/pdf', await pdf(['DOCUMENT CHECKLIST WORK PERMIT', 'IMM 5488 E (02-2026)', 'Passport', 'Marriage certificate'])],
  // Same structure as canada.ca's work-permit country list (one entry per country).
  [`${FORMS}/apply-work-permit-outside-canada/ajax-work-country-requirements-eng/_jcr_content/par.html`]: ['text/html', `<div><!-- DataAjaxFragmentStart --><ul>
   <li class="hidden"><span class="country-AM">Armenia</span></li>
   <li><span class="IR"><a href="https://ircc.canada.ca/english/pdf/kits/forms/IMM5896E.pdf">visa <span class="text-lowercase">office requirements for applicants in</span> <span class="country-IR">Iran</span> [IMM 5896] (<abbr title="Portable Document Format">PDF</abbr>, 156 KB)</a></span></li>
   <li><span class="IQ"><a href="https://ircc.canada.ca/english/pdf/kits/forms/IMM5897E.pdf">visa office requirements for applicants in <span class="country-IQ">Iraq</span> [IMM 5897]</a></span></li>
   <li><div class="SY">visa office requirements for applicants in <span class="country-SY">Syria</span>:
     <ul><li><a href="https://ircc.canada.ca/english/pdf/kits/forms/IMM5897E.pdf">Amman visa office instructions – Visit [IMM 5897]</a>, or</li>
     <li><a href="https://ircc.canada.ca/english/pdf/kits/forms/IMM5900E.pdf">Beirut visa office instructions – Visit [IMM 5900]</a></li></ul></div>
   </li>
   <li><span class="TR"><a href="https://ircc.canada.ca/english/pdf/kits/forms/IMM5896E.pdf">visa office requirements for applicants in <span class="country-TR">Türkiye</span> [IMM 5896]</a></span></li>
  </ul></div>`],
  '/english/pdf/kits/forms/IMM5896E.pdf': ['application/pdf', await pdf(['Ankara Visa Office', 'Additional Document Checklist', 'Work Permit', 'IMM 5896 E (03-2026)', 'Letter of reference from your current employer', 'Transcripts and proof of graduation'])],
  '/english/pdf/kits/forms/imm5855e.pdf': ['application/pdf', await pdf(['Ankara Visa Office', 'Additional Document Checklist', 'IMM 5855 E (08-2026)', 'Bank statements for the past six months', 'Employment letter confirming leave', 'Students: enrolment letter'])],
};
const hits = new Map();
const irccServer = http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  hits.set(p, (hits.get(p) || 0) + 1);
  const f = files[p];
  if (!f) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': f[0] });
  res.end(f[1]);
});
await new Promise((r) => irccServer.listen(IRCC, r));

/* ------------------------------ stub OpenAI ------------------------------ */
const parsed = { 'IMM 5484': 0, 'IMM 5855': 0, 'IMM 5558': 0, 'IMM 5488': 0, 'IMM 5896': 0 };
const ITEMS = {
  'IMM 5484': [
    { document: 'Application form IMM 5257', details: '', condition: null, category: 'form' },
    { document: 'Fee payment receipt', details: '', condition: null, category: 'fee' },
    { document: 'Passport information page', details: 'Copy of the valid passport', condition: null, category: 'passport' },
    { document: 'Proof of financial support', details: '', condition: null, category: 'proof-of-funds' },
    { document: 'Copies of previous visas', details: 'Travel history for the last 10 years', condition: null, category: 'travel-history' },
    { document: 'Custody documents or letter of authorization', details: '', condition: 'if the applicant is a minor', category: 'custody-doc' },
  ],
  'IMM 5855': [
    { document: 'Bank statements (past 6 months)', details: '', condition: null, category: 'proof-of-funds' },
    { document: 'Employment letter confirming leave', details: '', condition: null, category: 'employment-letter' },
    { document: 'Enrolment letter', details: '', condition: 'if a student', category: 'enrolment-letter' },
  ],
  'IMM 5558': [{ document: 'Passport', details: '', condition: null, category: 'passport' }],
  'IMM 5488': [{ document: 'Passport', details: '', condition: null, category: 'passport' }, { document: 'Marriage certificate', details: '', condition: null, category: 'marriage-cert' }],
  'IMM 5896': [{ document: 'Letter of reference from current employer', details: '', condition: null, category: 'employment-letter' }, { document: 'Transcripts and proof of graduation', details: '', condition: null, category: 'transcripts' }],
};
const stub = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const text = JSON.stringify(JSON.parse(b || '{}').messages || []);
    const which = Object.keys(ITEMS).find((k) => text.includes(`Source: `) && text.includes(k.replace(' ', ' ')) && text.includes(`${k.replace('IMM ', 'IMM ')} E (`));
    let items = which ? ITEMS[which] : [];
    if (which) parsed[which]++;
    if (which === 'IMM 5855' && text.includes('Business travel')) {
      items = [...items, { document: 'Invitation letter from the Canadian company', details: '', condition: 'if travelling for business', category: 'invitation-letter' }];
    }
    const content = JSON.stringify({ visaOffice: which === 'IMM 5855' ? 'Ankara' : null, items });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => stub.listen(STUB, r));

/* --------------------------------- server --------------------------------- */
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ircc-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env, AUTH_SECRET: 'ircc-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'),
    OPENAI_API_KEY: 'stub', OPENAI_BASE_URL: `http://127.0.0.1:${STUB}/v1`, ADMIN_EMAIL: 'boss@firm.test',
    IRCC_CANADA_ORIGIN: `http://127.0.0.1:${IRCC}`, IRCC_LEGACY_ORIGIN: `http://127.0.0.1:${IRCC}`,
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
const until = async (fn, what) => {
  for (let i = 0; i < 120; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error(`timed out waiting for ${what}`);
};

{
  const { loadLib } = await import('./_load.mjs');
  const { officeLinks } = await loadLib('irccChecklists.js');
  const frag = files[`${FORMS}/apply-work-permit-outside-canada/ajax-work-country-requirements-eng/_jcr_content/par.html`][1];
  const sy = officeLinks(frag, 'work', 'SY').map((l) => l.href.split('/').pop());
  ok(sy.join(',') === 'IMM5897E.pdf,IMM5900E.pdf', `a country with two visa offices gets both instruction PDFs (${sy.join(', ')})`);
  ok(officeLinks(frag, 'work', 'IQ').length === 1 && officeLinks(frag, 'work', 'AM').length === 0, 'each country gets only its own entry');
}

try {
  await waitUp();
  const admin = client(), applicant = client();
  await admin('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  await applicant('POST', '/api/auth/register', { email: 'c@mail.test', password: 'password123', name: 'C' });

  let r = await admin('POST', '/api/applications', { type: 'trv-outside', title: 'Visitor from Iran' });
  const appId = r.data.application.id;
  await admin('PATCH', `/api/applications/${appId}`, { data: { countryOfResidence: 'Iran', maritalStatus: 'Single' } });

  r = await admin('GET', `/api/applications/${appId}/ircc`);
  ok(r.status === 200 && r.data.checking === true, 'opening a file starts a background check of IRCC');
  ok(r.data.sources.map((s) => s.id).join(',') === 'checklist:imm5484,office:visa:IR', 'a visitor visa from Iran uses IMM 5484 and the Iran visa office page');

  r = await until(async () => { const x = await admin('GET', `/api/applications/${appId}/ircc`); return !x.data.checking && x; }, 'the check');
  const [general, office] = r.data.sources;
  ok(general.version === '05-2026' && general.itemCount === 6, `the current IMM 5484 is read (version ${general.version})`);
  ok(office.documents.some((d) => d.code === 'IMM 5855' && d.version === '08-2026') && office.visaOffice === 'Ankara', 'the Iran page leads to the Ankara instructions IMM 5855');
  ok(!office.documents.some((d) => /5707|5484/.test(d.code || '')), 'forms on the country page are not mistaken for instructions');

  const extra = r.data.extra.map((e) => e.label);
  ok(extra.includes('Copies of previous visas') && extra.includes('Custody documents or letter of authorization') && extra.includes('Enrolment letter'), `documents the firm checklist lacks are added (${extra.join('; ')})`);
  ok(r.data.covered.some((c) => c.category === 'passport' && /^103 /.test(c.coveredBy)) && r.data.covered.some((c) => c.category === 'employment-letter'), 'documents the firm already asks for are marked covered, with its code');
  ok(r.data.handled.length === 2, 'the form and the fee are recognised as handled');
  ok(r.data.extra.find((e) => e.label === 'Custody documents or letter of authorization').optional && !r.data.extra.find((e) => e.label === 'Copies of previous visas').optional, 'conditional IRCC items are "if applicable", unconditional ones are required');

  const saved = (await admin('GET', `/api/applications/${appId}`)).data.application;
  ok(saved.ircc?.extra?.length === 3, "the IRCC additions are saved on the file (so its checklist, notes and review include them)");

  // Stays fresh: another visit within the day does not re-read IRCC.
  const before = { ...parsed };
  const hitsBefore = hits.get('/english/pdf/kits/forms/imm5855e.pdf');
  r = await admin('GET', `/api/applications/${appId}/ircc`);
  ok(!r.data.checking && parsed['IMM 5484'] === before['IMM 5484'] && hits.get('/english/pdf/kits/forms/imm5855e.pdf') === hitsBefore, 'a fresh copy is used without contacting IRCC again');

  // IRCC publishes a new IMM 5855: "Check IRCC now" picks it up and records the change.
  files['/english/pdf/kits/forms/imm5855e.pdf'][1] = await pdf(['Ankara Visa Office', 'Additional Document Checklist', 'IMM 5855 E (09-2026)', 'Bank statements for the past six months', 'Employment letter confirming leave', 'Students: enrolment letter', 'Business travel: invitation letter from the Canadian firm']);
  r = await applicant('POST', '/api/admin/ircc');
  ok(r.status === 403, 'applicants cannot trigger IRCC checks');
  r = await admin('POST', '/api/admin/ircc');
  ok(r.status === 202 && r.data.started >= 6, `admin "Check IRCC now" re-checks every checklist and known office (${r.data?.started})`);
  const list = await until(async () => { const x = await admin('GET', '/api/admin/ircc'); return !x.data.checking && x.data; }, 'admin check');
  const off = list.sources.find((s) => s.id === 'office:visa:IR');
  ok(off.changes[0]?.added?.includes('Invitation letter from the Canadian company') && off.version === '09-2026', 'the new IMM 5855 version is detected and its new document listed as a change');
  ok(parsed['IMM 5484'] === 1, 'an unchanged checklist is not sent to the AI again');
  ok(list.sources.some((s) => s.id === 'checklist:imm5558' && s.items.length === 1), 'the in-Canada checklists are tracked too');

  r = await admin('GET', `/api/applications/${appId}/ircc`);
  ok(r.data.extra.some((e) => e.label === 'Invitation letter from the Canadian company') && r.data.sources[1].lastChange?.added?.length === 1, "the file shows IRCC's change and gains the new document");

  // Work permits: the country list leads Iran to the Ankara work instructions.
  r = await admin('POST', '/api/applications', { type: 'owp-worker-spouse', title: 'Work from Iran' });
  const wpId = r.data.application.id;
  await admin('PATCH', `/api/applications/${wpId}`, { data: { countryOfResidence: 'Iran' } });
  await admin('GET', `/api/applications/${wpId}/ircc`);
  r = await until(async () => { const x = await admin('GET', `/api/applications/${wpId}/ircc`); return !x.data.checking && x; }, 'work check');
  ok(r.data.sources.map((s) => s.id).join(',') === 'checklist:imm5488,office:work:IR', 'a work permit from Iran uses IMM 5488 and the work-permit country list');
  ok(r.data.sources[1].documents.length === 1 && r.data.sources[1].documents[0].code === 'IMM 5896' && r.data.sources[1].documents[0].version === '03-2026', 'Iran → the Ankara work instructions IMM 5896 (03-2026)');
  ok(r.data.covered.some((c) => c.category === 'employment-letter' && /^113 /.test(c.coveredBy)), "the employer's reference letter is covered by the firm's 113");
  ok(r.data.extra.some((e) => e.key === 'transcripts' && !e.optional), "Ankara's transcripts requirement, missing from the firm's spouse-of-worker list, is added to the file");

  // A country with no office instructions: no office documents, no AI call.
  const callsBefore = Object.values(parsed).reduce((a, b) => a + b, 0);
  r = await admin('POST', '/api/applications', { type: 'owp-worker-spouse', title: 'Work from Armenia' });
  const amId = r.data.application.id;
  await admin('PATCH', `/api/applications/${amId}`, { data: { countryOfResidence: 'Armenia' } });
  await admin('GET', `/api/applications/${amId}/ircc`);
  r = await until(async () => { const x = await admin('GET', `/api/applications/${amId}/ircc`); return !x.data.checking && x; }, 'armenia check');
  ok(r.data.sources[1]?.id === 'office:work:AM' && r.data.sources[1].documents.length === 0 && r.data.sources[1].itemCount === 0, 'a country without office instructions adds nothing');
  ok(Object.values(parsed).reduce((a, b) => a + b, 0) === callsBefore, 'and costs no AI call');

  // In-Canada types have no visa office page.
  r = await admin('POST', '/api/applications', { type: 'visitor-record', title: 'VR' });
  r = await admin('GET', `/api/applications/${r.data.application.id}/ircc`);
  ok(r.data.sources.map((s) => s.id).join(',') === 'checklist:imm5558', 'a visitor record uses IMM 5558 only');
} catch (e) {
  console.error('ERROR', e);
  failures++;
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  stub.close();
  irccServer.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nALL IRCC CHECKS PASS');
if (failures) console.log(logs.slice(-3000));
process.exit(failures ? 1 : 0);
