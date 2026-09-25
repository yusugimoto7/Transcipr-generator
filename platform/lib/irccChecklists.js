import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { DATA_DIR } from './store';
import { ensureForm, fetchWithTimeout } from './forms/fetchForms';
import { IRCC_FORMS } from './forms/registry';
import { getAppType } from './appTypes';
import { completeJson } from './ai';
import { CATEGORY_KEYS } from './generators/classify';

/**
 * IRCC's own, current document requirements for an application — so the
 * firm's checklist is never behind IRCC.
 *
 * Two kinds of source per application:
 *   general  the document checklist for the line of business (IMM 5484 visit,
 *            IMM 5483 study, IMM 5488 work; IMM 5555 / 5556 / 5558 in Canada).
 *            Found through the form's canada.ca page, so a new version is
 *            picked up the day IRCC publishes it (lib/forms/fetchForms.js).
 *   office   the local visa office instructions for the country the client
 *            applies from (e.g. Iran → Ankara: IMM 5855 visit, IMM 5816 study;
 *            the work permit page for Iran). Outside-Canada applications only.
 *
 * Each source is re-checked when it is older than IRCC_CHECK_HOURS (24 h):
 * the text is fingerprinted, and only a changed text is read again by the AI
 * into a list of documents mapped to the platform's document categories. The
 * items added and removed at each change are kept, so staff can see what IRCC
 * changed and when. Checks run in the background; pages never wait on IRCC.
 */

const STORE = path.join(DATA_DIR, 'ircc-checklists.json');
const FRESH_MS = Number(process.env.IRCC_CHECK_HOURS || 24) * 3600 * 1000;
const LEGACY = 'https://ircc.canada.ca';
const MAX_TEXT = 60000;

/** Which general checklist and which country page apply, by type group. */
const LINES = {
  'Study — outside Canada': { checklist: 'imm5483', office: 'student' },
  'Work — outside Canada': { checklist: 'imm5488', office: 'work' },
  'Visit — outside Canada': { checklist: 'imm5484', office: 'visa' },
  'Study — inside Canada': { checklist: 'imm5555' },
  'Work — inside Canada': { checklist: 'imm5556' },
  'Visit — inside Canada': { checklist: 'imm5558' },
};
const OFFICE_LABEL = { visa: 'Visit', student: 'Study', work: 'Work' };

/* ------------------------------ countries ------------------------------ */

const ALIASES = {
  iran: 'IR', 'iran, islamic republic of': 'IR', persia: 'IR', ایران: 'IR',
  turkey: 'TR', türkiye: 'TR', turkiye: 'TR',
  uae: 'AE', 'united arab emirates': 'AE', emirates: 'AE', dubai: 'AE',
  usa: 'US', 'united states': 'US', 'united states of america': 'US',
  uk: 'GB', 'united kingdom': 'GB', 'great britain': 'GB', england: 'GB',
  russia: 'RU', 'south korea': 'KR', 'korea, south': 'KR', 'republic of korea': 'KR',
  'north korea': 'KP', syria: 'SY', vietnam: 'VN', laos: 'LA', moldova: 'MD', bolivia: 'BO',
  venezuela: 'VE', tanzania: 'TZ', 'czech republic': 'CZ', czechia: 'CZ', 'hong kong': 'HK',
  macau: 'MO', macao: 'MO', taiwan: 'TW', palestine: 'PS', 'ivory coast': 'CI', "côte d'ivoire": 'CI',
  burma: 'MM', myanmar: 'MM', 'cape verde': 'CV', 'cabo verde': 'CV', swaziland: 'SZ', eswatini: 'SZ',
};
let byName = null;

/** ISO 3166 alpha-2 code for a country name as typed in the intake, or null. */
export function countryCode(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  if (/^[a-z]{2}$/.test(n)) return n.toUpperCase();
  if (ALIASES[n]) return ALIASES[n];
  if (!byName) {
    byName = new Map();
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a, b);
        try {
          const label = dn.of(code);
          if (label && label !== code) byName.set(label.toLowerCase(), code);
        } catch {
          /* not a region */
        }
      }
    }
  }
  return byName.get(n) || null;
}

/* ------------------------------- sources ------------------------------- */

