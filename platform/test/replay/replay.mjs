// Replay a past client's application on the platform and compare the result
// with what the team actually submitted. Used by the nightly routine
// (test/replay/README.md); every command works on its own, so the agent can
// look, fill the intake and build in between.
//
//   node test/replay/replay.mjs list [folder]          folders and files (default: DRIVE_CLIENTS_FOLDER)
//   node test/replay/replay.mjs find <text>            folders whose name contains <text>
//   node test/replay/replay.mjs find-file <text>       files of any kind whose name contains <text>
//   node test/replay/replay.mjs csv <file>             a Google Sheet as CSV (the TR-Files sheet)
//   node test/replay/replay.mjs done                   client numbers already replayed (reports folder)
//   node test/replay/replay.mjs start <client folder> --type <type> [--docs <folder>] [--final <folder>]
//   node test/replay/replay.mjs status <client>        intake still missing, documents, form checks
//   node test/replay/replay.mjs answer <client> <answers.json>
//   node test/replay/replay.mjs build <client>         build the final files, download, compare
//   node test/replay/replay.mjs report <client> [file] upload the comparison (and a findings file) to the reports folder
//   node test/replay/replay.mjs night <file>           upload the night's summary to the reports folder
//   node test/replay/replay.mjs clean                  delete every local copy of client data
//
// <client> is the client number (S26123) or the folder id given to start.
//
// Google Drive is read-only here: the platform runs with DRIVE_READ_ONLY=1 (a
// read-only token; every write refused), so nothing in the firm's client
// folders can change. The only writes are by `report`, and only inside the
// folder DRIVE_REPORTS_FOLDER names.
//
// Real client data lives only in REPLAY_DIR (default: the system temp folder,
// never the repository) and in the reports folder.
//
// Needs: GOOGLE_SERVICE_ACCOUNT_JSON, ANTHROPIC_API_KEY (the platform's
// document reader), DRIVE_CLIENTS_FOLDER, DRIVE_REPORTS_FOLDER; `npx next
// build` done; PYTHON_BIN with pikepdf and lxml.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadLib } from '../_load.mjs';

process.env.DRIVE_READ_ONLY = '1';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..', '..');
const REPO = path.resolve(ROOT, '..');
const WORK = path.resolve(process.env.REPLAY_DIR || path.join(os.tmpdir(), 'replay'));
if (WORK.startsWith(REPO + path.sep)) {
  console.error(`REPLAY_DIR (${WORK}) is inside the repository; client data must never be there.`);
  process.exit(2);
}
const PY = process.env.PYTHON_BIN || 'python3';
const PORT = Number(process.env.REPLAY_PORT || 3480);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'replay@firm.local', password: 'replay-password-123', name: 'Replay' };

const drive = await loadLib('drive.js');
const { getSchema, isRequired, answered } = await loadLib('schema.js');
const { getAppType } = await loadLib('appTypes.js');

const [cmd, ...args] = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idOf = (link) => drive.parseDriveLink(String(link || ''))?.id || null;
const FOLDER = drive.FOLDER_MIME;
const STATE = path.join(WORK, 'state.json');
const readState = async () => JSON.parse(await fs.readFile(STATE, 'utf8').catch(() => '{"clients":{}}'));
const writeState = async (s) => {
  await fs.mkdir(WORK, { recursive: true });
  await fs.writeFile(STATE, JSON.stringify(s, null, 1));
};
const human = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

