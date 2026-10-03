// Self-test of the nightly replay (test/replay/replay.mjs) on a fictional
// client in a stand-in Google Drive: the client's documents folder and the
// team's final files (from the last E2E run of that type), a reports folder,
// and a stand-in AI. Checks the whole replay works and that nothing is written
// to Drive outside the reports folder.
//
//   npx next build && node test/e2e/run.mjs owp-outside && node test/replay/selftest.mjs
import { spawn } from 'child_process';
import http from 'http';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PROFILES } from '../e2e/profiles.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TYPE = process.argv[2] || 'owp-outside';
const P = PROFILES[TYPE];
const E2E_OUT = path.join(here, '..', 'e2e', 'out', TYPE);
const GOOGLE = 3497;
const AI = 3498;
const FOLDER = 'application/vnd.google-apps.folder';
let bad = 0;
const ok = (cond, what) => {
  if (!cond) bad++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${what}`);
};

const teamFiles = (await fs.readdir(E2E_OUT).catch(() => [])).filter((f) => /^\d\d - /.test(f));
if (!teamFiles.length) {
  console.log(`No final files in ${E2E_OUT}: run node test/e2e/run.mjs ${TYPE} first.`);
  process.exit(1);
}

/* ------------------------------ stand-in Drive ------------------------------ */
const pdf = async (title) => {
  const d = await PDFDocument.create();
  const font = await d.embedFont(StandardFonts.Helvetica);
  d.addPage([595, 842]).drawText(`${title} — fictional test document`, { x: 60, y: 760, size: 16, font });
  return Buffer.from(await d.save());
};
const tree = {
  clientsRoot0001: { name: 'Clients', mimeType: FOLDER, parents: [] },
  clientFolder001: { name: `S99001 - ${P.file.title}`, mimeType: FOLDER, parents: ['clientsRoot0001'] },
  docsFolder00001: { name: '01 - Documents', mimeType: FOLDER, parents: ['clientFolder001'] },
  finalFolder0001: { name: '02 - Final Files', mimeType: FOLDER, parents: ['clientFolder001'] },
  bkFolder0000001: { name: 'bk', mimeType: FOLDER, parents: ['clientFolder001'] },
  reportsFolder01: { name: 'Replay Reports', mimeType: FOLDER, parents: [] },
};
let n = 1;
for (const d of [...P.emailed, ...P.uploaded]) tree[`docFile${String(n++).padStart(6, '0')}`] = { name: d.name.replace(/\.jpg$/, '.pdf'), mimeType: 'application/pdf', parents: ['docsFolder00001'], bytes: await pdf(d.name) };
for (const f of teamFiles) tree[`teamFile${String(n++).padStart(6, '0')}`] = { name: f, mimeType: f.endsWith('.jpg') ? 'image/jpeg' : 'application/pdf', parents: ['finalFolder0001'], bytes: await fs.readFile(path.join(E2E_OUT, f)) };
const writes = [];
const scopes = new Set();
const under = (id, top) => id === top || (tree[id]?.parents || []).some((p) => under(p, top));
const meta = (id) => ({ id, name: tree[id].name, mimeType: tree[id].mimeType, modifiedTime: '2026-09-01T00:00:00Z', parents: tree[id].parents, size: String(tree[id].bytes?.length || 0) });
const send = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const google = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${GOOGLE}`);
  let body = Buffer.alloc(0);
  for await (const c of req) body = Buffer.concat([body, c]);
  if (u.pathname === '/token') {
    const jwt = new URLSearchParams(body.toString()).get('assertion') || '';
    scopes.add(JSON.parse(Buffer.from(jwt.split('.')[1] || '', 'base64url').toString() || '{}').scope);
    return send(res, 200, { access_token: 'tok', expires_in: 3600 });
  }
  if (req.method !== 'GET') {
    // Every write: allowed only inside the reports folder.
    let parent = null;
    if (u.pathname.endsWith('/files') && req.method === 'POST') {
      const raw = body.toString('latin1');
      const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.indexOf('}', raw.indexOf('"parents"')) + 1) || '{}');
      parent = j.parents?.[0];
      const id = `written${String(n++).padStart(6, '0')}`;
      tree[id] = { name: j.name, mimeType: j.mimeType || 'text/plain', parents: [parent] };
      writes.push({ method: req.method, parent, name: j.name, inside: under(parent, 'reportsFolder01') });
      return send(res, 200, meta(id));
    }
    writes.push({ method: req.method, path: u.pathname, inside: false });
    return send(res, 403, { error: 'refused' });
  }
  if (u.pathname === '/drive/v3/files') {
    const q = u.searchParams.get('q') || '';
    const parent = q.match(/'([^']+)' in parents/)?.[1];
    const contains = q.match(/name contains '([^']*)'/)?.[1];
    const files = Object.keys(tree).filter((id) => (!parent || tree[id].parents.includes(parent)) && (!contains || tree[id].name.toLowerCase().includes(contains.toLowerCase()))).map(meta);
    return send(res, 200, { files });
  }
  const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
  const id = m && decodeURIComponent(m[1]);
  if (id && tree[id]) {
    if (u.searchParams.get('alt') === 'media') {
      res.writeHead(200, { 'Content-Type': tree[id].mimeType });
      return res.end(tree[id].bytes || Buffer.alloc(0));
    }
    return send(res, 200, meta(id));
  }
  return send(res, 404, { error: 'notFound' });
});
await new Promise((r) => google.listen(GOOGLE, r));

