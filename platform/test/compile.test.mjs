// End-to-end test of compiling packages as background jobs with progress,
// against a built server and a stub OpenAI.
//   npm run build && node test/compile.test.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const PORT = 3361;
const STUB = 3362;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// Stub OpenAI: letters take a moment, so the "drafting" phase is visible.
const stub = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', async () => {
    const body = JSON.parse(b || '{}');
    await new Promise((r) => setTimeout(r, 600));
    const content = body.response_format?.type === 'json_object'
      ? '{"rotate":0,"mirrored":false}'
      : 'Dear Visa Officer,\n\n**Introduction**\nA stub letter.\n\nSincerely, Test';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => stub.listen(STUB, r));

const pdf = async (label, pages = 2) => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) d.addPage([595, 842]).drawText(`${label} — page ${i + 1}`, { x: 60, y: 700, size: 24, font });
  return Buffer.from(await d.save());
};

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compile-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, AUTH_SECRET: 'compile-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'),
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
  return { status: r.status, data, headers: r.headers };
};

try {
  await waitUp();
  await call('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  let r = await call('POST', '/api/applications', { type: 'trv-outside', title: 'Compile test' });
  const appId = r.data.application.id;

  r = await call('POST', `/api/applications/${appId}/compile`, { pkg: 'no-such-package' });
  ok(r.status === 404, 'an unknown package is refused at once');

  // 18 files for the client package, 2 for the financial one, and a Word file.
  const fd = new FormData();
  const codes = ['113 - Employment letter', '105 - Degree', '106 - Transcripts', '120 - Ties', '101 - Birth certificate', '116 - Marriage certificate', '130 - Military card', '115 - Police clearance', '121 - Flight'];
  for (let i = 0; i < 18; i++) fd.append('files', new Blob([await pdf(`doc ${i}`)], { type: 'application/pdf' }), `${codes[i % codes.length]} ${i}.pdf`);
  fd.append('files', new Blob([await pdf('bank', 3)], { type: 'application/pdf' }), '112 - Bank statement.pdf');
  fd.append('files', new Blob([await pdf('deed')], { type: 'application/pdf' }), '120 - Title deed.pdf');
  fd.append('files', new Blob([Buffer.from('PK\u0003\u0004 not really a docx')], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), '127 - CV.docx');
  r = await call('POST', `/api/applications/${appId}/upload`, null, fd);
  ok(r.status === 201 && r.data.documents.length === 21, 'uploaded 21 files');

  const t0 = Date.now();
  r = await call('POST', `/api/applications/${appId}/compile`, { pkg: 'client-info', fixRotation: false });
  const ms = Date.now() - t0;
  ok(r.status === 202 && ['queued', 'running'].includes(r.data.job.status), 'Compile starts a background job');
  ok(ms < 2000, `and answers at once (${ms} ms)`);
  r = await call('POST', `/api/applications/${appId}/compile`, { pkg: 'financial-proof', fixRotation: false });
  ok(r.status === 202 && r.data.job.status === 'queued', 'a second package on the same file waits its turn');
  r = await call('POST', `/api/applications/${appId}/compile`, { pkg: 'client-info', fixRotation: false });
  ok(r.status === 202 && ['queued', 'running'].includes(r.data.job.status), 'pressing Compile again joins the running job');

  // Follow both jobs to the end, keeping every progress snapshot.
  const snaps = [];
  let jobs = {};
  for (let i = 0; i < 600; i++) {
    jobs = (await call('GET', `/api/applications/${appId}/compile`)).data.jobs;
    snaps.push(JSON.parse(JSON.stringify(jobs)));
    if (Object.values(jobs).every((j) => j.status === 'done' || j.status === 'failed')) break;
    await new Promise((res) => setTimeout(res, 60));
  }
  const ci = snaps.map((s) => s['client-info']).filter(Boolean);
  const fin = snaps.map((s) => s['financial-proof']).filter(Boolean);
  ok(ci.some((j) => j.phase === 'letters' && /Purpose of Travel/.test(j.current || '')), 'progress shows the letter being drafted');
  const docSnaps = ci.filter((j) => j.phase === 'documents');
  ok(docSnaps.length > 1 && docSnaps.some((j) => /^file \d+ of \d+ — /.test(j.current || '')), 'progress names the file being prepared ("file 7 of 19 — …")');
  ok(docSnaps.some((j) => j.done > 1 && j.done < j.total), 'progress moves through the files');
  ok(ci.some((j) => j.phase === 'assembling'), 'progress shows the PDF being assembled');
  ok(fin.some((j) => j.status === 'queued') && fin.findIndex((j) => j.status === 'running') >= ci.findIndex((j) => j.status === 'done') && !snaps.some((s) => s['client-info']?.status === 'running' && s['financial-proof']?.status === 'running'), 'the second package starts only after the first finishes');

  const done = jobs['client-info'];
  ok(done.status === 'done' && done.done === done.total, `the client package finishes at 100% (${done.done}/${done.total})`);
  ok(done.result.skippedFiles.includes('127 - CV.docx'), 'the Word file is reported as left out of the PDF');
  ok(done.result.included.find((s) => s.name === 'Purpose of Travel')?.count === 1, 'the drafted letter is in the package');
  ok(jobs['financial-proof'].status === 'done', 'the financial package finishes too');

  const dl = await fetch(`${BASE}/api/applications/${appId}/download/client-info-package`, { headers: { cookie } });
  const bytes = Buffer.from(await dl.arrayBuffer());
  ok(dl.ok && bytes.slice(0, 5).toString() === '%PDF-', 'the compiled PDF downloads');
  const pages = (await PDFDocument.load(bytes)).getPageCount();
  ok(pages > 18, `it holds the pages (${pages})`);

  // An empty file: the job fails with a clear reason.
  r = await call('POST', '/api/applications', { type: 'trv-outside', title: 'Empty' });
  const emptyId = r.data.application.id;
  await call('POST', `/api/applications/${emptyId}/compile`, { pkg: 'inviter-docs' });
  let ej;
  for (let i = 0; i < 100; i++) {
    ej = (await call('GET', `/api/applications/${emptyId}/compile`)).data.jobs['inviter-docs'];
    if (ej.status === 'failed' || ej.status === 'done') break;
    await new Promise((res) => setTimeout(res, 100));
  }
  ok(ej.status === 'failed' && /Nothing to compile/.test(ej.error), 'a package with nothing in it fails with a clear message');
} catch (e) {
  console.error('ERROR', e);
  failures++;
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  stub.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nALL COMPILE CHECKS PASS');
if (failures) console.log(logs.slice(-3000));
process.exit(failures ? 1 : 0);
