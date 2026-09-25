// Memory check for compiling a large package (100 scanned PDFs, ~300 pages,
// ~230 MB) with the server's heap capped. Prints peak server memory; the
// package must build without the server being killed. Opt-in (slow):
//   npm run build && npm run test:memory
// Reference (2026-09): previous in-memory compiler peaked ~750 MB; the
// disk-streamed one ~290 MB (of which ~210 MB is the idle server).
import { spawn, execSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';

const PORT = 3371, BASE = `http://127.0.0.1:${PORT}`;
import http from 'http';
const ai = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'Dear Visa Officer,\n\nA stub letter.\n\nSincerely' } }] })); }); });
await new Promise((r) => ai.listen(3372, r));
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stress-'));
// A realistic scan: textured page (compresses like a real scan, ~300-600 KB/page at 150 DPI).
const scanPage = async (seed) => {
  const w = 1240, h = 1752;
  const noise = crypto.randomBytes((w / 4) * (h / 4) * 3);
  return sharp(await sharp(noise, { raw: { width: w / 4, height: h / 4, channels: 3 } }).resize(w, h).blur(0.6).png().toBuffer()).jpeg({ quality: 85 }).toBuffer();
};
const scanPdf = async (pages) => {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) {
    const img = await d.embedJpg(await scanPage(i));
    d.addPage([595, 842]).drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
  }
  return Buffer.from(await d.save());
};
const server = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
  env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=300', AUTH_SECRET: 'stress-secret-value-at-least-32-chars', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'), OPENAI_API_KEY: 'none', OPENAI_BASE_URL: 'http://127.0.0.1:3372/v1', ADMIN_EMAIL: 'b@f.test' },
  stdio: ['ignore', 'pipe', 'pipe'], detached: true,
});
let logs = ''; server.stdout.on('data', (d) => (logs += d)); server.stderr.on('data', (d) => (logs += d));
for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
let cookie = '';
const call = async (m, u, b, form) => { const r = await fetch(BASE + u, { method: m, headers: form ? { cookie } : { 'Content-Type': 'application/json', cookie }, body: form || (b ? JSON.stringify(b) : undefined) }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; let d = null; try { d = await r.json(); } catch {} return { status: r.status, data: d }; };
const rss = () => { try { const pids = execSync(`pgrep -g ${server.pid}`).toString().trim().split('\n'); return Math.max(...pids.map((p) => { try { return Number(execSync(`grep VmRSS /proc/${p}/status 2>/dev/null`).toString().match(/\d+/)[0]); } catch { return 0; } })) / 1024; } catch { return 0; } };
try {
  await call('POST', '/api/auth/register', { email: 'b@f.test', password: 'password123', name: 'B' });
  const appId = (await call('POST', '/api/applications', { type: 'trv-outside', title: 'Stress' })).data.application.id;
  const codes = ['113 - Employment', '105 - Degree', '106 - Transcripts', '120 - Ties', '101 - Birth', '116 - Marriage', '130 - Military', '115 - Police', '121 - Flight', '127 - CV'];
  let totalBytes = 0;
  for (let batch = 0; batch < 10; batch++) {
    const fd = new FormData();
    for (let i = 0; i < 10; i++) { const b = await scanPdf(3); totalBytes += b.length; fd.append('files', new Blob([b], { type: 'application/pdf' }), `${codes[i]} ${batch}-${i}.pdf`); }
    await call('POST', `/api/applications/${appId}/upload`, null, fd);
  }
  // A letter is needed by the package; give the file one so no AI is called.
  console.log(`uploaded 100 scanned PDFs, 300 pages, ${(totalBytes / 1048576).toFixed(0)} MB`);
  const before = rss();
  const t0 = Date.now();
  await call('POST', `/api/applications/${appId}/compile`, { pkg: 'client-info', fixRotation: false, cleanPages: true });
  let peak = before, job;
  for (let i = 0; i < 3000; i++) {
    peak = Math.max(peak, rss());
    job = (await call('GET', `/api/applications/${appId}/compile`)).data?.jobs?.['client-info'];
    if (!job || job.status === 'done' || job.status === 'failed') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log(`job: ${job?.status} ${job?.error || ''} in ${((Date.now() - t0) / 1000).toFixed(0)} s; pages ${job?.result?.pages}`);
  console.log('included', JSON.stringify(job?.result?.included), 'skipped', (job?.result?.skippedFiles || []).length, 'dropped', job?.result?.droppedPages);
  console.log(`server memory: ${before.toFixed(0)} MB before, peak ${peak.toFixed(0)} MB during compile`);
  const st = await fs.stat(path.join(dataDir, 'up', appId, 'generated', 'client-info-package.pdf')).catch(() => null);
  console.log(`package file: ${st ? (st.size / 1048576).toFixed(0) + ' MB' : 'missing'}`);
  const limit = Number(process.env.COMPILE_PEAK_LIMIT_MB || 450);
  if (job?.status !== 'done' || job.result.pages < 300 || peak > limit) {
    console.log(`FAIL  expected a ~312-page package with peak memory under ${limit} MB`);
    process.exitCode = 1;
  } else console.log('PASS  large package compiled within memory');
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  ai.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  if (/heap out of memory|FATAL/i.test(logs)) console.log('SERVER CRASHED:', logs.slice(-500));
}
