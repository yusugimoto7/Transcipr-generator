/**
 * Live data endpoint for the leads dashboard.
 *
 * Returns the same packed, ANONYMISED dataset that scripts/build_dashboard.py
 * produces, so the dashboard can fetch it on every page load instead of shipping
 * a frozen snapshot.
 *
 * SETUP (one time, ~3 minutes)
 *  This is a STANDALONE script — do not paste it into the spreadsheet's own
 *  Apps Script project. That project already runs the lead pipeline, and Apps
 *  Script shares one global namespace per project, so a second doGet() there
 *  would collide with the existing one.
 *
 *  1. Go to https://script.google.com and click "New project".
 *  2. Delete the empty myFunction() stub and paste this whole file.
 *  3. Rename the project (top left) to something like "Leads dashboard API".
 *     SECRET and SHEET_ID below are already filled in — leave them alone.
 *  4. Run the `testBuild` function once from the toolbar. Google will ask for
 *     authorization: it is your own script, so Advanced -> "Go to <project>
 *     (unsafe)" -> Allow. Check the log shows ~11,000 submissions.
 *  5. Deploy -> New deployment -> gear -> Web app
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     Deploy, copy the Web app URL (ends in /exec), and use:
 *       https://script.google.com/macros/s/AKfy.../exec?secret=YOUR_SECRET
 *
 * WHAT LEAVES THIS SCRIPT
 *  Only the packed aggregate: dates, ages, and dictionary-coded categorical
 *  fields. Names, emails, phone numbers, résumé text and the raw submission IDs
 *  are never read into the response. Treat SECRET as obfuscation rather than
 *  security — it is embedded in the dashboard page, so anyone who can open the
 *  dashboard can call this endpoint and get exactly what the dashboard shows.
 */

const SECRET = 'sgv_a7mftc7VvVgM4UaCrI7QRYYhVubQoBEf';
// The leads spreadsheet. Opened by ID so this can live in its own project and
// never touch the sheet-bound script that runs the lead pipeline.
const SHEET_ID = '1hiRcyNEA-zggpDW-OldQ1CRcbPVmjMipfpG0BZIiIOU';
const TABS_TO_READ = 3;       // the first three tabs: Main + the two dated exports
const CACHE_SECONDS = 300;    // serve a cached pack for 5 minutes to keep loads snappy

/* ------------------------------------------------------------------ columns */
var C = {
  name: 'Name & Surname', date: 'Created At', age: 'سن شما',
  dest: 'مقصد مهاجرت', method: 'روش مهاجرت', edu: 'آخرین مقطع تحصیلی؟',
  field: 'رشته آخرین مقطع تحصیلی', employed: 'مشغول به کار', lang: 'سطح زبان',
  meeting: 'جلسه حضوری', channel: 'از چه طریقی با ما آشنا شدید؟',
  mobile: 'Mobile', email: 'Email', budget: 'Budget', source: 'Source',
  medium: 'Medium', campaign: 'Campaign', content: 'Content', form: 'Form (ID)',
  referrer: 'utm_term/Referrer', leadType: 'Lead_Type', nationality: 'Nationality',
  odoo: 'added_to_odoo', sentEmail: 'sent_email', sentSms: 'sent_sms'
};

var FIELD_GROUPS = [
  ['Engineering & tech', ['کامپیوتر','مهندس','برق','مکانیک','عمران','نرم','IT','صنایع','فناوری','رباتیک','معدن','پلیمر','هوافضا','ساخت','نقشه','مخابرات','متالورژ','نفت']],
  ['Business & finance', ['حسابدار','مدیریت','بازرگانی','MBA','اقتصاد','بیمه','بازاریابی','مالی','بانک','صنعتی']],
  ['Health & medicine', ['پزشک','پرستار','دندان','دارو','بهداشت','مامایی','رادیولوژی','تغذیه','فیزیوتراپ','بینایی','اتاق عمل','هوشبری','ماما']],
  ['Arts & design', ['معماری','گرافیک','طراحی','هنر','موسیقی','نقاش','عکاس','دوخت','پارچه','صنایع دستی','سینما','انیمیشن']],
  ['Law & social sciences', ['حقوق','روانشناس','علوم اجتماعی','جامعه','مشاوره','تربیت','آموزش','ادبیات','زبان','الهیات','تاریخ','سیاسی','جغراف','انسانی','حسابرس']],
  ['Science & math', ['ریاضی','فیزیک','زیست','آمار','شیمی','زمین','تجربی','میکروب','ژنتیک','بیوتک']],
  ['Trades & services', ['تراشکار','جوشکار','آشپز','برقکار','خدمات','ورزش','کشاورزی','دامپرور','هتلدار','گردشگری','آرایش','خیاط','جوشک']]
];

