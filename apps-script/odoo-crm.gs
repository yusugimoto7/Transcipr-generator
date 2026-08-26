/**
 * Odoo CRM collector.
 *
 * Pulls crm.lead out of a self-hosted Odoo over JSON-RPC and writes it into extra
 * tabs of the leads spreadsheet, so the dashboard can answer what happened to a
 * lead after the form was submitted.
 *
 * WHY JSON-RPC AND NOT XML-RPC
 *  Odoo's docs lead with XML-RPC, which Apps Script has no client for — it would
 *  mean hand-building XML envelopes and parsing them back. Odoo exposes the same
 *  API over JSON at /jsonrpc, which is a plain UrlFetchApp POST.
 *
 * WHY IT STORES RATHER THAN QUERIES LIVE
 *  Odoo holds current state: stage_id says where a lead is now, not where it was
 *  last month. Pipeline history therefore has to be accumulated, which is what the
 *  CRM Stage Daily tab is for. Per-lead outcomes (won, lost, closed on) are
 *  recoverable at any time and are re-read whenever a record changes.
 *
 * SETUP
 *  The server and login are filled in below, so only two values are needed.
 *
 *  1. In Odoo, open Preferences -> Account Security -> New API Key and copy it.
 *     The key inherits that user's permissions, so a key made from an admin
 *     account can do everything that account can. A dedicated user with read
 *     access to CRM is the safer arrangement once this is running.
 *  2. Add this file to the same Apps Script project as leads-dashboard.gs. Every
 *     name in here is odoo-prefixed, so nothing collides.
 *  3. Project Settings -> Script properties:
 *       ODOO_KEY  the API key from step 1        (required, never put it in code)
 *       ODOO_DB   the database name              (required — see below)
 *     If the database name is not to hand, set nothing else and run
 *     `odooListDatabases`: it asks the server and reports what it finds.
 *     ODOO_URL and ODOO_LOGIN below can also be overridden by properties of the
 *     same name, which is how you would point this at a different server.
 *  4. Run `odooSetup` and read every line of the log. It reports the server
 *     version, whether the login worked, how many leads it can see, and which
 *     fields this Odoo actually has — names moved between Odoo versions, so it
 *     adapts to what is there rather than assuming.
 *  5. Run `odooCollectAll` until it stops saying it ran out of time, then
 *     `odooInstallTrigger` for hourly updates.
 *
 * WHAT LEAVES ODOO
 *  Outcome and attribution fields, plus a lowercased email and the digits of the
 *  phone number. Those two exist only so a CRM record can be matched to a form
 *  submission; they stay in this spreadsheet, which already holds the same
 *  addresses on the lead tabs, and the dashboard endpoint emits match counts
 *  rather than addresses. Names, notes and chatter are never read.
 */

// Filled in so setup needs only the API key and the database name. Both are
// overridable with script properties of the same name.
var ODOO_URL_DEFAULT = 'https://odoo.sugimotogroup.org';
var ODOO_LOGIN_DEFAULT = 'yusugimoto7@gmail.com';

var ODOO_TAB_LEADS = 'CRM Leads';
var ODOO_TAB_STAGES = 'CRM Stage Daily';
var ODOO_PAGE = 400;                    // records per JSON-RPC call
var ODOO_BUDGET_MS = 4.5 * 60 * 1000;   // stop before Apps Script's 6-minute kill
var ODOO_FLUSH_EVERY = 400;
var ODOO_LATE = 'ran out of time — run odooCollectAll again to continue';

/* Fields worth having. Odoo renamed several between versions (lost_reason ->
 * lost_reason_id; won_status is 17+), so the collector asks the server which of
 * these exist and requests only those. */
var ODOO_WANT = ['id', 'email_from', 'phone', 'mobile', 'type', 'active', 'stage_id',
  'probability', 'expected_revenue', 'prorated_revenue', 'create_date', 'date_closed',
  'date_conversion', 'date_deadline', 'user_id', 'team_id', 'source_id', 'medium_id',
  'campaign_id', 'lost_reason_id', 'lost_reason', 'won_status', 'country_id', 'write_date'];

