import { APP_TYPE_LIST } from './appTypes';

/**
 * Read-only access to the firm's Odoo: the cards (tasks) of the TR Visa project.
 * Each main applicant has a card titled "S26213 - Anahita Mousavi"; a client
 * may have several cards, the most recent one being the current file.
 *
 *   ODOO_URL       https://yourcompany.odoo.com
 *   ODOO_DB        database name (Settings → Activate developer mode shows it; on
 *                  odoo.com it is usually the subdomain)
 *   ODOO_USER      the login (email) of the Odoo user whose API key is used
 *   ODOO_API_KEY   Odoo → My Profile → Account Security → New API Key
 *   ODOO_PROJECT   project name to read (default "Visa - TR"; word order and
 *                  punctuation don't matter, so "TR Visa" finds it too)
 *
 * JSON-RPC over HTTPS (/jsonrpc); the platform never writes to Odoo.
 */

export function odooConfig() {
  const url = String(process.env.ODOO_URL || '').trim().replace(/\/+$/, '');
  return {
    url,
    db: process.env.ODOO_DB || '',
    user: process.env.ODOO_USER || '',
    key: process.env.ODOO_API_KEY || '',
    project: process.env.ODOO_PROJECT || 'Visa - TR',
    configured: Boolean(url && process.env.ODOO_DB && process.env.ODOO_USER && process.env.ODOO_API_KEY),
  };
}

let session = { uid: null, at: 0 };

async function rpc(service, method, args) {
  const cfg = odooConfig();
  const res = await fetch(`${cfg.url}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: Date.now(), params: { service, method, args } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Odoo answered HTTP ${res.status}.`);
  if (data.error) throw new Error(`Odoo: ${data.error.data?.message || data.error.message || 'error'}`);
  return data.result;
}

async function uid() {
  const cfg = odooConfig();
  if (!cfg.configured) throw new Error('Odoo is not connected. Set ODOO_URL, ODOO_DB, ODOO_USER and ODOO_API_KEY on the server.');
  if (session.uid && Date.now() - session.at < 30 * 60 * 1000) return session.uid;
  const id = await rpc('common', 'authenticate', [cfg.db, cfg.user, cfg.key, {}]);
  if (!id) throw new Error('Odoo refused the sign-in. Check ODOO_DB, ODOO_USER and ODOO_API_KEY.');
  session = { uid: id, at: Date.now() };
  return id;
}

async function call(model, method, args, kwargs = {}) {
  const cfg = odooConfig();
  return rpc('object', 'execute_kw', [cfg.db, await uid(), cfg.key, model, method, args, kwargs]);
}

/* ------------------------------ reading cards ------------------------------ */

const NUMBER = /\b([A-Z]{0,2}\d{5,7})\b/i;

/**
 * "S26213 - Anahita Mousavi - Study Permit" → { number: "S26213", name: "Anahita Mousavi", rest: "Study Permit" }.
 * The number is the first token that looks like one; the name runs to the next " - " or "(".
 */
