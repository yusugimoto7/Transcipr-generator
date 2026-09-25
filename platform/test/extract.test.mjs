// End-to-end test of "Read documents & fill intake" on a large file, against a
// built server and a stub OpenAI that records what it is sent.
//   npm run build && node test/extract.test.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const PORT = 3341;
const STUB = 3342;
const BASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

/* ------------------------------ stub OpenAI ------------------------------ */
const seen = { calls: 0, inflight: 0, maxInflight: 0, files: 0, images: 0, headers: [] };
const stub = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', async () => {
    seen.calls++;
    seen.inflight++;
    seen.maxInflight = Math.max(seen.maxInflight, seen.inflight);
    const body = JSON.parse(b || '{}');
    const parts = body.messages?.flatMap((m) => (Array.isArray(m.content) ? m.content : [])) || [];
    const headers = parts.filter((p) => p.type === 'text' && /^--- Document \d+:/.test(p.text)).map((p) => p.text);
    seen.headers.push(...headers);
    seen.files += parts.filter((p) => p.type === 'file').length;
    seen.images += parts.filter((p) => p.type === 'image_url').length;
    await new Promise((r) => setTimeout(r, 250));
    // Categorise each document by its code; read a name from the passport.
    const cats = {};
    const fields = {};
    headers.forEach((h, i) => {
      if (/103 - Passport/.test(h)) { cats[i + 1] = 'passport'; fields.givenName = 'Zahra'; fields.passportNumber = 'X1234567'; }
      else if (/113 - /.test(h)) cats[i + 1] = 'certificates'; // the AI guesses wrong; the code must win
      else if (/Intake/.test(h)) cats[i + 1] = 'internal';
      else cats[i + 1] = 'other';
    });
    const content = JSON.stringify({ fields, confidence: { givenName: 'high' }, sources: {}, documentCategories: cats, notes: [] });
    seen.inflight--;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => stub.listen(STUB, r));

