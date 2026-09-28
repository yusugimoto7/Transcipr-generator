import fs from 'fs/promises';
import path from 'path';
import { simpleParser } from 'mailparser';
import { DATA_DIR, listAllApplications, getApplication, updateApplication, listUsers } from './store';
import { saveUpload, isAllowedType, readUpload } from './uploads';
import { classifyByFilename } from './generators/classify';
import { buildChecklist } from './checklist';
import { ensureClientFolder } from './driveStore';
import { startExtractJob, getExtractJob } from './extractJob';
import { driveStatus, parseDriveLink, uploadFile } from './drive';
import { recordEmail, analyzeEmailSafe } from './emailFacts';
import { MAX_BODY } from './emails';

/**
 * Email intake: documents clients send to the team's mailbox
 * (visa@sugimotovisa.com) arrive on the right file by themselves.
 *
 * Every few minutes the mailbox is checked over IMAP (the mailbox is at
 * IONOS). For each new message:
 *   1. the sender is matched to a file — the client (contract) number in the
 *      subject or body ("S26160"), or the sender's address: the client's email
 *      on their Odoo card, an address staff attached to the file, the intake's
 *      email address, or the applicant's login;
 *   2. the attachments (PDF, JPG, PNG, WEBP, DOCX; zips are unpacked) are
 *      saved on the file, then read and checked like any upload;
 *   3. each document is named the team's way from what the reading found —
 *      "103 - Passport - Zahra.pdf" — and filed in the client's Drive folder
 *      under "01 - Documents" (the folder is created, mirroring the firm's
 *      layout, if the client has none yet).
 * Every filed message — with or without documents — also keeps its text on
 * the file and is read for the facts it states (lib/emailFacts.js).
 * A message with documents that matches no file (or several) waits in the
 * Email intake inbox for staff to assign; the sender is then remembered for
 * that file. One without documents that matches no file is listed too, and
 * staff can file it the same way.
 *
 * The mailbox itself is never changed — the platform only remembers the last
 * message it processed (data/mail.json).
 *
 * Configuration (environment):
 *   MAIL_USER, MAIL_PASSWORD        the mailbox and its password (required)
 *   MAIL_IMAP_HOST, MAIL_IMAP_PORT  default imap.ionos.com : 993
 *   MAIL_FOLDER                     default INBOX
 *   MAIL_POLL_MINUTES               default 5
 *   MAIL_SINCE_DAYS                 on the first run, how far back to look (default 7)
 *   DRIVE_CLIENTS_FOLDER            link or ID of the folder holding the client folders
 *   MAIL_STUB_DIR                   tests: a folder of .eml files read instead of IMAP
 */

const STORE = path.join(DATA_DIR, 'mail.json');
const MAX_ATTACHMENT = 25 * 1024 * 1024;
const MAX_PER_RUN = 50;
const BY_EXT = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
const CLIENT_NO = /\b(S[A-Z]?\d{5,9})\b/i;
const normNo = (s) => String(s || '').trim().toUpperCase();

export function mailConfig() {
  const stub = process.env.MAIL_STUB_DIR || null;
  return {
    configured: Boolean(stub || (process.env.MAIL_USER && process.env.MAIL_PASSWORD)),
    host: process.env.MAIL_IMAP_HOST || 'imap.ionos.com',
    port: Number(process.env.MAIL_IMAP_PORT || 993),
    user: process.env.MAIL_USER || '',
    folder: process.env.MAIL_FOLDER || 'INBOX',
    pollMinutes: Number(process.env.MAIL_POLL_MINUTES || 5),
    sinceDays: Number(process.env.MAIL_SINCE_DAYS || 7),
    clientsFolder: parseDriveLink(process.env.DRIVE_CLIENTS_FOLDER || '')?.id || null,
    stub,
  };
}

/* ------------------------------- storage ------------------------------- */

