// End-to-end test of the IRCC final-file set: plan, build, contents, orientation
// and zip — against a built server and a stub OpenAI.
//   npm run build && node test/finalfiles.test.mjs
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, PDFName } from 'pdf-lib';
import { loadLib } from './_load.mjs';

const PORT = 3381;
const STUB = 3382;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// Stub OpenAI: letters, and "no opinion" for the vision checks.
const stub = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b || '{}');
    const content = body.response_format?.type === 'json_object'
      ? '{"rotations":{},"mirrored":[],"pages":{},"sure":{}}'
      : 'Dear Visa Officer,\n\n**Introduction**\nA stub letter.\n\nSincerely, Test';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => stub.listen(STUB, r));

const pdf = async (label, pages = 1) => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) d.addPage([595, 842]).drawText(`${label} page ${i + 1}`, { x: 60, y: 700, size: 28, font });
  return Buffer.from(await d.save());
};

// A Persian certificate scanned sideways (the case that came out upside down).
const persianLines = ['بسمه تعالی', 'جمهوری اسلامی ایران', 'گواهی عدم سوء پیشینه', 'نام: زهرا    نام خانوادگی: محمدی', 'تاریخ تولد: ۱۳۵۲/۰۳/۱۴    محل تولد: تهران', 'شماره شناسنامه: ۱۲۳۴    کد ملی: ۰۰۱۲۳۴۵۶۷۸', 'نام پدر: علی    نام مادر: فاطمه', 'این گواهی بر اساس مدارک موجود صادر گردیده است', 'محل صدور: تهران    تاریخ صدور: ۱۴۰۲/۰۵/۲۰'];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="1754"><rect width="100%" height="100%" fill="white"/>
  <rect x="60" y="60" width="1120" height="1634" fill="none" stroke="black" stroke-width="14" stroke-dasharray="20 6"/>
  ${persianLines.map((t, i) => `<text x="1130" y="${170 + i * 68}" font-family="DejaVu Sans" font-size="${i < 2 ? 36 : 28}" text-anchor="start" direction="rtl">${t}</text>`).join('')}
  <text x="135" y="1590" font-family="DejaVu Serif" font-size="20" fill="#c33">Certified Translator of English No. 931</text></svg>`;
const sidewaysScan = await sharp(await sharp(Buffer.from(svg)).flatten({ background: '#fff' }).jpeg().toBuffer()).rotate(90).jpeg({ quality: 85 }).toBuffer();

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'final-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, AUTH_SECRET: 'final-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'),
         OPENAI_API_KEY: 'stub', OPENAI_BASE_URL: `http://127.0.0.1:${STUB}/v1`, ADMIN_EMAIL: 'boss@firm.test' },
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: true,
});
let logs = '';
server.stdout.on('data', (d) => (logs += d));
server.stderr.on('data', (d) => (logs += d));
const waitUp = async () => { for (let i = 0; i < 60; i++) { try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 500)); } throw new Error('server did not start\n' + logs); };

let cookie = '';
const call = async (method, url, body, form) => {
  const r = await fetch(BASE + url, { method, headers: form ? { cookie } : { 'Content-Type': 'application/json', cookie }, body: form || (body ? JSON.stringify(body) : undefined) });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
};
const download = async (url) => Buffer.from(await (await fetch(BASE + url, { headers: { cookie } })).arrayBuffer());
const pdfText = (buf) => spawnSync('pdftotext', ['-', '-'], { input: buf }).stdout.toString();

