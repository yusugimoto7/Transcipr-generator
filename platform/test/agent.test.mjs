// The assistant acting on a file (lib/agent.js), against the built server and
// a stand-in AI that answers with tool calls: a fact told in the chat goes
// into the intake (and the activity), "remove page N" takes that page out of
// the built Client Information on every rebuild, a note on a final file is
// carried out, and a voice recording comes back as text.
//   npm run build && node test/agent.test.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { PDFDocument, StandardFonts } from 'pdf-lib';

let bad = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) bad++; };
const PORT = 3394;
const AI = 3395;
const BASE = `http://127.0.0.1:${PORT}`;

/* A stand-in OpenAI: tool calls by what the team asked; plain answers otherwise. */
let removePage = 0;
const calls = [];
const ai = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url.includes('/audio/transcriptions')) return res.end(JSON.stringify({ text: 'اسم پدر TEST Testian است' }));
    const body = JSON.parse(b || '{}');
    const msgs = body.messages || [];
    const last = msgs[msgs.length - 1] || {};
    const said = msgs.filter((m) => m.role === 'user').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).pop() || '';
    const tool = (name, args) => res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `c${calls.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] }));
    const text = (t) => res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: t } }] }));
    if (body.tools && last.role !== 'tool') {
      calls.push(said);
      if (/father/i.test(said)) return tool('update_intake', { fields: { fatherName: 'TEST Testian' }, reason: 'the team said in the chat' });
      if (/remove page/i.test(said)) return tool('remove_pages', { slot: 'client-info', pages: [removePage] });
      if (/Note on/i.test(said)) return tool('remove_pages', { slot: 'client-info', pages: [removePage] });
    }
    if (last.role === 'tool') return text(`Done: ${last.content.slice(0, 80)}`);
    if (/Return JSON of the form/.test(b)) return text(JSON.stringify({ fields: {}, confidence: {}, sources: {}, documentCategories: {}, documentOwners: {}, notes: [] }));
    if (body.response_format) return text(JSON.stringify({ readinessScore: 80, summary: 'ok', missingDocuments: [], weaknesses: [], strengths: [], rotations: {}, mirrored: [], pages: {}, sure: {} }));
    return text('Dear Visa Officer,\n\nA fictional letter.\n\nSincerely,\nTest');
  });
});
await new Promise((r) => ai.listen(AI, r));

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-data-'));
const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: { ...process.env, AUTH_SECRET: 'agent-secret-value-at-least-32-characters', DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'), ADMIN_EMAIL: 'boss@firm.test', OPENAI_API_KEY: 'stub', OPENAI_BASE_URL: `http://127.0.0.1:${AI}/v1`, ANTHROPIC_API_KEY: '', GOOGLE_SERVICE_ACCOUNT_JSON: '', ...(process.env.E2E_FORMS_CACHE ? {} : {}) },
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pdf = async (title, pages) => {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) d.addPage([595, 842]).drawText(`${title} page ${i}`, { x: 60, y: 760, size: 20, font: f });
  return Buffer.from(await d.save());
};
const built = async (id) => {
  for (let i = 0; i < 300; i++) {
    const j = (await call('GET', `/api/applications/${id}/final-files`)).data;
    if (j?.job?.status !== 'running') return j;
    await sleep(1000);
  }
  return null;
};
const cinfo = (j) => j?.built?.files?.find((f) => f.slot === 'client-info');