/* ------------------------------------------------------------------ helpers */
function txt(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(v).trim();
}
function normDate(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);   // a few rows are US-format text
  if (!m) return '';
  return m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
}
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function asIntStr(s) {
  var n = parseFloat(s);
  return isNaN(n) ? '' : String(Math.round(n));
}
function isTest(r) {
  var email = (r[C.email] || '').toLowerCase();
  var name = (r[C.name] || '').trim().toLowerCase();
  var local = email.split('@')[0];
  if (/@(king|tri|eldrugstore)\.com$/.test(email)) return true;
  if (local === 'test' || local === 'tests' || local === 'testtest') return true;
  if (/^(test|tset|testt)(\s.*|\d*)$/.test(name)) return true;
  if (name.indexOf('budjet') !== -1) return true;
  return false;
}
function fieldGroup(s) {
  if (!s || s.replace(/[-. ]/g, '') === '') return '';
  for (var i = 0; i < FIELD_GROUPS.length; i++) {
    var kws = FIELD_GROUPS[i][1];
    for (var k = 0; k < kws.length; k++) if (s.indexOf(kws[k]) !== -1) return FIELD_GROUPS[i][0];
  }
  return 'Other / unspecified';
}
function sourceGroup(s) {
  s = (s || '').toLowerCase();
  if (s.indexOf('instagram') === 0) return 'Instagram';
  if (s.indexOf('google') !== -1 || s === 'site' || s === 'sem' || s === 'seo') return 'Site / Google';
  if (s.indexOf('whatsapp') !== -1) return 'WhatsApp';
  if (s.indexOf('referral') !== -1 || s === 'ref') return 'Referral';
  if (s.indexOf('telegram') !== -1) return 'Telegram';
  if (s.indexOf('call') !== -1 || s.indexOf('phone') !== -1) return 'Phone';
  if (s.indexOf('youtube') !== -1) return 'YouTube';
  return (s === 'none' || s === '') ? 'Untracked' : 'Other';
}
function referrerOf(v) {
  if (!v) return '';
  if (v.indexOf(' ') !== -1 || v.length > 24) return '(website page title)';
  var key = v.toLowerCase().replace(/_/g, '-').replace(/\./g, '-');
  // the same affiliate is stored under two spellings; merge so credit is not split
  return (key === 'mahdis-sultani' || key === 'mahdis-soltani') ? 'mahdis-soltani' : v;
}

/* ------------------------------------------------------------------ pipeline */
function readRows() {
  // openById works from a standalone project; getActive() is the fallback if this
  // file ever does end up bound to the spreadsheet itself.
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
  var sheets = ss.getSheets().slice(0, TABS_TO_READ);
  var rows = [], tabs = [];
  sheets.forEach(function (sh) {
    var values = sh.getDataRange().getValues();
    var body = values.filter(function (r) { return r.some(function (c) { return txt(c) !== ''; }); });
    if (!body.length) return;
    var header = body[0].map(txt);
    var idx = {};
    header.forEach(function (hName, i) { if (hName) idx[hName] = i; });
    for (var j = 1; j < body.length; j++) {
      var raw = body[j], rec = {};
      for (var hName in idx) rec[hName] = txt(raw[idx[hName]]);
      rec._date = normDate(rec[C.date] || '');
      rows.push(rec);
    }
    tabs.push({ name: sh.getName(), rows: body.length - 1 });
  });
  return { rows: rows, tabs: tabs };
}

function dedupe(rows) {
  var seen = {}, out = [];
  var filled = function (r) { var n = 0; for (var k in r) if (r[k]) n++; return n; };
  rows.forEach(function (r) {
    var key = [r[C.name] || '', digits(r[C.mobile]), (r[C.email] || '').toLowerCase(), r._date].join('');
    if (seen.hasOwnProperty(key)) {
      var prev = seen[key];
      if (filled(r) > filled(prev)) { out[out.indexOf(prev)] = r; seen[key] = r; }
      return;
    }
    seen[key] = r;
    out.push(r);
  });
  return out;
}