var ODOO_HEADERS = ['id', 'email_norm', 'phone_digits', 'kind', 'status', 'stage',
  'stage_seq', 'probability', 'revenue', 'created', 'closed', 'days_to_close',
  'salesperson', 'team', 'source', 'medium', 'campaign', 'lost_reason', 'country',
  'write_date', 'updated_at'];

var ODOO_STAGE_HEADERS = ['date', 'stage', 'stage_seq', 'open', 'won', 'lost',
  'open_revenue', 'won_revenue', 'updated_at'];

/* ------------------------------------------------------------------- config */
function odooProps() { return PropertiesService.getScriptProperties(); }

function odooConfig() {
  var p = odooProps();
  var cfg = {
    url: (p.getProperty('ODOO_URL') || ODOO_URL_DEFAULT).trim().replace(/\/+$/, ''),
    db: (p.getProperty('ODOO_DB') || '').trim(),
    login: (p.getProperty('ODOO_LOGIN') || ODOO_LOGIN_DEFAULT).trim(),
    key: (p.getProperty('ODOO_KEY') || '').trim(),
    sheetId: (p.getProperty('ODOO_SHEET_ID') || ODOO_SHEET_FALLBACK).trim()
  };
  var missing = ['url', 'db', 'login', 'key'].filter(function (k) { return !cfg[k]; });
  if (missing.length) {
    var names = missing.map(function (k) { return 'ODOO_' + k.toUpperCase(); }).join(', ');
    var extra = missing.indexOf('db') !== -1
      ? ' Run odooListDatabases to have the server report its database names.' : '';
    throw new Error('missing script propert' + (missing.length === 1 ? 'y' : 'ies') +
      ': ' + names + '.' + extra);
  }
  return cfg;
}
// Same workbook as the leads tabs. Overridable with ODOO_SHEET_ID.
var ODOO_SHEET_FALLBACK = '1hiRcyNEA-zggpDW-OldQ1CRcbPVmjMipfpG0BZIiIOU';

function odooBook() { return SpreadsheetApp.openById(odooConfig().sheetId); }

/* -------------------------------------------------------------------- budget */
var odooRunStart = 0;
function odooStartClock() { odooRunStart = Date.now(); }
function odooOutOfTime() {
  if (!odooRunStart) odooStartClock();
  return Date.now() - odooRunStart > ODOO_BUDGET_MS;
}

/* ------------------------------------------------------------------ jsonrpc */
function odooRpc(cfg, service, method, args) {
  var res = UrlFetchApp.fetch(cfg.url + '/jsonrpc', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      jsonrpc: '2.0', method: 'call', id: 1,
      params: { service: service, method: method, args: args }
    }),
    muteHttpExceptions: true, followRedirects: true
  });
  var code = res.getResponseCode();
  var body = res.getContentText();
  var json = null;
  try { json = JSON.parse(body); } catch (err) { json = null; }
  if (!json) {
    // An HTML body almost always means ODOO_URL points at the website rather than
    // the Odoo server root, or something in front is intercepting the call.
    throw new Error('Odoo returned non-JSON (HTTP ' + code + '). Check ODOO_URL is the ' +
      'Odoo server root. First bytes: ' + body.slice(0, 160).replace(/\s+/g, ' '));
  }
  if (json.error) {
    var e = json.error;
    throw new Error('Odoo error: ' +
      ((e.data && (e.data.message || e.data.name)) || e.message || 'unknown'));
  }
  return json.result;
}

var odooUidCache = null;
function odooUid(cfg) {
  if (odooUidCache) return odooUidCache;
  var uid = odooRpc(cfg, 'common', 'authenticate', [cfg.db, cfg.login, cfg.key, {}]);
  if (!uid) {
    var hint = '';
    try {
      var names = odooRpc(cfg, 'db', 'list', []);
      if (names && names.length) hint = ' This server reports these databases: ' + names.join(', ') + '.';
    } catch (err) { /* list_db is often disabled; carry on without the hint */ }
    throw new Error('Odoo rejected the login. Check ODOO_DB, ODOO_LOGIN and ODOO_KEY — the key ' +
      'must be an API key from Preferences -> Account Security, not the account password.' + hint);
  }
  odooUidCache = uid;
  return uid;
}