export function parseTitle(title) {
  const t = String(title || '').replace(/\s+/g, ' ').trim();
  const m = t.match(NUMBER);
  const number = m ? m[1].toUpperCase() : '';
  let after = m ? `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}` : t;
  after = after.replace(/^[\s\-–—:.,|#]+/, '').trim();
  const cut = after.search(/\s[-–—|]\s|\(|\/|,/);
  const name = (cut >= 0 ? after.slice(0, cut) : after).replace(/[\s\-–—:.,|]+$/, '').trim();
  const rest = cut >= 0 ? after.slice(cut).replace(/^[\s\-–—|(/,]+/, '').replace(/\)\s*$/, '').trim() : '';
  return { number, name, rest };
}

// Words on a card that name the application type, most specific first.
const TYPE_WORDS = [
  [/super\s*visa/i, 'super-visa'],
  [/visitor\s*record|extension|extend/i, 'visitor-record'],
  [/\bc\s*11\b|entrepreneur/i, 'imp-c11'],
  [/\bsowp\b/i, 'sowp-inside'],
  [/business/i, 'trv-business'],
  [/\bowp\b|open\s*work|work\s*permit/i, 'owp-outside'],
  [/study|student|\bsp\b|college|university/i, 'study-permit'],
  [/\btrv\b|visitor|visit|tourist|multiple\s*entry/i, 'trv-outside'],
];

/** The application type a card's title, tags or stage mention — or null. */
export function detectType(text) {
  const s = String(text || '');
  const code = s.match(/\b(100-\d{3})\b/)?.[1];
  if (code) {
    const t = APP_TYPE_LIST.find((x) => x.service === code);
    if (t) return t.key;
  }
  for (const [re, key] of TYPE_WORDS) if (re.test(s) && APP_TYPE_LIST.some((t) => t.key === key)) return key;
  return null;
}

let fieldCache = null;

const words = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * The project to read: the exact name, else the same words in any order
 * ("TR Visa" = "Visa - TR"), else the one name containing all the words.
 */
async function findProject(name) {
  const projects = await call('project.project', 'search_read', [[]], { fields: ['id', 'name'], limit: 1000 });
  const want = words(name);
  const key = (w) => [...w].sort().join(' ');
  const project =
    projects.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()) ||
    projects.find((p) => key(words(p.name)) === key(want)) ||
    projects.filter((p) => want.every((w) => words(p.name).includes(w))).sort((a, b) => a.name.length - b.name.length)[0];
  if (!project) {
    const names = projects.map((p) => p.name).slice(0, 12).join(', ');
    throw new Error(`No Odoo project named "${name}". Projects found: ${names}. Set ODOO_PROJECT to the right one.`);
  }
  return project;
}

/**
 * The open cards of the TR Visa project, newest first:
 * [{ taskId, title, number, name, type, createdAt, updatedAt, stage, tags, assignees }]
 * Archived cards and cards in folded (closed) stages are left out unless `all`.
 */
export async function listCards({ all = false } = {}) {
  const cfg = odooConfig();
  const project = await findProject(cfg.project);

  if (!fieldCache) fieldCache = Object.keys(await call('project.task', 'fields_get', [], { attributes: ['type'] }));
  const has = (f) => fieldCache.includes(f);
  const fields = ['id', 'name', 'create_date', 'write_date', 'stage_id', ...['tag_ids', 'user_ids', 'user_id', 'partner_id'].filter(has)];
  const domain = [['project_id', '=', project.id]];
  if (!all && has('stage_id')) domain.push(['stage_id.fold', '=', false]);
  const tasks = await call('project.task', 'search_read', [domain], { fields, order: 'create_date desc', limit: 2000 });

  // Tag names and assignee emails, in two batch reads.
  const tagIds = [...new Set(tasks.flatMap((t) => t.tag_ids || []))];
  const tags = tagIds.length ? new Map((await call('project.tags', 'read', [tagIds], { fields: ['name'] })).map((x) => [x.id, x.name])) : new Map();
  const userIds = [...new Set(tasks.flatMap((t) => [...(t.user_ids || []), ...(Array.isArray(t.user_id) ? [t.user_id[0]] : [])]))];
  const users = userIds.length ? new Map((await call('res.users', 'read', [userIds], { fields: ['login', 'email'] })).map((u) => [u.id, String(u.email || u.login || '').toLowerCase()])) : new Map();

  return tasks.map((t) => {
    const p = parseTitle(t.name);
    const tagNames = (t.tag_ids || []).map((id) => tags.get(id)).filter(Boolean);
    const stage = Array.isArray(t.stage_id) ? t.stage_id[1] : '';
    return {
      taskId: t.id,
      projectId: project.id,
      title: t.name,
      number: p.number,
      name: p.name || (Array.isArray(t.partner_id) ? t.partner_id[1] : ''),
      type: detectType([p.rest, ...tagNames, t.name].join(' ')),
      createdAt: odooDate(t.create_date),
      updatedAt: odooDate(t.write_date),
      stage,
      tags: tagNames,
      assignees: [...(t.user_ids || []), ...(Array.isArray(t.user_id) ? [t.user_id[0]] : [])].map((id) => users.get(id)).filter(Boolean),
    };
  });
}

/** Odoo datetimes are "YYYY-MM-DD HH:MM:SS" in UTC. */
const odooDate = (s) => (s ? `${String(s).replace(' ', 'T')}Z` : '');

/** A link that opens the card in Odoo (works across Odoo versions). */
export function cardUrl(taskId) {
  const { url } = odooConfig();
  return url && taskId ? `${url}/web#id=${taskId}&model=project.task&view_type=form` : '';
}

/** For tests: forget the signed-in session and field list. */
export function resetOdoo() {
  session = { uid: null, at: 0 };
  fieldCache = null;
}