let writing = Promise.resolve();
export async function readMailStore() {
  try {
    return JSON.parse(await fs.readFile(STORE, 'utf8'));
  } catch {
    return { lastUid: 0, lastCheckAt: null, lastError: null, messages: {} };
  }
}
function saveMailStore(mutate) {
  writing = writing.then(async () => {
    const store = await readMailStore();
    mutate(store);
    await fs.mkdir(path.dirname(STORE), { recursive: true });
    await fs.writeFile(STORE, JSON.stringify(store, null, 1));
    return store;
  });
  return writing;
}

/* ------------------------------- fetching ------------------------------- */

async function parseMessage(uid, source) {
  const m = await simpleParser(source);
  const from = m.from?.value?.[0] || {};
  const text = `${m.subject || ''}\n${m.text || ''}`.slice(0, 20000);
  const body = String(m.text || '').slice(0, MAX_BODY);
  return {
    id: m.messageId || `uid:${uid}`,
    uid,
    from: { address: String(from.address || '').toLowerCase(), name: from.name || '' },
    subject: m.subject || '',
    date: (m.date || new Date()).toISOString(),
    text,
    body,
    attachments: (m.attachments || []).map((a) => ({
      name: a.filename || 'attachment',
      size: a.size || a.content?.length || 0,
      mime: a.contentType || BY_EXT[path.extname(a.filename || '').toLowerCase()] || 'application/octet-stream',
      content: a.content,
    })),
  };
}