/** execute_kw against a model. kwargs carries fields, limit, offset, order, context. */
function odooCall(cfg, model, method, args, kwargs) {
  return odooRpc(cfg, 'object', 'execute_kw',
    [cfg.db, odooUid(cfg), cfg.key, model, method, args || [], kwargs || {}]);
}

/**
 * Odoo hides archived records by default and a lost lead is an archived lead, so
 * without this the pipeline would look like it never loses anything.
 */
function odooCtx(extra) {
  var c = { active_test: false };
  for (var k in (extra || {})) c[k] = extra[k];
  return c;
}

/* ------------------------------------------------------------------- fields */
var odooFieldCache = null;
/** Which of ODOO_WANT this particular Odoo actually has. */
function odooFields(cfg) {
  if (odooFieldCache) return odooFieldCache;
  var have = odooCall(cfg, 'crm.lead', 'fields_get', [ODOO_WANT, ['type']], {}) || {};
  odooFieldCache = ODOO_WANT.filter(function (f) { return have[f]; });
  if (odooFieldCache.indexOf('id') === -1) odooFieldCache.unshift('id');
  return odooFieldCache;
}

/* ------------------------------------------------------------------ helpers */
function odooTz() { return Session.getScriptTimeZone(); }
function odooNow() { return Utilities.formatDate(new Date(), odooTz(), "yyyy-MM-dd'T'HH:mm:ss"); }
function odooToday() { return Utilities.formatDate(new Date(), odooTz(), 'yyyy-MM-dd'); }

/** Odoo many2one fields arrive as [id, "Display Name"], or false when unset. */
function odooName(v) {
  if (!v) return '';
  return Object.prototype.toString.call(v) === '[object Array]' ? String(v[1] || '') : String(v);
}
function odooId(v) {
  if (!v) return 0;
  return Object.prototype.toString.call(v) === '[object Array]' ? Number(v[0]) || 0 : Number(v) || 0;
}
function odooStr(v) { return (v === false || v === null || v === undefined) ? '' : String(v).trim(); }
function odooNum(v) {
  if (v === false || v === null || v === undefined || v === '') return '';
  var n = Number(v);
  return isNaN(n) ? '' : n;
}
/** Odoo stores datetimes in UTC as 'yyyy-MM-dd HH:mm:ss'. Only the date is kept. */
function odooDay(v) { return odooStr(v).slice(0, 10); }
function odooEmail(v) { return odooStr(v).toLowerCase(); }
function odooDigits(v) { return odooStr(v).replace(/\D/g, ''); }

/* ------------------------------------------------------------------- stages */
var odooStageCache = null;
function odooStages(cfg) {
  if (odooStageCache) return odooStageCache;
  var rows = odooCall(cfg, 'crm.stage', 'search_read', [[]],
    { fields: ['id', 'name', 'sequence', 'is_won'], context: odooCtx() }) || [];
  var byId = {};
  rows.forEach(function (r) {
    byId[r.id] = { name: odooStr(r.name), seq: Number(r.sequence) || 0, won: !!r.is_won };
  });
  odooStageCache = byId;
  return byId;
}

/**
 * won / lost / open. Odoo 17+ answers directly through won_status; earlier
 * versions have to be inferred, where a lost lead is archived and a won one sits
 * in a stage flagged is_won.
 */
function odooStatus(rec, stage) {
  var ws = odooStr(rec.won_status);
  if (ws) return ws === 'won' ? 'won' : ws === 'lost' ? 'lost' : 'open';
  if (rec.active === false) return 'lost';
  if (stage && stage.won) return 'won';
  if (Number(rec.probability) === 100) return 'won';
  return 'open';
}