/* ------------------------------ the platform ------------------------------ */
let server = null;
let cookie = '';
async function call(method, url, body) {
  const r = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  let data = null;
  try {
    data = await r.json();
  } catch {}
  return { status: r.status, data };
}
async function until(fn, what, ms = 900000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const v = await fn();
    if (v) return v;
    await sleep(1500);
  }
  throw new Error(`timed out: ${what}`);
}
async function startPlatform() {
  const dataDir = path.join(WORK, 'data');
  await fs.mkdir(path.join(dataDir, 'up'), { recursive: true });
  const mailDir = path.join(WORK, 'no-mail');
  await fs.mkdir(mailDir, { recursive: true });
  let logs = '';
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      AUTH_SECRET: 'replay-secret-value-at-least-32-characters',
      DATA_DIR: dataDir, UPLOAD_DIR: path.join(dataDir, 'up'), ADMIN_EMAIL: ADMIN.email, PYTHON_BIN: PY,
      DRIVE_READ_ONLY: '1', DRIVE_CLIENTS_FOLDER: '',
      // No mailbox, no Odoo: nothing outside this machine is touched.
      MAIL_STUB_DIR: mailDir, MAIL_USER: '', MAIL_PASSWORD: '', MAIL_IMAP_HOST: '', MAIL_POLL_MINUTES: '100000', ODOO_URL: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  server.stdout.on('data', (d) => (logs = (logs + d).slice(-20000)));
  server.stderr.on('data', (d) => (logs = (logs + d).slice(-20000)));
  try {
    await until(async () => {
      try {
        return (await fetch(`${BASE}/api/health`)).ok;
      } catch {
        return false;
      }
    }, 'the platform to start', 90000);
  } catch (e) {
    console.error(logs.slice(-3000));
    throw e;
  }
  const login = await call('POST', '/api/auth/login', { email: ADMIN.email, password: ADMIN.password });
  if (login.status !== 200) await call('POST', '/api/auth/register', ADMIN);
}
function stopPlatform() {
  if (!server) return;
  try {
    process.kill(-server.pid, 'SIGKILL');
  } catch {
    server.kill('SIGKILL');
  }
  server = null;
}

/* ------------------------------ Drive (read-only) ------------------------------ */
async function children(id) {
  return (await drive.listChildren(id)).filter((x) => !x.trashed);
}
const DOCS = /^\s*0?1\s*[-.]\s*(client\s+)?documents?\b/i;
const FINAL = /^\s*0?2\s*[-.]\s*final|final\s+files?/i;
// Folders that are not what the client sent: the team's work, backups, IRCC's letters.
const NOT_CLIENT = /final|generated|working|submit|ircc|decision|correspond|bk\b|backup|old\b|used\b|recovered|archive|sample/i;