try {
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch {} await sleep(500); }
  await call('POST', '/api/auth/register', { email: 'boss@firm.test', password: 'password123', name: 'Negar Demo' });
  const id = (await call('POST', '/api/applications', { type: 'study-permit', clientNumber: 'S99997', title: 'Sara Example', representation: 'firm' })).data.application.id;

  // 1. A fact told in the chat goes into the intake, and the activity says so.
  let r = await call('POST', '/api/assistant', { appId: id, messages: [{ role: 'user', content: "The client's father's name is TEST Testian" }] });
  ok(r.status === 200 && r.data.actions?.[0]?.name === 'update_intake' && r.data.actions[0].ok, `the assistant updates the intake (${JSON.stringify(r.data?.actions || r.data)})`);
  const app = (await call('GET', `/api/applications/${id}`)).data.application;
  ok(app.data.fatherName === 'TEST Testian', 'the father\'s name is in the intake');
  const act = (await call('GET', `/api/applications/${id}/activity`)).data.activity || [];
  const line = act.find((a) => /assistant updated the intake/i.test(a.action));
  ok(line && (line.items || []).some((x) => /Father.*TEST Testian/.test(x)) && /Negar Demo/.test(line.detail || ''), `the activity records it, and who asked (${line ? `${line.action} · ${line.items} · ${line.detail}` : 'none'})`);

  // 2. "Remove page N" of Client Information: gone after the rebuild, and on later rebuilds.
  const fd = new FormData();
  fd.append('files', new Blob([await pdf('Employment letter', 2)], { type: 'application/pdf' }), '113 - Employment Letter - Sara.pdf');
  fd.append('files', new Blob([await pdf('Title deed', 3)], { type: 'application/pdf' }), '120 - Title Deed - Sara.pdf');
  await call('POST', `/api/applications/${id}/upload`, null, fd);
  await call('POST', `/api/applications/${id}/final-files`, { slot: 'client-info' });
  let j = await built(id);
  const before = cinfo(j);
  ok(before?.pageMap?.length === before?.pages, `Client Information is built and knows what each page is (${before?.pages} pages)`);
  removePage = (before?.pageMap || []).findIndex((m) => m.docId && /Title Deed/.test(m.filename) && m.page === 2) + 1;
  r = await call('POST', '/api/assistant', { appId: id, messages: [{ role: 'user', content: `Please remove page ${removePage} of the client info` }] });
  ok(r.data.actions?.[0]?.name === 'remove_pages' && r.data.actions[0].ok, `the assistant takes the page out (${JSON.stringify(r.data.actions)})`);
  await sleep(1500);
  j = await built(id);
  const after = cinfo(j);
  ok(after?.pages === before.pages - 1, `the rebuilt file has one page fewer (${before.pages} → ${after?.pages})`);
  ok(!after.pageMap.some((m) => /Title Deed/.test(m.filename || '') && m.page === 2), 'and the page that was taken out is not in it');
  await call('POST', `/api/applications/${id}/final-files`, { slot: 'client-info' });
  j = await built(id);
  ok(cinfo(j)?.pages === before.pages - 1, 'it stays out when the file is built again');

  // 3. A note on a final file, applied now.
  r = await call('POST', `/api/applications/${id}/final-files/note`, { slot: 'client-info', text: 'Take out page 1 of the deed as well', apply: false });
  ok(r.status === 200 && r.data.finalSetup?.notes?.['client-info']?.text === 'Take out page 1 of the deed as well', 'a note is saved on the file');
  removePage = (cinfo(j)?.pageMap || []).findIndex((m) => /Title Deed/.test(m.filename || '') && m.page === 1) + 1;
  r = await call('POST', `/api/applications/${id}/final-files/note`, { slot: 'client-info', text: 'Take out page 1 of the deed as well', apply: true });
  ok(r.status === 200 && r.data.actions?.some((a) => a.ok), `applying the note acts on the file (${JSON.stringify(r.data.actions || r.data)})`);
  await sleep(1500);
  j = await built(id);
  ok(cinfo(j)?.pages === before.pages - 2, `and the file is rebuilt (${cinfo(j)?.pages} pages)`);
  r = await call('POST', `/api/applications/${id}/final-files/note`, { slot: 'imm1294', text: 'x' });
  ok(r.status === 400, 'notes are not taken on the official forms');

  // 4. Voice.
  const vf = new FormData();
  vf.append('audio', new Blob([Buffer.from('fake-webm-audio')], { type: 'audio/webm' }), 'speech');
  r = await call('POST', '/api/assistant/transcribe', null, vf);
  ok(r.status === 200 && /TEST Testian/.test(r.data?.text || ''), `a recording comes back as text (${r.data?.text || r.data?.error})`);
} finally {
  try { process.kill(-server.pid, 'SIGKILL'); } catch {}
  ai.close();
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
console.log(bad ? `\n${bad} FAILED` : '\nALL ASSISTANT CHECKS PASS');
process.exit(bad ? 1 : 0);