/** New messages since the last run: [{ id, uid, from, subject, date, text, attachments }]. */
async function fetchNew(store) {
  const cfg = mailConfig();
  const out = [];
  if (cfg.stub) {
    const files = (await fs.readdir(cfg.stub)).filter((f) => f.endsWith('.eml')).sort();
    for (let i = 0; i < files.length; i++) {
      const uid = i + 1;
      if (uid <= (store.lastUid || 0)) continue;
      out.push(await parseMessage(uid, await fs.readFile(path.join(cfg.stub, files[i]))));
    }
    return out;
  }
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: cfg.port === 993, auth: { user: cfg.user, pass: process.env.MAIL_PASSWORD }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(cfg.folder);
    try {
      let uids;
      if (store.lastUid) uids = await client.search({ uid: `${store.lastUid + 1}:*` }, { uid: true });
      else uids = await client.search({ since: new Date(Date.now() - cfg.sinceDays * 86400000) }, { uid: true });
      uids = (uids || []).filter((u) => u > (store.lastUid || 0)).sort((a, b) => a - b).slice(0, MAX_PER_RUN);
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (msg?.source) out.push(await parseMessage(uid, msg.source));
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}

/** Messages by UID (for staff filing after a restart, and for saving earlier emails' text). */
async function fetchByUids(uids) {
  const cfg = mailConfig();
  const out = [];
  if (!uids.length) return out;
  if (cfg.stub) {
    const files = (await fs.readdir(cfg.stub)).filter((f) => f.endsWith('.eml')).sort();
    for (const uid of uids) if (files[uid - 1]) out.push(await parseMessage(uid, await fs.readFile(path.join(cfg.stub, files[uid - 1]))));
    return out;
  }
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow({ host: cfg.host, port: cfg.port, secure: cfg.port === 993, auth: { user: cfg.user, pass: process.env.MAIL_PASSWORD }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock(cfg.folder);
    try {
      for (const uid of uids) {
        const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (m?.source) out.push(await parseMessage(uid, m.source));
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}

/* ------------------------------- matching ------------------------------- */

/** Which file a message belongs to: { app } | { candidates: [...] }. */
export async function matchApplication(msg, apps, users) {
  const addr = msg.from.address;
  const byUser = new Map((users || []).map((u) => [u.id, String(u.email || '').toLowerCase()]));
  const clientNo = (msg.text || '').match(CLIENT_NO)?.[1]?.toUpperCase();
  const onCard = (a) => Boolean(addr) && (a.odoo?.emails || []).includes(addr);
  const fromSender = (a) =>
    addr &&
    (onCard(a) ||
      (a.clientEmails || []).map((e) => e.toLowerCase()).includes(addr) ||
      String(a.data?.email || '').toLowerCase() === addr ||
      byUser.get(a.userId) === addr);
  if (clientNo) {
    const hit = apps.filter((a) => String(a.clientNumber || '').toUpperCase() === clientNo);
    if (hit.length === 1) return { app: hit[0], how: `client number ${clientNo}` };
    if (hit.length > 1) {
      // A family shares the number (lib/cases.js): the sender's own file, else
      // the main applicant's — the family has one Drive folder either way.
      const own = hit.filter(fromSender);
      if (own.length === 1) return { app: own[0], how: `client number ${clientNo} and sender ${addr}` };
      const main = hit.filter((a) => (a.applicantRole || 'main') === 'main');
      if (main.length === 1) return { app: main[0], how: `client number ${clientNo} (main applicant's file)` };
      return { candidates: hit.map((a) => a.id) };
    }
  }
  const byEmail = apps.filter(fromSender);
  if (byEmail.length === 1) return { app: byEmail[0], how: `sender ${addr}${onCard(byEmail[0]) ? ' (the email on the Odoo card)' : ''}` };
  // Several files for one sender: a family — the main applicant's file.
  const mainOnly = byEmail.filter((a) => (a.applicantRole || 'main') === 'main');
  if (byEmail.length > 1 && mainOnly.length === 1 && new Set(byEmail.map((a) => normNo(a.clientNumber) || a.groupId || a.id)).size === 1) return { app: mainOnly[0], how: `sender ${addr} (main applicant's file)` };
  return { candidates: byEmail.map((a) => a.id) };
}

/* ------------------------------ processing ------------------------------ */

async function unzip(buffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const out = [];
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || /(^|\/)(__MACOSX|\.DS_Store)/.test(entry.name)) continue;
    const base = path.basename(entry.name);
    const mime = BY_EXT[path.extname(base).toLowerCase()];
    if (!mime) continue;
    out.push({ name: base, mime, content: await entry.async('nodebuffer') });
  }
  return out;
}

/** Save a message's attachments on a file. Returns the new document ids and what was skipped. */
export async function attachToApplication(msg, app) {
  const added = [];
  const skipped = [];
  for (const a of msg.attachments) {
    const ext = path.extname(a.name).toLowerCase();
    let items = [{ name: a.name, mime: BY_EXT[ext] || a.mime, content: a.content }];
    if (ext === '.zip' || /zip/.test(a.mime)) {
      try {
        items = await unzip(a.content);
      } catch {
        skipped.push({ name: a.name, reason: 'could not open the zip' });
        continue;
      }
    }
    for (const it of items) {
      if (!isAllowedType(it.mime)) {
        skipped.push({ name: it.name, reason: /heic/i.test(it.name) ? 'HEIC photo — ask for JPG' : `unsupported type (${it.mime})` });
        continue;
      }
      if (!it.content || it.content.length > MAX_ATTACHMENT) {
        skipped.push({ name: it.name, reason: 'too large' });
        continue;
      }
      try {
        const meta = await saveUpload(app.id, {
          buffer: it.content,
          filename: it.name,
          mime: it.mime,
          category: classifyByFilename(it.name, app.type),
          maxBytes: MAX_ATTACHMENT,
          extra: { source: 'email', mailId: msg.id, mailFrom: msg.from.address, mailDate: msg.date, originalFilename: it.name },
        });
        added.push(meta);
      } catch (e) {
        skipped.push({ name: it.name, reason: e.message });
      }
    }
  }
  if (added.length) {
    await updateApplication(app.id, (a) => {
      a.documents = [...(a.documents || []), ...added];
      if (a.status === 'draft') a.status = 'in-progress';
      return a;
    });
  }
  return { added, skipped };
}

/* ------------------------------ naming ------------------------------ */

const SHORT = {
  passport: 'Passport', 'national-id': 'Birth Certificate and National ID', photo: 'Photo', transcripts: 'Transcripts', certificates: 'Certificate',
  loa: 'LOA', pal: 'PAL', deposit: 'Tuition Payment', language: 'Language Test', 'proof-of-funds': 'Bank Statement', 'source-of-funds': 'Source of Funds',
  'title-deeds': 'Title Deed', 'employment-letter': 'Employment', 'job-offer': 'Job Offer', 'leave-of-absence': 'Leave of Absence', cv: 'CV',
  'ties-docs': 'Ties', 'police-clearance': 'Police Clearance', military: 'Military Service', 'marriage-cert': 'Marriage Certificate', insurance: 'Insurance',
  flight: 'Flight', accommodation: 'Accommodation', medical: 'Medical', 'refusal-letter': 'Previous Application', 'spouse-status': "Spouse's Permit",
  'supporter-id': "Spouse's ID", 'inviter-docs': "Inviter's Documents", 'supporter-bank': "Spouse's Bank Statement", 'supporter-income': "Spouse's Pay Slips",
  'invitation-letter': 'Invitation Letter', 'host-docs': "Host's Documents", 'status-in-canada': 'Permit in Canada', 'last-entry': 'Last Entry',
  'completion-letter': 'Completion Letter', 'consent-letter': 'Consent Letter', 'custody-doc': 'Custody Document', 'travel-history': 'Travel History',
  'enrolment-letter': 'Enrolment Letter', 'residence-abroad': 'Residence Abroad', 'relationship-proof': 'Proof of Relationship', 'medical-insurance': 'Medical Insurance',
  'business-docs': 'Business Documents', 'business-financials': 'Business Financials', 'business-contracts': 'Business Contracts', 'business-employees': 'Business Employees',
  'business-premises': 'Business Premises', 'business-plan': 'Business Plan', questionnaire: 'Questionnaire', 'rep-form': 'IMM Form', internal: 'Form',
};
const safe = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

/** "103 - Passport - Zahra.pdf" for a document, from its category and the file's checklist. */
export function teamFilename(app, doc) {
  const ext = path.extname(doc.originalFilename || doc.filename) || '.pdf';
  const who = String(app.data?.givenName || '').trim().split(/\s+/)[0] || String(app.title || '').replace(/^\s*[A-Z]?\d{3,}\s*[-–_]\s*/i, '').split(/\s+/)[0] || '';
  const suffix = who ? ` - ${safe(who)}` : '';
  if (!doc.category) return `000 - Unidentified - ${safe(path.basename(doc.originalFilename || doc.filename, ext))}${ext}`;
  const item = buildChecklist(app.data || {}, app.type).find((i) => i.key === doc.category);
  const code = item ? String(item.code).replace(/^imm/i, 'IMM') : '000';
  const label = SHORT[doc.category] || (item ? item.label.split(/ — | \(/)[0] : doc.category);
  return `${code} - ${safe(label)}${suffix}${ext}`;
}

/* ------------------------------ Drive filing ------------------------------ */

/** Is `id` inside the clients folder (up to 4 levels)? */
// The client's Drive folder is found or created by lib/driveStore.js (shared with uploads and final files).
export { ensureClientFolder };

/** Name the documents the team's way and put copies in the client's Drive folder. */
export async function fileOnDrive(appId, docIds) {
  let app = await getApplication(appId);
  const result = { renamed: 0, uploaded: 0, folderCreated: false, error: null };
  // Names first (from the categories the reading assigned).
  app = await updateApplication(appId, (a) => {
    for (const d of a.documents || []) {
      if (!docIds.includes(d.id) || d.driveId) continue;
      const nm = teamFilename(a, d);
      if (nm !== d.filename) {
        d.filename = nm;
        result.renamed++;
      }
    }
    return a;
  });
  if (driveStatus().mode !== 'service-account') {
    result.error = 'Google Drive is not connected (GOOGLE_SERVICE_ACCOUNT_JSON).';
    return result;
  }
  try {
    const { docsFolderId, created } = await ensureClientFolder(app);
    result.folderCreated = created;
    for (const d of app.documents || []) {
      if (!docIds.includes(d.id) || d.driveId) continue;
      const bytes = await readUpload(appId, d);
      const up = await uploadFile(docsFolderId, d.filename, d.mime, bytes);
      await updateApplication(appId, (a) => {
        const x = (a.documents || []).find((y) => y.id === d.id);
        if (x) Object.assign(x, { driveId: up.id, driveModified: up.modifiedTime, drivePath: d.filename });
        return a;
      });
      result.uploaded++;
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

/* ------------------------------ the run ------------------------------ */

async function waitForReading(appId) {
  for (let i = 0; i < 720; i++) {
    const j = getExtractJob(appId);
    if (!j || j.status !== 'running') return j;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return null;
}

/** Attach, read and check, name and file on Drive. Updates the message record. */
export async function processInto(msg, app, { how = 'assigned by staff' } = {}) {
  const rec = { status: 'processing', appId: app.id, clientNumber: app.clientNumber || null, how };
  await saveMailStore((s) => {
    Object.assign((s.messages[msg.id] ||= {}), rec);
    delete s.messages[msg.id].body; // the text now lives on the file
  });
  try {
    await recordEmail(app.id, msg, how);
    const { added, skipped } = await attachToApplication(msg, app);
    if (!added.length) {
      await analyzeEmailSafe(app.id, msg.id);
      await saveMailStore((s) => Object.assign(s.messages[msg.id], { status: msg.attachments.length ? 'no-attachments' : 'processed', files: [], skipped, processedAt: new Date().toISOString() }));
      return;
    }
    await waitForReading(app.id);
    await startExtractJob(app.id);
    await waitForReading(app.id);
    const filed = await fileOnDrive(app.id, added.map((d) => d.id));
    await analyzeEmailSafe(app.id, msg.id); // after the documents, so their values come first
    const after = await getApplication(app.id);
    const files = (after.documents || []).filter((d) => added.some((x) => x.id === d.id)).map((d) => ({ docId: d.id, filename: d.filename, category: d.category, driveId: d.driveId || null, check: d.verification?.status || null }));
    await saveMailStore((s) => Object.assign(s.messages[msg.id], { status: 'processed', files, skipped, drive: filed, processedAt: new Date().toISOString() }));
  } catch (e) {
    await saveMailStore((s) => Object.assign(s.messages[msg.id], { status: 'failed', error: e.message, processedAt: new Date().toISOString() }));
  }
}

let running = null;

/** Check the mailbox now (one run at a time). Returns { fetched, processed, unassigned }. */
export function checkMail() {
  if (running) return running;
  running = (async () => {
    const counts = { fetched: 0, processed: 0, unassigned: 0, noAttachments: 0 };
    const store = await readMailStore();
    let msgs;
    try {
      msgs = await fetchNew(store);
    } catch (e) {
      await saveMailStore((s) => Object.assign(s, { lastCheckAt: new Date().toISOString(), lastError: e.message }));
      throw e;
    }
    counts.fetched = msgs.length;
    const apps = await listAllApplications();
    const users = await listUsers();
    for (const msg of msgs) {
      const base = { id: msg.id, uid: msg.uid, from: msg.from, subject: msg.subject, date: msg.date, snippet: snippet(msg.body), receivedAt: new Date().toISOString(), attachments: msg.attachments.map(({ name, size, mime }) => ({ name, size, mime })) };
      const known = store.messages[msg.id];
      if (known && known.status !== 'unassigned') continue; // seen before
      const m = await matchApplication(msg, apps, users);
      if (!msg.attachments.length && !m.app) {
        // No documents and no file: listed (with its text) for staff to file if it matters.
        counts.noAttachments++;
        pending.set(msg.id, msg);
        await saveMailStore((s) => (s.messages[msg.id] = { ...base, status: 'no-attachments', body: msg.body.slice(0, 20000), candidates: m.candidates }));
      } else {
        if (m.app) {
          await saveMailStore((s) => (s.messages[msg.id] = { ...base, status: 'processing' }));
          pending.set(msg.id, msg); // kept in memory for staff re-assignment while the store lacks the content
          await processInto(msg, m.app, { how: m.how });
          counts.processed++;
        } else {
          counts.unassigned++;
          pending.set(msg.id, msg);
          await saveMailStore((s) => (s.messages[msg.id] = { ...base, status: 'unassigned', candidates: m.candidates }));
        }
      }
      await saveMailStore((s) => (s.lastUid = Math.max(s.lastUid || 0, msg.uid)));
    }
    await saveMailStore((s) => Object.assign(s, { lastCheckAt: new Date().toISOString(), lastError: null }));
    return counts;
  })().finally(() => (running = null));
  return running;
}

const snippet = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 220);

// Unassigned messages' attachments, kept until staff assign them (the mailbox
// still has the original; after a restart, "Check now" fetches it again only
// if it is newer than the last processed one — so staff should assign soon).
const pending = (globalThis.__mailPending ||= new Map());

/** Staff assign a waiting message to a file (and optionally remember the sender). */
export async function assignMessage(id, appId, { remember = false } = {}) {
  const app = await getApplication(appId);
  if (!app) throw new Error('File not found.');
  let msg = pending.get(id);
  if (!msg) {
    // Not in memory (server restarted): fetch it again by UID.
    const rec = (await readMailStore()).messages[id];
    if (!rec) throw new Error('Message not found.');
    [msg] = await fetchByUids([rec.uid]);
    if (!msg) throw new Error('The message is no longer in the mailbox.');
  }
  if (remember && msg.from.address) {
    await updateApplication(appId, (a) => {
      a.clientEmails = [...new Set([...(a.clientEmails || []), msg.from.address])];
      return a;
    });
  }
  await processInto(msg, app, { how: 'assigned by staff' });
  pending.delete(id);
  return (await readMailStore()).messages[id];
}

export async function ignoreMessage(id) {
  pending.delete(id);
  await saveMailStore((s) => {
    if (s.messages[id]) s.messages[id].status = 'ignored';
  });
}

/* ------------------------- earlier emails' text ------------------------- */

const B = (globalThis.__mailBackfill ||= { running: false, done: 0, total: 0, saved: 0, filed: 0, error: null, finishedAt: null });

export function backfillStatus() {
  return { ...B };
}

/**
 * Save the text of emails processed before the platform kept it, and read
 * them for facts: messages already filed get their text on the file; those
 * without documents that matched no file are matched again (Odoo email,
 * client number) and filed when they now match. Runs in the background.
 */
export function startBackfill({ limit = 150 } = {}) {
  if (B.running) return backfillStatus();
  Object.assign(B, { running: true, done: 0, total: 0, saved: 0, filed: 0, error: null, finishedAt: null });
  (async () => {
    const store = await readMailStore();
    const apps = await listAllApplications();
    const users = await listUsers();
    const byId = new Map(apps.map((a) => [a.id, a]));
    const todo = Object.values(store.messages)
      .filter((r) => r.uid && !['ignored', 'processing', 'unassigned'].includes(r.status))
      .filter((r) => (r.appId ? byId.has(r.appId) && !(byId.get(r.appId).emails || []).some((e) => e.id === r.id) : r.status === 'no-attachments'))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, limit);
    B.total = todo.length;
    for (let i = 0; i < todo.length; i += 10) {
      const msgs = await fetchByUids(todo.slice(i, i + 10).map((r) => r.uid));
      for (const msg of msgs) {
        const rec = store.messages[msg.id];
        if (rec?.appId) {
          await recordEmail(rec.appId, msg, rec.how || 'earlier email');
          await analyzeEmailSafe(rec.appId, msg.id);
          B.saved++;
        } else if (rec) {
          const m = await matchApplication(msg, apps, users);
          if (m.app) {
            await recordEmail(m.app.id, msg, m.how);
            await analyzeEmailSafe(m.app.id, msg.id);
            await saveMailStore((s) => {
              Object.assign(s.messages[msg.id], { status: 'processed', appId: m.app.id, clientNumber: m.app.clientNumber || null, how: m.how, files: [], processedAt: new Date().toISOString() });
              delete s.messages[msg.id].body;
            });
            B.filed++;
          } else {
            await saveMailStore((s) => Object.assign(s.messages[msg.id], { body: msg.body.slice(0, 20000), snippet: snippet(msg.body) }));
          }
        }
        B.done++;
      }
    }
  })()
    .catch((e) => (B.error = e.message))
    .finally(() => Object.assign(B, { running: false, finishedAt: new Date().toISOString() }));
  return backfillStatus();
}