async function download(item, dir) {
  const native = /^application\/vnd\.google-apps\./.test(item.mimeType);
  const name = native ? `${item.name}.pdf` : item.name;
  const file = path.join(dir, name.replace(/[\\/:*?"<>|]/g, '-'));
  await drive.downloadToDisk(item.id, file, { exportPdf: native });
  return file;
}

/* ------------------------------ commands ------------------------------ */
async function cmdList() {
  const id = idOf(args[0] || process.env.DRIVE_CLIENTS_FOLDER);
  if (!id) throw new Error('Give a folder link or id (or set DRIVE_CLIENTS_FOLDER).');
  const items = await children(id);
  items.sort((a, b) => String(b.modifiedTime).localeCompare(String(a.modifiedTime)));
  for (const x of items) console.log(`${x.mimeType === FOLDER ? 'DIR ' : '    '}${x.id}  ${String(x.modifiedTime || '').slice(0, 10)}  ${x.size ? human(Number(x.size)).padStart(8) : '        '}  ${x.name}`);
}
async function cmdFind() {
  const text = args.join(' ');
  for (const x of await drive.searchFolders(text)) console.log(`${x.id}  ${x.name}`);
}
async function cmdFindFile() {
  for (const x of await drive.searchFiles(args.join(' '))) console.log(`${x.id}  ${String(x.modifiedTime || '').slice(0, 10)}  ${x.mimeType.replace('application/vnd.google-apps.', 'google-')}  ${x.name}`);
}
async function cmdCsv() {
  const buf = await drive.exportFile(idOf(args[0]), 'text/csv');
  process.stdout.write(buf.toString('utf8'));
}
async function reportsRoot() {
  const id = idOf(process.env.DRIVE_REPORTS_FOLDER);
  if (!id) throw new Error('DRIVE_REPORTS_FOLDER is not set: the link of the Drive folder the firm made for these reports.');
  return id;
}
async function cmdDone() {
  const root = await reportsRoot();
  for (const x of await children(root)) if (x.mimeType === FOLDER) console.log(x.name);
}

async function cmdStart() {
  const folderId = idOf(args[0]);
  const type = flag('type');
  if (!folderId || !type) throw new Error('usage: start <client folder> --type <type>');
  if (getAppType(type).key !== type) throw new Error(`unknown type ${type}`);
  const folder = await drive.getItem(folderId);
  const number = (folder.name.match(/\bS\d{5}\b/) || [folderId])[0];
  const title = folder.name.replace(/^\s*S\d{5}\s*[-–]\s*/, '').trim() || number;
  const dir = path.join(WORK, number);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(path.join(dir, 'team'), { recursive: true });

  const kids = await children(folderId);
  const sub = kids.filter((x) => x.mimeType === FOLDER);
  const docs = flag('docs') ? { id: idOf(flag('docs')) } : sub.find((x) => DOCS.test(x.name));
  const finals = flag('final') ? { id: idOf(flag('final')), name: 'final' } : sub.find((x) => FINAL.test(x.name));
  if (!finals) console.log(`! No final files folder found in "${folder.name}" — give it with --final`);

  // The team's final files (read-only), as submitted.
  const team = [];
  if (finals) {
    for (const x of await children(finals.id)) {
      if (x.mimeType === FOLDER) continue;
      team.push(path.basename(await download(x, path.join(dir, 'team'))));
    }
  }

  await startPlatform();
  try {
    const r = await call('POST', '/api/applications', { type, clientNumber: number, title, representation: 'firm' });
    const appId = r.data?.application?.id;
    if (!appId) throw new Error(`could not open the file: ${JSON.stringify(r.data)}`);
    // What the client sent: the documents folder, or every folder that is not the team's.
    const sources = docs ? [docs] : sub.filter((x) => !NOT_CLIENT.test(x.name));
    for (const s of sources) {
      const j = await call('POST', `/api/applications/${appId}/drive-import`, { url: s.id });
      if (j.status !== 202) throw new Error(`import of ${s.name || s.id} failed: ${j.data?.error}`);
      await until(async () => {
        const job = (await call('GET', `/api/applications/${appId}/drive-import`)).data?.job;
        return job && job.status !== 'running' ? job : null;
      }, 'the Drive import');
    }
    const loose = docs ? [] : kids.filter((x) => x.mimeType !== FOLDER);
    if (loose.length) {
      const fd = new FormData();
      const tmp = path.join(dir, 'loose');
      await fs.mkdir(tmp, { recursive: true });
      for (const x of loose) {
        const f = await download(x, tmp);
        fd.append('files', new Blob([await fs.readFile(f)]), path.basename(f));
      }
      await fetch(`${BASE}/api/applications/${appId}/upload`, { method: 'POST', headers: { cookie }, body: fd });
      await fs.rm(tmp, { recursive: true, force: true });
    }
    // Read every document and fill the intake, as the team presses "Read documents & fill intake".
    await until(async () => (await call('GET', `/api/applications/${appId}/extract`)).data?.job?.status !== 'running', 'reading on arrival');
    await call('POST', `/api/applications/${appId}/extract`, { applicant: title });
    const job = await until(async () => {
      const j = (await call('GET', `/api/applications/${appId}/extract`)).data?.job;
      return j && j.status !== 'running' ? j : null;
    }, 'reading the documents', 1800000);
    const state = await readState();
    state.clients[number] = { appId, folderId, type, title, docs: docs?.id || null, final: finals?.id || null, team, startedAt: new Date().toISOString() };
    await writeState(state);
    console.log(`Opened ${number} (${type}) — reading: ${job.status}${job.error ? ` ${job.error}` : ''}`);
    console.log(`Team's final files: ${team.length} in ${path.join(dir, 'team')}`);
    await printStatus(number, appId, type);
  } finally {
    stopPlatform();
  }
}

async function clientOf(key) {
  const state = await readState();
  const c = state.clients[key] || Object.values(state.clients).find((x) => x.folderId === key);
  if (!c) throw new Error(`no replay for ${key} — run start first`);
  const number = Object.keys(state.clients).find((k) => state.clients[k] === c);
  return { ...c, number };
}

function missingIntake(type, data) {
  return getSchema(type).steps.flatMap((s) => s.fields.filter((f) => isRequired(f, data) && !answered(f, data)).map((f) => ({ step: s.title, id: f.id, label: f.label, type: f.type, options: f.options })));
}

async function printStatus(number, appId, type) {
  const app = (await call('GET', `/api/applications/${appId}`)).data.application;
  const docs = app.documents || [];
  const byCat = {};
  for (const d of docs) (byCat[d.category || 'unrecognised'] ||= []).push(d.filename);
  const miss = missingIntake(type, app.data || {});
  const out = { number, type, documents: docs.length, byCategory: byCat, intakeMissing: miss };
  // Where each document is on this machine, to open it and find the answers the intake still needs.
  const files = docs.map((d) => ({ filename: d.filename, category: d.category || null, original: d.originalName || d.drivePath || null, file: d.stored ? path.join(WORK, 'data', 'up', appId, d.stored) : null }));
  await fs.writeFile(path.join(WORK, number, 'status.json'), JSON.stringify({ ...out, files, data: app.data }, null, 1));
  console.log(`\nDocuments: ${docs.length}`);
  for (const [c, names] of Object.entries(byCat)) console.log(`  ${c}: ${names.length}`);
  console.log(`\nIntake still missing (${miss.length}):`);
  for (const m of miss) console.log(`  [${m.step}] ${m.id} — ${m.label}${m.options ? ` (${m.options.join(' | ')})` : ''}`);
  console.log(`\nFull answers so far: ${path.join(WORK, number, 'status.json')}`);
}

async function cmdStatus() {
  const c = await clientOf(args[0]);
  await startPlatform();
  try {
    await printStatus(c.number, c.appId, c.type);
  } finally {
    stopPlatform();
  }
}

async function cmdAnswer() {
  const c = await clientOf(args[0]);
  const answers = JSON.parse(await fs.readFile(args[1], 'utf8'));
  await startPlatform();
  try {
    const app = (await call('GET', `/api/applications/${c.appId}`)).data.application;
    const r = await call('PATCH', `/api/applications/${c.appId}`, { data: answers, baseDataVersion: app.dataVersion });
    console.log(r.status === 200 ? `Saved ${Object.keys(answers).length} answers.` : `Not saved: ${r.data?.error}`);
    await printStatus(c.number, c.appId, c.type);
  } finally {
    stopPlatform();
  }
}

async function cmdBuild() {
  const c = await clientOf(args[0]);
  const dir = path.join(WORK, c.number);
  const plat = path.join(dir, 'platform');
  await fs.rm(plat, { recursive: true, force: true });
  await fs.mkdir(path.join(plat, 'forms'), { recursive: true });
  await startPlatform();
  try {
    const plan = (await call('GET', `/api/applications/${c.appId}/final-files`)).data || {};
    await call('POST', `/api/applications/${c.appId}/final-files`, { cleanPages: true, fixRotation: true });
    const job = await until(async () => {
      const j = (await call('GET', `/api/applications/${c.appId}/final-files`)).data?.job;
      return j && j.status !== 'running' ? j : null;
    }, 'building the final files', 1800000);
    const app = (await call('GET', `/api/applications/${c.appId}`)).data.application;
    for (const f of app.finalFiles?.files || job.result?.files || []) {
      const dl = await fetch(`${BASE}/api/applications/${c.appId}/download/${f.key}`, { headers: { cookie } });
      await fs.writeFile(path.join(plat, f.filename || f.name), Buffer.from(await dl.arrayBuffer()));
    }
    const checks = {};
    for (const g of (app.generated || []).filter((x) => /-filled$/.test(x.key))) {
      const dl = await fetch(`${BASE}/api/applications/${c.appId}/download/${g.key}`, { headers: { cookie } });
      await fs.writeFile(path.join(plat, 'forms', `${g.key}.pdf`), Buffer.from(await dl.arrayBuffer()));
      checks[g.key.replace(/-filled$/, '')] = (g.checks || []).map((x) => (typeof x === 'string' ? x : x.text));
    }
    const cmp = spawnSync(PY, [path.join(here, 'compare.py'), path.join(dir, 'team'), plat], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHON_BIN: PY } });
    if (cmp.status !== 0) throw new Error(`compare failed: ${cmp.stderr.slice(-1500)}`);
    const compare = JSON.parse(cmp.stdout);
    const result = {
      number: c.number, type: c.type, builtAt: new Date().toISOString(), build: { status: job.status, error: job.error || null, problems: job.result?.problems || [] },
      unplaced: (plan.unplaced || []).map((u) => u.filename || u), intakeMissing: missingIntake(c.type, app.data || {}), formChecks: checks, compare,
    };
    await fs.writeFile(path.join(dir, 'compare.json'), JSON.stringify(result, null, 1));
    await fs.writeFile(path.join(dir, 'compare.md'), markdown(result));
    console.log(`Build: ${job.status}${job.error ? ` ${job.error}` : ''}`);
    console.log(`Comparison: ${path.join(dir, 'compare.md')} (files: ${plat} vs ${path.join(dir, 'team')})`);
    console.log(summary(result));
  } finally {
    stopPlatform();
  }
}

function summary(r) {
  const c = r.compare;
  const forms = c.files.filter((f) => f.form?.comparable);
  return [
    `Files: ${c.files.length} matched, ${c.teamOnly.length} only in the team's set, ${c.platformOnly.length} only in the platform's`,
    `Forms compared: ${forms.map((f) => `${f.label} ${f.form.diffs.length} boxes differ`).join(', ') || 'none'}`,
    `Packages with pages only in the team's copy: ${c.files.filter((f) => f.pagesOnlyTeam?.length).map((f) => `${f.label} (${f.pagesOnlyTeam.length})`).join(', ') || 'none'}`,
  ].join('\n');
}

function markdown(r) {
  const c = r.compare;
  const md = [`# Replay ${r.number} — ${r.type}`, '', `Built ${r.builtAt.slice(0, 16)} · build ${r.build.status}${r.build.error ? ` (${r.build.error})` : ''}`, '', '## Summary', summary(r), ''];
  md.push('## Final files', '', '| Team | Platform | Pages (team / platform) |', '|---|---|---|');
  for (const f of c.files) md.push(`| ${f.team} | ${f.platform} | ${f.teamPages} / ${f.platformPages} |`);
  for (const f of c.teamOnly) md.push(`| ${f.name} | — missing | ${f.pages} / — |`);
  for (const f of c.platformOnly) md.push(`| — | ${f} (extra) | — |`);
  md.push('', `Order — team: ${c.order.team.join(' · ')}`, '', `Order — platform: ${c.order.platform.join(' · ')}`, '');
  for (const f of c.files.filter((x) => x.pagesOnlyTeam?.length || x.pagesOnlyPlatform?.length)) {
    md.push(`## ${f.label}: pages that differ`, '');
    for (const p of f.pagesOnlyTeam) md.push(`- team p.${p.page} not in the platform's: ${p.text || '(scan)'}`);
    for (const p of f.pagesOnlyPlatform) md.push(`- platform p.${p.page} not in the team's: ${p.text || '(scan)'}`);
    md.push('');
  }
  for (const f of c.files.filter((x) => x.form)) {
    md.push(`## ${f.label}: form boxes`, '');
    if (!f.form.comparable) {
      md.push(`Not compared: ${f.form.why}`, '');
      continue;
    }
    md.push(`${f.form.same} the same · ${f.form.teamOnly} filled only by the team · ${f.form.platformOnly} only by the platform · ${f.form.diffs.length} differ`, '', '| Box | Team | Platform |', '|---|---|---|');
    for (const d of f.form.diffs) md.push(`| ${d.caption ? `${d.caption.slice(0, 60)} ` : ''}\`${d.path.split('/').slice(-3).join('/')}\` | ${String(d.team).replace(/\|/g, '/')} | ${String(d.platform).replace(/\|/g, '/')} |`);
    md.push('');
  }
  if (r.intakeMissing.length) md.push('## Intake still missing', ...r.intakeMissing.map((m) => `- [${m.step}] ${m.label}`), '');
  for (const [k, list] of Object.entries(r.formChecks)) if (list.length) md.push(`## ${k}: flagged for the team`, ...list.map((x) => `- ${x}`), '');
  if (r.unplaced.length) md.push('## Documents not placed in any final file', ...r.unplaced.map((u) => `- ${u}`), '');
  if (r.build.problems.length) md.push('## Build problems', ...r.build.problems.map((p) => `- ${p.filename}: ${p.reason}`), '');
  return md.join('\n');
}

/** Upload files into one subfolder of the reports folder — the only Drive writes this tool makes. */
async function uploadToReports(sub, files) {
  const root = await reportsRoot();
  process.env.DRIVE_READ_ONLY = '';
  try {
    let folder = (await children(root)).find((x) => x.mimeType === FOLDER && x.name === sub);
    if (!folder) folder = await drive.createFolder(root, sub);
    const parents = await drive.getParents(folder.id);
    if (!parents.includes(root)) throw new Error('refusing to write outside the reports folder');
    const stamp = new Date().toISOString().slice(0, 10);
    for (const file of files) {
      const ext = path.extname(file);
      const mime = ext === '.json' ? 'application/json' : ext === '.md' ? 'text/markdown' : ext === '.html' ? 'text/html' : ext === '.pdf' ? 'application/pdf' : 'text/plain';
      await drive.uploadFile(folder.id, `${stamp} - ${path.basename(file)}`, mime, await fs.readFile(file));
    }
    console.log(`Uploaded ${files.length} file(s) to "${sub}" in the reports folder.`);
  } finally {
    process.env.DRIVE_READ_ONLY = '1';
  }
}

async function cmdReport() {
  const c = await clientOf(args[0]);
  const dir = path.join(WORK, c.number);
  const files = ['compare.md', 'compare.json', ...(args[1] ? [args[1]] : [])].map((f) => (path.isAbsolute(f) ? f : path.join(dir, f)));
  await uploadToReports(`${c.number} - ${c.type}`, files);
}

async function cmdNight() {
  if (!args[0]) throw new Error('usage: night <file>');
  await uploadToReports('00 - Nightly summaries', [path.resolve(args[0])]);
}

async function cmdClean() {
  await fs.rm(WORK, { recursive: true, force: true });
  console.log(`Deleted ${WORK}`);
}

const COMMANDS = { list: cmdList, find: cmdFind, 'find-file': cmdFindFile, csv: cmdCsv, night: cmdNight, done: cmdDone, start: cmdStart, status: cmdStatus, answer: cmdAnswer, build: cmdBuild, report: cmdReport, clean: cmdClean };
if (!COMMANDS[cmd]) {
  console.log(fs.readFile ? (await fs.readFile(fileURLToPath(import.meta.url), 'utf8')).split('\n').filter((l) => l.startsWith('//')).slice(0, 19).map((l) => l.slice(3)).join('\n') : '');
  process.exit(cmd ? 2 : 0);
}
try {
  await COMMANDS[cmd]();
} catch (e) {
  stopPlatform();
  console.error(`Error: ${e.message}`);
  process.exit(1);
}
process.exit(0);