/* -------------------------------- fixtures -------------------------------- */
const smallPdf = async (label) => {
  const d = await PDFDocument.create();
  d.addPage([300, 300]).drawText(label, { x: 20, y: 150, size: 12 });
  return Buffer.from(await d.save());
};
// A ~4 MB, 12-page scan (random noise does not compress).
const bigPdf = async () => {
  const d = await PDFDocument.create();
  const imgs = [];
  for (let i = 0; i < 3; i++) {
    const raw = crypto.randomBytes(1200 * 1200 * 3);
    const jpg = await sharp(raw, { raw: { width: 1200, height: 1200, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    imgs.push(await d.embedJpg(jpg));
  }
  for (let p = 0; p < 12; p++) {
    const page = d.addPage([600, 800]);
    page.drawImage(imgs[p % 3], { x: 0, y: 100, width: 600, height: 600 });
  }
  return Buffer.from(await d.save());
};

/* --------------------------------- server --------------------------------- */
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, AUTH_SECRET: 'extract-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'),
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
const upload = async (appId, files) => {
  const fd = new FormData();
  for (const [name, buf, type] of files) fd.append('files', new Blob([buf], { type }), name);
  return call('POST', `/api/applications/${appId}/upload`, null, fd);
};
const waitJob = async (appId) => {
  for (let i = 0; i < 240; i++) {
    const r = await call('GET', `/api/applications/${appId}/extract`);
    if (r.data?.job && r.data.job.status !== 'running') return r.data.job;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error('job never finished');
};

try {
  await waitUp();
  await call('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Boss' });
  let r = await call('POST', '/api/applications', { type: 'owp-worker-spouse', title: 'Big file' });
  const appId = r.data.application.id;

  // 27 small documents + 2 big scans + a photo + the firm's checklist.
  const files = [];
  files.push(['100 - Checklist - Zahra.pdf', await smallPdf('checklist'), 'application/pdf']);
  files.push(['104 - Photo.png', await sharp({ create: { width: 200, height: 260, channels: 3, background: '#ddd' } }).png().toBuffer(), 'image/png']);
  files.push(['103 - Passport - Zahra.pdf', await bigPdf(), 'application/pdf']);
  files.push(['101 - Birth certificate.pdf', await bigPdf(), 'application/pdf']);
  files.push(['113 - Employment letter.pdf', await smallPdf('employment'), 'application/pdf']);
  for (let i = 0; i < 26; i++) files.push([`1${String(5 + (i % 20)).padStart(2, '0')} - Doc ${i}.pdf`, await smallPdf(`doc ${i}`), 'application/pdf']);
  r = await upload(appId, files.slice(0, 16));
  r = await upload(appId, files.slice(16));
  ok(r.status === 201 && r.data.documents.length === files.length, `uploaded ${files.length} documents`);

  const before = (await call('GET', `/api/applications/${appId}`)).data.application;

  const t0 = Date.now();
  r = await call('POST', `/api/applications/${appId}/extract`, {});
  const startMs = Date.now() - t0;
  ok(r.status === 202 && r.data.job.status === 'running', 'the button starts a background job');
  ok(startMs < 3000, `and returns at once (${startMs} ms) instead of holding the request open`);
  const readCount = r.data.job.docCount;
  ok(readCount === files.length - 2, `skips the photo and the firm's 100 checklist (${readCount} of ${files.length} to read)`);

  r = await call('POST', `/api/applications/${appId}/extract`, {});
  ok(r.status === 202 && r.data.job.startedAt, 'pressing again while running joins the same job');

  const job = await waitJob(appId);
  ok(job.status === 'done' && job.done === job.total, `job finishes (${job.done}/${job.total} parts)`);
  ok(seen.maxInflight <= 2, `never more than 2 AI calls at once (max ${seen.maxInflight})`);
  ok(seen.headers.length === readCount && new Set(seen.headers.map((h) => h.replace(/^--- Document \d+: /, ''))).size === readCount, 'every document sent exactly once');
  ok(seen.headers.filter((h) => /first \d+ page/.test(h)).length === 2 && seen.images >= 2 * 6, `the two big scans went as their first pages (${seen.images} page images)`);
  ok(seen.files === readCount - 2, 'small PDFs went as PDFs');
  ok(job.result.fields.givenName === 'Zahra' && job.result.fields.passportNumber === 'X1234567', 'values read from the passport are returned');

  const after = (await call('GET', `/api/applications/${appId}`)).data.application;
  const doc = (n) => after.documents.find((d) => d.filename.startsWith(n));
  ok(doc('103 - Passport').category === 'passport', 'categories saved');
  ok(doc('113 - Employment').category === 'employment-letter', "the file's checklist code beats a wrong AI guess");
  ok(after.documents.filter((d) => d.extractedAt).length === readCount, 'read documents are marked as read');
  ok((after.dataVersion || 0) === (before.dataVersion || 0), 'reading does not touch the intake version');

  // The page then fills the intake — with the version it loaded before reading.
  r = await call('PATCH', `/api/applications/${appId}`, { data: { givenName: 'Zahra' }, baseDataVersion: before.dataVersion || 0 });
  ok(r.status === 200 && r.data.application.data.givenName === 'Zahra', 'filling the intake after reading saves without a conflict');

  // Only new files are read next time.
  const callsBefore = seen.headers.length;
  await upload(appId, [['116 - Marriage certificate.pdf', await smallPdf('marriage'), 'application/pdf']]);
  r = await call('POST', `/api/applications/${appId}/extract`, {});
  ok(r.data.job.docCount === 1, 'after a new upload only the new file is read');
  await waitJob(appId);
  ok(seen.headers.length - callsBefore === 1, 'and only it is sent to the AI');
} catch (e) {
  console.error('ERROR', e);
  failures++;
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  stub.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(failures ? `\n${failures} FAILED` : '\nALL EXTRACTION CHECKS PASS');
if (failures) console.log(logs.slice(-3000));
process.exit(failures ? 1 : 0);