try {
  await waitUp();
  await call('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  let r = await call('POST', '/api/applications', { type: 'owp-worker-spouse', title: 'Final files', representation: 'firm' });
  const appId = r.data.application.id;
  await call('PATCH', `/api/applications/${appId}`, { data: { givenName: 'Zahra', familyName: 'Test', maritalStatus: 'Married' } });

  const fd = new FormData();
  const add = (name, buf, type = 'application/pdf') => fd.append('files', new Blob([buf], { type }), name);
  add('103 - Passport - Zahra.pdf', await pdf('PASSPORT', 2));
  add('104 - Photo - Zahra.png', await sharp({ create: { width: 420, height: 540, channels: 3, background: '#dfe6ee' } }).png().toBuffer(), 'image/png');
  add('116 - Marriage Certificate - Zahra.pdf', await pdf('MARRIAGE CERTIFICATE', 2));
  add('101 - Birth Certificate - Zahra.pdf', await pdf('BIRTH CERTIFICATE'));
  add('102 - National ID Card - Zahra.pdf', await pdf('NATIONAL ID CARD'));
  add('115 - Police Clearance - Zahra.jpg', sidewaysScan, 'image/jpeg');
  add('127 - CV - Zahra.pdf', await pdf('CURRICULUM VITAE'));
  add('105 - Degree - Zahra.pdf', await pdf('DEGREE'));
  add('113 - Employment Letter - Zahra.pdf', await pdf('EMPLOYMENT LETTER'));
  add('113 - Employment Letter - Zahra (2).pdf', await pdf('SECOND EMPLOYMENT LETTER'));
  add('112 - Bank Statement - Zahra.pdf', await pdf('BANK STATEMENT', 2));
  add('120 - Ties - Zahra.pdf', await pdf('TIES TO HOME'));
  add('132 - Spouse Work Permit.pdf', await pdf('SPOUSE WORK PERMIT'));
  add('imm5476e Signed - Zahra.pdf', await pdf('IMM 5476 SIGNED'));
  r = await call('POST', `/api/applications/${appId}/upload`, null, fd);
  ok(r.status === 201 && r.data.documents.length === 14, `uploaded 14 files (${r.data.documents?.length})`);

  r = await call('GET', `/api/applications/${appId}/final-files`);
  const plan = r.data.plan;
  const names = plan.filter((e) => e.n).map((e) => e.filename);
  ok(names[0] === '01 - imm1295e - Zahra.pdf' && names[1] === '02 - imm5257_1e - Zahra.pdf', `forms come first, named like IRCC's files (${names.slice(0, 2).join(', ')})`);
  ok(names.includes('04 - imm5476e Signed - Zahra.pdf'), 'the uploaded signed IMM 5476 is used as the form');
  ok(names.indexOf('05 - Passport - Zahra.pdf') === 4 && names.indexOf('06 - Photo - Zahra.jpg') === 5 && names.indexOf('07 - Client Information - Zahra.pdf') === 6, 'then Passport, Photo, Client Information');
  ok(names.some((n) => /Marriage Certificate - Zahra\.pdf$/.test(n)), 'the marriage certificate has its own file');
  ok(names.some((n) => /Family Proof of Status/.test(n)) && names.some((n) => /Education and Certificates/.test(n)) && !names.some((n) => /CV/.test(n)), `the spouse-abroad set: Family Proof of Status, Education and Certificates, no separate CV (${names.slice(6).join(', ')})`);
  const ci = plan.find((e) => e.slot === 'client-info');
  const secNames = (ci.contents || []).map((s) => s.name);
  ok(secNames.includes('Occupational Documents') && secNames.includes('Financial Documents') && !secNames.some((n) => /Marriage|Police|Birth/.test(n)), `the plan shows what Client Information will hold (${secNames.join(' · ')})`);
  const occ = ci.contents.find((s) => s.name === 'Occupational Documents');
  ok(occ && occ.children.slice(0, 2).map((c) => c.name).join('|') === '1st Employment Letter|2nd Employment Letter', `two employment letters become 1st / 2nd entries (${occ?.children.map((c) => c.name).join(' | ')})`);
  ok(Array.isArray(r.data.unplaced) && r.data.unplaced.length === 0, 'every uploaded document has a place in the set');
  ok(/Submission Letter - Zahra\.pdf$/.test(names[names.length - 1]), 'the submission letter is last');

  r = await call('POST', `/api/applications/${appId}/final-files`, { cleanPages: true, fixRotation: true });
  ok(r.status === 202, 'Build all starts a background job');
  let job;
  const labels = new Set();
  for (let i = 0; i < 1200; i++) {
    job = (await call('GET', `/api/applications/${appId}/final-files`)).data.job;
    if (job?.current) labels.add(job.current);
    if (!job || job.status !== 'running') break;
    await new Promise((res) => setTimeout(res, 200));
  }
  ok(job?.status === 'done', `the build finishes (${job?.status} ${job?.error || ''})`);
  ok(labels.size > 3, `progress names each file as it is built (${labels.size} seen)`);
  const res = job.result;
  const built = new Map(res.files.map((f) => [f.name, f]));
  const formProblem = res.problems.find((p) => /imm1295e/.test(p.filename));
  if (formProblem) ok(/data sheet/.test(formProblem.reason) && formProblem.slot, 'a form that could not be pre-filled is reported (not faked), pointing to the data sheet, with its slot');
  else ok(built.has('imm1295e') && built.has('imm5645e'), 'the official forms were pre-filled (python + IRCC templates available)');
  const genKeys = new Set(res.generated.map((x) => x.key));
  ok(['sop', 'submission-letter', 'imm1295', 'imm5645', 'imm5476', 'next-steps'].every((k) => genKeys.has(k)), 'the one build also drafted the letters, made the data sheets and the next-steps note');
  ok(labels.has('Preparing letters and forms'), 'progress shows the preparation step');
  ok(Array.isArray(res.note?.missingDocuments), 'the build reports what is still missing');

  const g = (name) => `/api/applications/${appId}/download/${built.get(name).key}`;
  const client = await download(g('Client Information'));
  const clientText = pdfText(client);
  ok(/Client Information/.test(clientText) && /Contents/.test(clientText), 'Client Information has its table of contents');
  ok(!/Marriage/i.test(clientText) && !/Birth Certificate/i.test(clientText) && !/Police/i.test(clientText), 'Client Information leaves out documents that have their own slot');
  ok(/Occupational Documents/.test(clientText) && /1st Employment Letter/.test(clientText) && /2nd Employment Letter/.test(clientText) && /Financial Documents/.test(clientText) && /Title Deed/.test(clientText), 'and keeps the supporting documents in the firm\'s layout (occupational a/b, financial a/b/c)');
  const ciDoc = await PDFDocument.load(client);
  const annots = ciDoc.getPage(0).node.Annots();
  const linked = annots && annots.size() > 0;
  const hasOutlines = Boolean(ciDoc.catalog.get(PDFName.of('Outlines')));
  if (process.env.PYTHON_BIN || spawnSync('python3', ['-c', 'import pikepdf']).status === 0) ok(linked && hasOutlines, `the contents page is clickable and the PDF has bookmarks (${annots?.size()} links)`);
  else console.log('SKIP  contents links (pikepdf not installed)');

  const idFile = await download(g('Birth Certificate & National ID Card'));
  const idText = pdfText(idFile);
  ok((await PDFDocument.load(idFile)).getPageCount() === 4 && /Birth Certificate/.test(idText) && /National ID Card/.test(idText), 'a file holding two documents gets a title page before each');

  // One file can be rebuilt on its own; the rest of the set stays.
  r = await call('POST', `/api/applications/${appId}/final-files`, { slot: 'marriage' });
  ok(r.status === 202 && r.data.job.only === 'marriage', 'a single file can be rebuilt on its own');
  let one;
  for (let i = 0; i < 600; i++) {
    one = (await call('GET', `/api/applications/${appId}/final-files`)).data;
    if (!one.job || one.job.status !== 'running') break;
    await new Promise((res) => setTimeout(res, 200));
  }
  ok(one.job?.status === 'done' && one.job.result.built.length === 1 && /Marriage Certificate/.test(one.job.result.built[0]) && one.built.files.length === res.files.length, `only that file was rebuilt (${one.job?.result?.built?.join(', ')}); the set still has ${one.built?.files?.length} files`);

  const marriage = await download(g('Marriage Certificate'));
  ok((await PDFDocument.load(marriage)).getPageCount() === 2 && !/Contents/.test(pdfText(marriage)), 'Marriage Certificate is just its 2 pages (no contents page)');
  const photo = await download(g('Photo'));
  ok(photo[0] === 0xff && photo[1] === 0xd8, 'the photo is a JPEG');
  const form = await download(g('imm5476e Signed'));
  ok(/IMM 5476 SIGNED/.test(pdfText(form)), 'the signed form is passed through untouched');

  // The sideways Persian certificate must come out upright.
  const police = await download(g('Police Clearance Certificate'));
  const tmp = path.join(dataDir, 'police.pdf');
  await fs.writeFile(tmp, police);
  spawnSync('pdftoppm', ['-r', '100', '-png', '-f', '1', '-l', '1', tmp, path.join(dataDir, 'police')]);
  const pageFile = (await fs.readdir(dataDir)).find((f) => f.startsWith('police-') && f.endsWith('.png'));
  const { orientationByText, tesseractAvailable } = await loadLib('orientationOcr.js');
  if (tesseractAvailable()) {
    const d = await orientationByText(await fs.readFile(path.join(dataDir, pageFile)));
    ok(d.decided && d.rotate === 0, `the sideways Persian certificate comes out upright (${d.method}: ${d.detail})`);
    ok(res.rotatedPages >= 1, 'and it is reported as turned upright');
  } else {
    console.log('SKIP  orientation check (tesseract not installed)');
  }

  const zipBuf = await download(`/api/applications/${appId}/final-files/zip`);
  const zip = await JSZip.loadAsync(zipBuf);
  const inZip = Object.keys(zip.files).sort();
  ok(inZip.length === res.files.length && inZip.includes('06 - Photo - Zahra.jpg'), `Download all gives a zip of every final file (${inZip.length})`);
} catch (e) {
  console.error('ERROR', e);
  failures++;
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  stub.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nALL FINAL FILES CHECKS PASS');
if (failures) console.log(logs.slice(-3000));
process.exit(failures ? 1 : 0);