// Work permits: canada.ca keeps one list mapping each country to its visa
// office requirements PDF (the ircc.canada.ca work page builds its text in
// the browser, so it can't be read).
const WORK_COUNTRY_LIST =
  'https://www.canada.ca/en/immigration-refugees-citizenship/services/application/application-forms-guides/apply-work-permit-outside-canada/ajax-work-country-requirements-eng/_jcr_content/par.html';

function officePageUrl(office, cc) {
  if (office === 'work') return WORK_COUNTRY_LIST;
  return `${LEGACY}/english/information/applications/${office}.asp?countrySelect=${cc}`;
}

/**
 * The instruction PDFs a country page links: [{ href, label }].
 * Visit / study country pages label them "Visa office instructions – …";
 * the work list has one entry per country (class="IR"), sometimes several PDFs.
 */
export function officeLinks(html, office, cc) {
  let scope = html;
  if (office === 'work') {
    const start = html.search(new RegExp(`<(?:span|div) class="${cc}">`));
    if (start < 0) return [];
    const rest = html.slice(start + 1);
    const next = rest.search(/<li(?:\s[^>]*)?>\s*<(?:span|div) class="/);
    scope = next < 0 ? rest : rest.slice(0, next);
  }
  const out = [];
  for (const m of scope.matchAll(/<a\s[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = decode(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (office !== 'work' && !/visa office instructions|additional document/i.test(label)) continue;
    if (!out.some((o) => o.href === m[1])) out.push({ href: m[1], label });
  }
  return out;
}

/** The IRCC sources that apply to an application. */
export function sourcesFor(app) {
  const line = LINES[getAppType(app?.type).group];
  if (!line) return [];
  const form = IRCC_FORMS[line.checklist];
  const out = [{ id: `checklist:${line.checklist}`, kind: 'general', formKey: line.checklist, code: form.code, title: form.title, page: form.page }];
  if (line.office) {
    const country = app.data?.countryOfResidence || app.data?.citizenship || '';
    const cc = countryCode(country);
    if (cc) {
      out.push({
        id: `office:${line.office}:${cc}`,
        kind: 'office',
        office: line.office,
        cc,
        country,
        title: `Visa office instructions — ${OFFICE_LABEL[line.office]} (applying from ${country})`,
        page: officePageUrl(line.office, cc),
      });
    }
  }
  return out;
}

/* ------------------------------- storage ------------------------------- */

let writing = Promise.resolve();

export async function readStore() {
  try {
    return JSON.parse(await fs.readFile(STORE, 'utf8'));
  } catch {
    return { sources: {} };
  }
}

function saveRecord(id, record) {
  writing = writing.then(async () => {
    const store = await readStore();
    store.sources[id] = record;
    await fs.mkdir(path.dirname(STORE), { recursive: true });
    await fs.writeFile(STORE, JSON.stringify(store, null, 1));
  });
  return writing;
}

/* ------------------------------ reading ------------------------------ */

function pdfToText(buffer) {
  return new Promise((resolve, reject) => {
    (async () => {
      const file = path.join(os.tmpdir(), `ircc-${crypto.randomBytes(6).toString('hex')}.pdf`);
      await fs.writeFile(file, buffer);
      const p = spawn('pdftotext', ['-layout', '-enc', 'UTF-8', file, '-']);
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('error', reject);
      p.on('close', (code) => {
        fs.unlink(file).catch(() => {});
        if (code === 0) resolve(out);
        else reject(new Error(`pdftotext failed: ${err.slice(0, 200)}`));
      });
    })().catch(reject);
  });
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&mdash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

const versionOf = (text) => text.match(/IMM\s?\d{4}\s?E\s?\((\d{2}-\d{4})\)/)?.[1] || null;

/** Fetch a source's current text: { text, url, version, documents:[{code,title,url}] } */
export async function fetchSource(src, force) {
  if (src.kind === 'general') {
    const f = await ensureForm(src.formKey, { force });
    const text = await pdfToText(await fs.readFile(f.path));
    return { text, url: f.url, version: versionOf(text) || (f.version !== 'unknown' ? f.version : null), documents: [{ code: src.code, title: src.title, url: f.url }] };
  }
  // Office: the country page, plus every "Visa office instructions" PDF it links.
  const res = await fetchWithTimeout(src.page, {}, 20000);
  if (!res.ok) throw new Error(`IRCC page answered ${res.status}`);
  const html = await res.text();
  const documents = [];
  const parts = [];
  for (const { href, label } of officeLinks(html, src.office, src.cc)) {
    const url = new URL(href, LEGACY).toString();
    if (documents.some((d) => d.url === url)) continue;
    const pdf = await fetchWithTimeout(url, {}, 30000);
    if (!pdf.ok) continue;
    const text = await pdfToText(Buffer.from(await pdf.arrayBuffer()));
    const code = label.match(/IMM\s?\d{4}/i)?.[0].toUpperCase().replace(/IMM\s?/, 'IMM ') || null;
    documents.push({ code, title: label, url, version: versionOf(text) });
    parts.push(`=== ${label} ===\n${text}`);
  }
  if (!parts.length) {
    // No office instructions for this country: nothing beyond the general checklist.
    return { text: '', url: src.page, version: null, documents: [] };
  }
  const text = parts.join('\n\n');
  return { text, url: src.page, version: documents.map((d) => d.version).filter(Boolean).join(', ') || null, documents };
}

/** Ask the model for the document list in a checklist's text. */
async function parseItems(src, text) {
  const result = await completeJson({
    system: `You read official IRCC (Immigration, Refugees and Citizenship Canada) document checklists and visa office instructions, and list every supporting document an applicant is asked to provide. Use IRCC's own wording; never add documents that are not in the text.`,
    content: [
      {
        type: 'text',
        text: `Source: ${src.title}${src.code ? ` (${src.code})` : ''}

List every document the applicant must (or, in stated circumstances, should) provide. Return JSON:
{
  "visaOffice": "<visa office named in the text, or null>",
  "items": [
    {
      "document": "<short name, e.g. 'Bank statements (past 6 months)'>",
      "details": "<what exactly IRCC asks for, 1-2 sentences>",
      "condition": "<when it applies, e.g. 'if self-employed' — null if it always applies>",
      "category": "<one of the categories below>"
    }
  ]
}

Categories: ${CATEGORY_KEYS.filter((k) => k !== 'internal').join(', ')}, form, fee
(form = an IRCC application form to complete, e.g. IMM 5257, IMM 5707; fee = fee payment
receipt; other = none of the categories fits). One item per distinct document — combine a
document's sub-bullets into its details.

Text:
${text.slice(0, MAX_TEXT)}`,
      },
    ],
    maxTokens: 6000,
    temperature: 0,
  });
  const valid = new Set([...CATEGORY_KEYS, 'form', 'fee']);
  return {
    visaOffice: result.visaOffice || null,
    items: (Array.isArray(result.items) ? result.items : [])
      .filter((i) => i && i.document)
      .map((i) => ({
        document: String(i.document).trim(),
        details: String(i.details || '').trim(),
        condition: i.condition ? String(i.condition).trim() : null,
        category: valid.has(i.category) ? i.category : 'other',
      })),
  };
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function doRefresh(src, force) {
  const store = await readStore();
  const prev = store.sources[src.id] || null;
  const now = new Date().toISOString();
  try {
    const got = await fetchSource(src, force);
    const hash = crypto.createHash('sha256').update(got.text.replace(/\s+/g, ' ').trim()).digest('hex');
    const base = { ...src, url: got.url, documents: got.documents, version: got.version, checkedAt: now, error: null };
    if (!got.text.trim()) {
      await saveRecord(src.id, { ...(prev || {}), ...base, hash, items: [], changedAt: prev?.changedAt || now, changes: prev?.changes || [] });
      return;
    }
    if (prev && prev.hash === hash && Array.isArray(prev.items)) {
      await saveRecord(src.id, { ...prev, ...base });
      return;
    }
    const parsed = await parseItems(src, got.text);
    const changes = [...(prev?.changes || [])];
    if (prev?.items) {
      const before = new Set(prev.items.map((i) => norm(i.document)));
      const after = new Set(parsed.items.map((i) => norm(i.document)));
      changes.unshift({
        at: now,
        version: got.version,
        added: parsed.items.filter((i) => !before.has(norm(i.document))).map((i) => i.document),
        removed: prev.items.filter((i) => !after.has(norm(i.document))).map((i) => i.document),
      });
    }
    await saveRecord(src.id, { ...base, visaOffice: parsed.visaOffice, hash, items: parsed.items, changedAt: now, changes: changes.slice(0, 20) });
  } catch (e) {
    // Keep the last good copy; record the failure.
    await saveRecord(src.id, { ...(prev || src), checkedAt: prev?.checkedAt || null, error: e.message || String(e), errorAt: now });
  }
}

const inflight = (globalThis.__irccInflight ||= new Map());

/** Re-check one source (deduplicated while a check is running). */
export function refreshSource(src, { force = false } = {}) {
  if (inflight.has(src.id)) return inflight.get(src.id);
  const p = doRefresh(src, force).finally(() => inflight.delete(src.id));
  inflight.set(src.id, p);
  return p;
}

/** Every general checklist, plus the office pages already known. */
export async function allKnownSources() {
  const store = await readStore();
  const out = new Map();
  for (const line of Object.values(LINES)) {
    const f = IRCC_FORMS[line.checklist];
    out.set(`checklist:${line.checklist}`, { id: `checklist:${line.checklist}`, kind: 'general', formKey: line.checklist, code: f.code, title: f.title, page: f.page });
  }
  for (const r of Object.values(store.sources)) {
    if (r.kind === 'office') out.set(r.id, { id: r.id, kind: 'office', office: r.office, cc: r.cc, country: r.country, title: r.title, page: r.page });
  }
  return [...out.values()];
}

/** Admin: re-check everything now (in the background). */
export async function refreshAll({ force = true } = {}) {
  const sources = await allKnownSources();
  sources.forEach((s) => refreshSource(s, { force }));
  return sources.length;
}

export function checking() {
  return [...inflight.keys()];
}

/**
 * The IRCC requirements for an application, from the stored copies. Stale or
 * missing sources are re-checked in the background (pass wait to await).
 */
export async function irccFor(app, { wait = false } = {}) {
  const sources = sourcesFor(app);
  let store = await readStore();
  const pending = [];
  for (const s of sources) {
    const rec = store.sources[s.id];
    const stale = !rec || !rec.checkedAt || Date.now() - new Date(rec.checkedAt).getTime() > FRESH_MS;
    if (stale) pending.push(refreshSource(s));
  }
  if (wait && pending.length) {
    await Promise.all(pending);
    store = await readStore();
  }
  return sources.map((s) => {
    const rec = store.sources[s.id] || {};
    return { ...s, ...rec, id: s.id, checking: inflight.has(s.id) };
  });
}

/**
 * Compare IRCC's items with the firm's checklist for this file: which are
 * covered (and by which code), which the firm's list lacks (added to the
 * file's checklist), and which are forms / fees the platform handles.
 */
export function compareWithChecklist(records, firmItems) {
  const firmByKey = new Map();
  for (const i of firmItems) if (!firmByKey.has(i.key)) firmByKey.set(i.key, i);
  const covered = [];
  const extra = [];
  const handled = [];
  const seen = new Set();
  for (const r of records) {
    for (const it of r.items || []) {
      const key = `${norm(it.document)}|${it.category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const source = r.code || r.documents?.map((d) => d.code).filter(Boolean).join(', ') || r.title;
      if (it.category === 'form' || it.category === 'fee') {
        handled.push({ ...it, source });
      } else if (firmByKey.has(it.category)) {
        covered.push({ ...it, source, coveredBy: `${firmByKey.get(it.category).code} ${firmByKey.get(it.category).label}` });
      } else {
        extra.push({
          id: `IRCC|${source}|${it.document}`,
          key: it.category === 'other' ? null : it.category,
          code: 'IRCC',
          label: it.document,
          hint: it.details,
          cond: it.condition || '',
          tr: false,
          party: 'ircc',
          source,
          // Conditional items, and ones no document type can prove, are shown
          // but not counted as missing.
          optional: Boolean(it.condition) || it.category === 'other',
        });
      }
    }
  }
  return { covered, extra, handled };
}