/* ------------------------------ stand-in AI ------------------------------ */
const ai = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    const body = JSON.parse(b || '{}');
    const json = body.response_format?.type === 'json_object';
    const content = /"datePairs"/.test(b)
      ? JSON.stringify({ documentType: 'document', languages: ['en'], parts: {}, legibility: 'good', facts: {}, datePairs: [], findings: [] })
      : /Return JSON of the form/.test(b)
        ? JSON.stringify({ fields: {}, confidence: {}, sources: {}, documentCategories: {}, documentOwners: {}, notes: [] })
        : json
          ? JSON.stringify({ readinessScore: 80, summary: 'Ready.', missingDocuments: [], weaknesses: [], strengths: [], rotations: {}, mirrored: [], pages: {}, sure: {} })
          : 'Dear Visa Officer,\n\nFictional letter.\n\nSincerely,\nTest';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});
await new Promise((r) => ai.listen(AI, r));

/* ------------------------------ the replay ------------------------------ */
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'replay-selftest-'));
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
const env = {
  ...process.env,
  REPLAY_DIR: work, REPLAY_PORT: '3496',
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'replay@test.iam.gserviceaccount.com', private_key: privateKey }),
  GOOGLE_DRIVE_API_BASE: `http://127.0.0.1:${GOOGLE}/drive/v3`, GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${GOOGLE}/token`,
  DRIVE_CLIENTS_FOLDER: 'clientsRoot0001', DRIVE_REPORTS_FOLDER: 'reportsFolder01',
  OPENAI_API_KEY: 'stub', OPENAI_BASE_URL: `http://127.0.0.1:${AI}/v1`, ANTHROPIC_API_KEY: '',
};
// Not spawnSync: the stand-in Drive and AI answer from this process while the replay runs.
const replay = (...a) =>
  new Promise((resolve) => {
    const c = spawn('node', [path.join(here, 'replay.mjs'), ...a], { env });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
try {
  let r = await replay('list');
  ok(r.code === 0 && r.out.includes('S99001'), 'list the clients folder');
  r = await replay('start', 'clientFolder001', '--type', TYPE);
  ok(r.code === 0 && /Opened S99001/.test(r.out), `start: open the file and import the documents${r.code ? ` — ${r.out.slice(-800)}` : ''}`);
  const team = await fs.readdir(path.join(work, 'S99001', 'team')).catch(() => []);
  ok(team.length === teamFiles.length, `start: the team's ${teamFiles.length} final files downloaded (${team.length})`);
  const st = JSON.parse(await fs.readFile(path.join(work, 'S99001', 'status.json'), 'utf8').catch(() => '{}'));
  ok(st.documents === P.emailed.length + P.uploaded.length, `start: only the documents folder imported, not the final files or bk (${st.documents})`);
  // Fill the intake as the profile's documents and the team would.
  const answers = { ...Object.assign({}, ...Object.values(P.reads).map((x) => x.fields || {})), ...P.team, email: P.email };
  await fs.writeFile(path.join(work, 'answers.json'), JSON.stringify(answers));
  r = await replay('answer', 'S99001', path.join(work, 'answers.json'));
  ok(r.code === 0 && /Saved/.test(r.out), 'answer: the intake is filled');
  r = await replay('build', 'S99001');
  ok(r.code === 0 && /Build: done/.test(r.out), `build: final files built and compared${r.code ? ` — ${r.out.slice(-800)}` : ''}`);
  const cmp = JSON.parse(await fs.readFile(path.join(work, 'S99001', 'compare.json'), 'utf8').catch(() => '{"compare":{"files":[],"teamOnly":[],"platformOnly":[]}}'));
  // The stand-in AI sorts no document, so the team's document files are missing on the platform's side: reported, not matched wrongly.
  ok(cmp.compare.files.length >= 8 && !cmp.compare.platformOnly.length, `compare: every platform file paired with the team's (${cmp.compare.files.length} of ${teamFiles.length}; only the team's: ${cmp.compare.teamOnly.map((f) => f.name).join(', ') || 'none'}; only the platform's: ${cmp.compare.platformOnly.join(', ') || 'none'})`);
  const main = cmp.compare.files.find((f) => f.form?.comparable);
  ok(!!main, `compare: a form compared box by box (${main ? `${main.label}: ${main.form.same} same, ${main.form.diffs.length} differ` : 'none'})`);
  r = await replay('report', 'S99001');
  ok(r.code === 0 && /Uploaded/.test(r.out), 'report: uploaded to the reports folder');
  r = await replay('done');
  ok(r.out.includes(`S99001 - ${TYPE}`), 'done: the client shows as replayed');
  ok(writes.length > 0 && writes.every((w) => w.inside), `Drive: every write is inside the reports folder (${writes.length} writes${writes.some((w) => !w.inside) ? `; outside: ${JSON.stringify(writes.filter((w) => !w.inside))}` : ''})`);
  ok(scopes.has('https://www.googleapis.com/auth/drive.readonly'), 'Drive: the platform signed in read-only');
  r = await replay('clean');
  ok(!(await fs.stat(work).catch(() => null)), 'clean: every local copy deleted');
} finally {
  google.close();
  ai.close();
  await fs.rm(work, { recursive: true, force: true });
}
console.log(bad ? `\n${bad} check(s) failed` : '\nReplay self-test passed');
process.exit(bad ? 1 : 0);