function odooRow(cfg, rec) {
  var stage = odooStages(cfg)[odooId(rec.stage_id)];
  var created = odooDay(rec.create_date);
  var closed = odooDay(rec.date_closed);
  var days = '';
  if (created && closed) {
    days = Math.round((Date.parse(closed + 'T00:00:00Z') - Date.parse(created + 'T00:00:00Z')) / 86400000);
  }
  var rev = odooNum(rec.expected_revenue);
  if (rev === '') rev = odooNum(rec.prorated_revenue);
  return {
    id: rec.id,
    email_norm: odooEmail(rec.email_from),
    phone_digits: odooDigits(rec.mobile) || odooDigits(rec.phone),
    kind: odooStr(rec.type) || 'lead',
    status: odooStatus(rec, stage),
    stage: stage ? stage.name : odooName(rec.stage_id),
    stage_seq: stage ? stage.seq : '',
    probability: odooNum(rec.probability),
    revenue: rev,
    created: created,
    closed: closed,
    days_to_close: days,
    salesperson: odooName(rec.user_id),
    team: odooName(rec.team_id),
    source: odooName(rec.source_id),
    medium: odooName(rec.medium_id),
    campaign: odooName(rec.campaign_id),
    lost_reason: odooName(rec.lost_reason_id) || odooName(rec.lost_reason),
    country: odooName(rec.country_id),
    write_date: odooStr(rec.write_date),
    updated_at: odooNow()
  };
}

/* ------------------------------------------------------------------- sheets */
function odooSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  // Append at the end: leads-dashboard.gs reads the first three tabs as leads.
  if (!sh) sh = ss.insertSheet(name, ss.getNumSheets());
  var width = Math.max(headers.length, sh.getLastColumn() || 1);
  var first = sh.getRange(1, 1, 1, width).getValues()[0];
  var same = headers.every(function (h, i) { return String(first[i] || '') === h; });
  if (!same) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function odooRead(sh, headers) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, headers.length).getValues().map(function (row, i) {
    var rec = { _row: i + 2 };
    headers.forEach(function (h, c) { rec[h] = row[c]; });
    return rec;
  });
}

/** Replaces rows sharing a key and appends the rest, so re-runs correct rather than duplicate. */
function odooUpsert(sh, headers, keyFn, rows) {
  if (!rows.length) return { updated: 0, added: 0 };
  var index = {};
  odooRead(sh, headers).forEach(function (rec) {
    var k = keyFn(rec);
    if (k) index[k] = rec._row;
  });
  var appends = [], updated = 0;
  rows.forEach(function (obj) {
    var line = headers.map(function (h) {
      return obj[h] === undefined || obj[h] === null ? '' : obj[h];
    });
    var row = index[keyFn(obj)];
    if (row) { sh.getRange(row, 1, 1, headers.length).setValues([line]); updated++; }
    else appends.push(line);
  });
  if (appends.length) {
    sh.getRange(sh.getLastRow() + 1, 1, appends.length, headers.length).setValues(appends);
  }
  return { updated: updated, added: appends.length };
}

/* ------------------------------------------------------------------ collect */
/**
 * Pulls leads changed since the last run. The cursor only advances once a sweep
 * finishes cleanly, so an interrupted run resumes instead of skipping records.
 */