var C36 = '0123456789abcdefghijklmnopqrstuvwxyz';
function encodeCol(nums) {
  var biggest = 0;
  for (var i = 0; i < nums.length; i++) if (nums[i] > biggest) biggest = nums[i];
  var w = 1;
  while (Math.pow(36, w) <= biggest) w++;
  var parts = new Array(nums.length);
  for (var j = 0; j < nums.length; j++) {
    var v = nums[j], s = '';
    for (var k = 0; k < w; k++) { s = C36.charAt(v % 36) + s; v = Math.floor(v / 36); }
    parts[j] = s;
  }
  return { w: w, s: parts.join('') };
}

function buildPack(recs, tabs, rawCount, testCount, dupeCount, uniqueCount, usTextDates) {
  var day0 = recs[0]._date;
  var base = Date.UTC(+day0.slice(0, 4), +day0.slice(5, 7) - 1, +day0.slice(8, 10));
  var cols = {}, dicts = {};

  function col(name, fn, foldAbove) {
    var vals = recs.map(fn);
    if (name === 'dt' || name === 'a') { cols[name] = vals; return; }
    var counts = {};
    vals.forEach(function (v) { if (v !== '') counts[v] = (counts[v] || 0) + 1; });
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (foldAbove && keys.length > foldAbove) {
      var keep = keys.slice(0, foldAbove);
      var other = 'Other (' + (keys.length - foldAbove) + ' values)';
      var keepSet = {};
      keep.forEach(function (k) { keepSet[k] = 1; });
      vals = vals.map(function (v) { return (v === '' || keepSet[v]) ? v : other; });
      keys = keep.concat([other]);
    }
    var table = [''].concat(keys), index = {};
    table.forEach(function (k, i) { index[k] = i; });
    dicts[name] = table;
    cols[name] = vals.map(function (v) { return index[v]; });
  }

  var g = function (r, k) { return (r[k] || '').trim(); };
  col('dt', function (r) {
    var d = Date.UTC(+r._date.slice(0, 4), +r._date.slice(5, 7) - 1, +r._date.slice(8, 10));
    return Math.round((d - base) / 86400000);
  });
  col('a', function (r) {
    var raw = g(r, C.age), n = parseFloat(raw);
    if (!isNaN(n)) return Math.round(n);
    return raw.indexOf('کمتر از 18') !== -1 ? 17 : 0;
  });
  col('de', function (r) { return g(r, C.dest); });
  col('m', function (r) { return g(r, C.method); });
  col('e', function (r) { return g(r, C.edu); });
  col('fg', function (r) { return fieldGroup(g(r, C.field)); });
  col('l', function (r) { return g(r, C.lang); });
  col('b', function (r) { return g(r, C.budget); });
  col('t', function (r) { return asIntStr(g(r, C.leadType)); });
  col('em', function (r) { return g(r, C.employed); });
  col('ch', function (r) { return g(r, C.channel).replace(/\\\//g, '/'); });
  col('sg', function (r) { return sourceGroup(g(r, C.source)); });
  col('s', function (r) { return g(r, C.source).replace(/،/g, '').toLowerCase(); });
  col('md', function (r) { return g(r, C.medium).toLowerCase(); }, 34);
  col('cp', function (r) { return g(r, C.campaign); }, 34);
  col('ct', function (r) { return g(r, C.content); }, 34);
  col('f', function (r) { return g(r, C.form); });
  col('rf', function (r) { return referrerOf(g(r, C.referrer)); }, 34);
  col('nat', function (r) {
    var v = g(r, C.nationality);
    return v === '^newOptionTest' ? '' : v;
  });
  col('ip', function (r) { return g(r, C.meeting) ? '1' : '0'; });
  col('od', function (r) { return g(r, C.odoo) ? '1' : '0'; });
  col('se', function (r) { return g(r, C.sentEmail) ? '1' : '0'; });
  col('ss', function (r) { return g(r, C.sentSms) ? '1' : '0'; });

  var pack = { n: recs.length, d0: day0, cols: {} };
  for (var name in cols) {
    var enc = encodeCol(cols[name]);
    if (dicts[name]) enc.dict = dicts[name];
    pack.cols[name] = enc;
  }
  pack.meta = {
    tabs: tabs,
    rawRows: rawCount,
    testRows: testCount,
    dupes: dupeCount,
    unique: uniqueCount,
    dated: recs.length,
    noDate: uniqueCount - recs.length,
    usTextDates: usTextDates,
    firstDate: day0,
    lastDate: recs[recs.length - 1]._date,
    built: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    live: true,
    generatedAt: new Date().toISOString()
  };
  return pack;
}

function peopleStats(recs) {
  var counts = {};
  recs.forEach(function (r) {
    var d = digits(r[C.mobile]).replace(/^0+/, ''), id;
    if (d.length >= 9) id = d.slice(-10);
    else if (r[C.email]) id = 'E:' + r[C.email].toLowerCase();
    else return;
    counts[id] = (counts[id] || 0) + 1;
  });
  var people = 0, repeat = 0, extra = 0;
  for (var k in counts) {
    people++;
    if (counts[k] > 1) { repeat++; extra += counts[k] - 1; }
  }
  return { people: people, repeatPeople: repeat, extraSubs: extra };
}

function buildPayload() {
  var read = readRows();
  var raw = read.rows;
  var usTextDates = raw.filter(function (r) {
    return /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(r[C.date] || '');
  }).length;
  var live = raw.filter(function (r) { return !isTest(r); });
  var recs = dedupe(live);
  var dated = recs.filter(function (r) { return r._date; })
                  .sort(function (a, b) { return a._date < b._date ? -1 : a._date > b._date ? 1 : 0; });

  var pack = buildPack(dated, read.tabs, raw.length, raw.length - live.length,
                       live.length - recs.length, recs.length, usTextDates);
  var ppl = peopleStats(recs);
  pack.meta.people = ppl.people;
  pack.meta.repeatPeople = ppl.repeatPeople;
  pack.meta.extraSubs = ppl.extraSubs;
  return JSON.stringify(pack);
}

/* --------------------------------------------------------------------- cache */
// CacheService caps a value at 100KB and the pack is ~280KB, so it is chunked.
function cacheGet() {
  try {
    var c = CacheService.getScriptCache();
    var head = c.get('pack_meta');
    if (!head) return null;
    var count = parseInt(head, 10);
    if (!count) return null;
    var keys = [];
    for (var i = 0; i < count; i++) keys.push('pack_' + i);
    var got = c.getAll(keys), parts = [];
    for (var j = 0; j < count; j++) {
      if (!got['pack_' + j]) return null;   // a chunk expired: treat as a miss
      parts.push(got['pack_' + j]);
    }
    return parts.join('');
  } catch (err) { return null; }
}
function cachePut(payload) {
  try {
    var c = CacheService.getScriptCache(), size = 90000, parts = {};
    var count = Math.ceil(payload.length / size);
    for (var i = 0; i < count; i++) parts['pack_' + i] = payload.substr(i * size, size);
    c.putAll(parts, CACHE_SECONDS);
    c.put('pack_meta', String(count), CACHE_SECONDS);
  } catch (err) { /* caching is best-effort */ }
}

/* ---------------------------------------------------------------- entrypoint */
function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.secret !== SECRET) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var payload = params.fresh === '1' ? null : cacheGet();
  if (!payload) {
    payload = buildPayload();
    cachePut(payload);
  }
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run this from the Apps Script editor to sanity-check the output before deploying. */
function testBuild() {
  var payload = buildPayload();
  var pack = JSON.parse(payload);
  Logger.log('tabs read: %s', pack.meta.tabs.map(function (t) {
    return t.name + ' (' + t.rows + ')';
  }).join(', '));
  Logger.log('submissions: %s', pack.n);
  Logger.log('range: %s -> %s', pack.meta.firstDate, pack.meta.lastDate);
  Logger.log('raw rows: %s, dupes: %s, tests: %s',
             pack.meta.rawRows, pack.meta.dupes, pack.meta.testRows);
  Logger.log('people: %s, payload KB: %s', pack.meta.people, Math.round(payload.length / 1024));
}