function odooCollectLeads() {
  var cfg = odooConfig(), ss = odooBook();
  var sh = odooSheet(ss, ODOO_TAB_LEADS, ODOO_HEADERS);
  var fields = odooFields(cfg);
  var cursor = odooProps().getProperty('ODOO_CURSOR') || '';
  var domain = cursor ? [['write_date', '>', cursor]] : [];
  var total = odooCall(cfg, 'crm.lead', 'search_count', [domain], { context: odooCtx() });
  var offset = Number(odooProps().getProperty('ODOO_OFFSET') || 0);
  var rows = [], written = { updated: 0, added: 0 }, ranOut = false, newest = cursor;

  var flush = function () {
    if (!rows.length) return;
    var r = odooUpsert(sh, ODOO_HEADERS, function (x) { return String(x.id); }, rows);
    written.updated += r.updated; written.added += r.added;
    rows = [];
  };

  while (offset < total) {
    if (odooOutOfTime()) { ranOut = true; break; }
    var batch = odooCall(cfg, 'crm.lead', 'search_read', [domain], {
      fields: fields, limit: ODOO_PAGE, offset: offset,
      order: 'write_date asc, id asc', context: odooCtx()
    }) || [];
    if (!batch.length) break;
    batch.forEach(function (rec) {
      var row = odooRow(cfg, rec);
      if (row.write_date > newest) newest = row.write_date;
      rows.push(row);
    });
    offset += batch.length;
    if (rows.length >= ODOO_FLUSH_EVERY) flush();
  }
  flush();

  if (ranOut) {
    // Remember the place so the next run continues the sweep rather than restarting.
    odooProps().setProperty('ODOO_OFFSET', String(offset));
  } else {
    odooProps().deleteProperty('ODOO_OFFSET');
    if (newest) odooProps().setProperty('ODOO_CURSOR', newest);
  }
  Logger.log('CRM Leads -> %s updated, %s added, %s of %s swept%s',
    written.updated, written.added, offset, total, ranOut ? ' — ' + ODOO_LATE : '');
  return written;
}

/**
 * One row per stage per day. Odoo overwrites stage_id in place, so without this
 * there is no way to ask what the pipeline looked like last month.
 */
function odooSnapshotStages() {
  var ss = odooBook();
  var sh = odooSheet(ss, ODOO_TAB_STAGES, ODOO_STAGE_HEADERS);
  var leads = odooRead(odooSheet(ss, ODOO_TAB_LEADS, ODOO_HEADERS), ODOO_HEADERS);
  var today = odooToday(), by = {};
  leads.forEach(function (r) {
    var stage = String(r.stage || '(no stage)');
    var b = by[stage] || (by[stage] = { stage: stage, stage_seq: r.stage_seq, open: 0, won: 0,
      lost: 0, open_revenue: 0, won_revenue: 0 });
    var rev = Number(r.revenue) || 0;
    var st = String(r.status || 'open');
    if (st === 'won') { b.won++; b.won_revenue += rev; }
    else if (st === 'lost') { b.lost++; }
    else { b.open++; b.open_revenue += rev; }
  });
  var rows = Object.keys(by).map(function (k) {
    var b = by[k];
    return { date: today, stage: b.stage, stage_seq: b.stage_seq, open: b.open, won: b.won,
      lost: b.lost, open_revenue: Math.round(b.open_revenue),
      won_revenue: Math.round(b.won_revenue), updated_at: odooNow() };
  });
  var res = odooUpsert(sh, ODOO_STAGE_HEADERS, function (r) {
    var d = Object.prototype.toString.call(r.date) === '[object Date]'
      ? Utilities.formatDate(r.date, odooTz(), 'yyyy-MM-dd') : String(r.date).slice(0, 10);
    return d + '|' + r.stage;
  }, rows);
  Logger.log('CRM Stage Daily -> %s updated, %s added (%s stages)', res.updated, res.added, rows.length);
  return res;
}

/* --------------------------------------------------------------- entrypoints */
function odooCollectAll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('another Odoo sync is already running'); return; }
  odooUidCache = null; odooFieldCache = null; odooStageCache = null;
  odooStartClock();
  try {
    odooCollectLeads();
    if (odooOutOfTime()) Logger.log('skipping the stage snapshot this run: ' + ODOO_LATE);
    else odooSnapshotStages();
    odooProps().setProperty('ODOO_LAST_RUN', odooNow());
    Logger.log('run finished in %ss', Math.round((Date.now() - odooRunStart) / 1000));
  } finally {
    lock.releaseLock();
  }
}

/** One-time check. Run this first and read every line of the log. */
function odooSetup() {
  var cfg = odooConfig();
  odooUidCache = null; odooFieldCache = null; odooStageCache = null;
  Logger.log('endpoint: %s/jsonrpc  db: %s  login: %s', cfg.url, cfg.db, cfg.login);
  var ver = odooRpc(cfg, 'common', 'version', []);
  Logger.log('server version: %s', (ver && (ver.server_version || ver.server_serie)) || '?');
  Logger.log('authenticated as uid %s', odooUid(cfg));

  var fields = odooFields(cfg);
  Logger.log('usable crm.lead fields (%s of %s): %s', fields.length, ODOO_WANT.length, fields.join(', '));
  var absent = ODOO_WANT.filter(function (f) { return fields.indexOf(f) === -1; });
  if (absent.length) Logger.log('absent in this Odoo, so skipped: %s', absent.join(', '));

  var all = odooCall(cfg, 'crm.lead', 'search_count', [[]], { context: odooCtx() });
  var live = odooCall(cfg, 'crm.lead', 'search_count', [[]], {});
  Logger.log('crm.lead: %s total, %s active, %s archived (archived are usually the lost ones)',
    all, live, all - live);

  var stages = odooStages(cfg);
  Logger.log('stages: %s', Object.keys(stages).map(function (id) {
    return stages[id].name + (stages[id].won ? ' (won)' : '');
  }).join(' -> ') || 'none readable');

  var sample = odooCall(cfg, 'crm.lead', 'search_read', [[]],
    { fields: fields, limit: 1, order: 'write_date desc', context: odooCtx() });
  if (sample && sample.length) {
    var row = odooRow(cfg, sample[0]);
    Logger.log('newest record maps to: status=%s stage=%s created=%s closed=%s revenue=%s source=%s',
      row.status, row.stage, row.created, row.closed || '(open)', row.revenue, row.source || '(none)');
    Logger.log('has email: %s · has phone digits: %s — one of the two is needed to match a CRM ' +
      'record back to a form submission', !!row.email_norm, !!row.phone_digits);
  }
  var ss = odooBook();
  odooSheet(ss, ODOO_TAB_LEADS, ODOO_HEADERS);
  odooSheet(ss, ODOO_TAB_STAGES, ODOO_STAGE_HEADERS);
  Logger.log('tabs ready in "%s": %s', ss.getName(),
    ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
  Logger.log('next: run odooCollectAll, repeating while it reports running out of time, then odooInstallTrigger.');
}

/**
 * Asks the server which databases it has. Only ODOO_URL needs to be set to run
 * this, so it is the way out of not knowing what to put in ODOO_DB. Many servers
 * ship with list_db = False, which hides the list — a deliberate hardening rather
 * than a fault, and the log says so instead of failing.
 */
function odooListDatabases() {
  var url = (odooProps().getProperty('ODOO_URL') || ODOO_URL_DEFAULT).trim().replace(/\/+$/, '');
  if (!url) { Logger.log('set ODOO_URL first'); return; }
  Logger.log('asking %s', url + '/jsonrpc');
  try {
    var names = odooRpc({ url: url }, 'db', 'list', []);
    if (names && names.length) {
      Logger.log('databases on this server: %s', names.join(', '));
      Logger.log(names.length === 1
        ? 'one database, so ODOO_DB = ' + names[0]
        : 'pick the one your team logs into and put it in ODOO_DB');
    } else {
      Logger.log('the server answered but listed no databases');
    }
  } catch (err) {
    Logger.log('could not list databases: %s', String(err.message || err));
    Logger.log('That is normal on a hardened server (list_db = False in odoo.conf). ' +
      'Find the name in odoo.conf under db_name, or ask whoever set the server up.');
  }
}

/** Forget the incremental cursor so the next run re-reads every lead. */
function odooResync() {
  odooProps().deleteProperty('ODOO_CURSOR');
  odooProps().deleteProperty('ODOO_OFFSET');
  Logger.log('cursor cleared — the next odooCollectAll re-reads every lead');
}

function odooInstallTrigger() {
  odooRemoveTriggers();
  ScriptApp.newTrigger('odooCollectAll').timeBased().everyHours(1).create();
  Logger.log('trigger installed: odooCollectAll every hour');
}

function odooRemoveTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'odooCollectAll') ScriptApp.deleteTrigger(t);
  });
}
