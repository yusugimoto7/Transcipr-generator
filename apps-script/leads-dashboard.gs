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

// Instagram insights, written into these tabs by instagram-insights.gs. Absent
// tabs are not an error: the dashboard just hides its Social section.
const SOCIAL_TABS = { daily: 'IG Daily', posts: 'IG Posts', audience: 'IG Audience' };
const SOCIAL_DAYS = 400;      // history sent to the page; older rows stay in the sheet
const SOCIAL_POST_DAYS = 120;

// Odoo CRM, written into these tabs by odoo-crm.gs. Absent tabs are not an error:
// the dashboard hides its CRM section and every lead reads as unmatched.
const CRM_TABS = { leads: 'CRM Leads', stages: 'CRM Stage Daily' };
const CRM_HEADERS = ['id', 'email_norm', 'phone_digits', 'kind', 'status', 'stage',
  'stage_seq', 'probability', 'revenue', 'created', 'closed', 'days_to_close',
  'salesperson', 'team', 'source', 'medium', 'campaign', 'lost_reason', 'country',
  'write_date', 'updated_at'];
const CRM_STAGE_HEADERS = ['date', 'stage', 'stage_seq', 'open', 'won', 'lost',
  'open_revenue', 'won_revenue', 'updated_at'];

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

/* ---------------------------------------------------------------------- crm */
/**
 * Email and phone lookups into the CRM tab. A person can hold several Odoo
 * records — duplicates, or a lead and the opportunity it became — so the best
 * one wins: a win outranks an open pipeline, which outranks a loss, and the
 * newest breaks a tie. Anything less would report someone as lost while their
 * won deal sat in the next row.
 */
var CRM_RANK = { won: 3, open: 2, lost: 1 };
/**
 * The last ten digits of a phone number. Odoo tends to hold the international
 * form (+98 912 100 0000) while the form captures the national one
 * (0912 100 0000) — the same phone, and a plain digit comparison misses every
 * one of them. Ten digits is the national number for both Iran and Canada.
 */
function phoneKey(v) {
  var d = String(v || '').replace(/\D/g, '');
  return d.length >= 9 ? d.slice(-10) : '';
}
var CRM_IDX = null;
function buildCrmIndex() {
  var rows = readTab(CRM_TABS.leads);
  if (!rows.length) return null;
  var byEmail = {}, byPhone = {}, kept = 0;
  var better = function (a, b) {
    if (!b) return true;
    var ra = CRM_RANK[a.status] || 0, rb = CRM_RANK[b.status] || 0;
    if (ra !== rb) return ra > rb;
    return String(a.created) > String(b.created);
  };
  rows.forEach(function (r) {
    var rec = {
      status: txt(r.status) || 'open',
      stage: txt(r.stage),
      revenue: num(r.revenue) || 0,
      created: dayText(r.created),
      closed: dayText(r.closed),
      days: num(r.days_to_close),
      salesperson: txt(r.salesperson),
      lostReason: txt(r.lost_reason),
      source: txt(r.source)
    };
    var email = txt(r.email_norm).toLowerCase();
    var phone = phoneKey(r.phone_digits);
    if (email && better(rec, byEmail[email])) byEmail[email] = rec;
    if (phone && better(rec, byPhone[phone])) byPhone[phone] = rec;
    kept++;
  });
  return { byEmail: byEmail, byPhone: byPhone, rows: rows, count: kept };
}

/** The CRM record for one sheet row, or null. Email first: phones are messier. */
function crmFor(r) {
  if (!CRM_IDX) return null;
  var email = (r[C.email] || '').trim().toLowerCase();
  if (email && CRM_IDX.byEmail[email]) return CRM_IDX.byEmail[email];
  var phone = phoneKey(r[C.mobile]);
  if (phone && CRM_IDX.byPhone[phone]) return CRM_IDX.byPhone[phone];
  return null;
}

/* ------------------------------------------------------------------ pipeline */
var _book = null;
function book() {
  // openById works from a standalone project; getActive() is the fallback if this
  // file ever does end up bound to the spreadsheet itself.
  if (!_book) _book = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActive();
  return _book;
}

function readRows() {
  var ss = book();
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

// Columns held as plain numbers rather than dictionary codes.
var RAW_NUM_COLS = { dt: 1, a: 1, rvk: 1, dtc: 1 };

function buildPack(recs, tabs, rawCount, testCount, dupeCount, uniqueCount, usTextDates) {
  var day0 = recs[0]._date;
  var base = Date.UTC(+day0.slice(0, 4), +day0.slice(5, 7) - 1, +day0.slice(8, 10));
  var cols = {}, dicts = {};

  function col(name, fn, foldAbove) {
    var vals = recs.map(fn);
    if (RAW_NUM_COLS[name]) { cols[name] = vals; return; }
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

  // Odoo outcome, joined on to each submission. Blank throughout when the CRM
  // collector has not run, which is what keeps the dashboard's CRM section hidden.
  col('cm', function (r) { return crmFor(r) ? 'In CRM' : 'Not in CRM'; });
  col('cst', function (r) {
    var m = crmFor(r);
    return m ? m.status.charAt(0).toUpperCase() + m.status.slice(1) : '';
  });
  col('cs', function (r) { var m = crmFor(r); return m ? m.stage : ''; }, 24);
  col('clr', function (r) { var m = crmFor(r); return m ? m.lostReason : ''; }, 20);
  col('cu', function (r) { var m = crmFor(r); return m ? m.salesperson : ''; }, 24);
  // Revenue in thousands: three fewer digits per record across 11k rows, and the
  // nearest thousand is finer than any decision made from this page.
  col('rvk', function (r) {
    var m = crmFor(r);
    return m && m.revenue ? Math.round(m.revenue / 1000) : 0;
  });
  // Days from submission to close, offset by one so 0 can mean "not closed" and
  // 1 can mean "closed the same day".
  col('dtc', function (r) {
    var m = crmFor(r);
    return (m && m.days !== null && m.days !== '' && m.closed) ? Math.max(0, Number(m.days)) + 1 : 0;
  });

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

/* -------------------------------------------------------------------- social */
/** Reads a tab into objects keyed by its own header row, or [] if the tab is absent. */
function readTab(name) {
  var sh = book().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getDataRange().getValues();
  var header = values[0].map(txt);
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var rec = {}, any = false;
    for (var c = 0; c < header.length; c++) {
      if (!header[c]) continue;
      rec[header[c]] = values[i][c];
      if (txt(values[i][c]) !== '') any = true;
    }
    if (any) out.push(rec);
  }
  return out;
}

function dayText(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return normDate(s);
}
function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}
function daysAgo(dateStr, today) {
  if (!dateStr) return 1e9;
  return Math.round((Date.parse(today) - Date.parse(dateStr)) / 86400000);
}

/**
 * Packs the Instagram tabs into a compact block. Individual posts and reels are
 * sent as rows; stories are rolled up per day, because a few thousand expired
 * stories would dominate the payload and none of them is separately actionable.
 */
function buildSocial() {
  var daily = readTab(SOCIAL_TABS.daily);
  var posts = readTab(SOCIAL_TABS.posts);
  var audience = readTab(SOCIAL_TABS.audience);
  if (!daily.length && !posts.length) return null;

  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var accounts = [], acctIdx = {};
  var acct = function (v) {
    var k = txt(v) || '(unknown)';
    if (!(k in acctIdx)) { acctIdx[k] = accounts.length; accounts.push(k); }
    return acctIdx[k];
  };

  var dailyCols = ['d', 'a', 'followers', 'reach', 'views', 'engaged', 'inter', 'likes',
    'comments', 'shares', 'saves', 'replies', 'taps', 'follows', 'unfollows'];
  var dailyRows = [];
  daily.forEach(function (r) {
    var d = dayText(r.date);
    if (!d || daysAgo(d, today) > SOCIAL_DAYS) return;
    dailyRows.push([d, acct(r.account), num(r.followers), num(r.reach), num(r.views),
      num(r.accounts_engaged), num(r.total_interactions), num(r.likes), num(r.comments),
      num(r.shares), num(r.saves), num(r.replies), num(r.profile_links_taps),
      num(r.follows), num(r.unfollows)]);
  });
  dailyRows.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });

  var postCols = ['id', 'a', 'd', 'surface', 'type', 'link', 'cap', 'reach', 'views',
    'likes', 'comments', 'saved', 'shares', 'inter', 'visits', 'follows', 'watch'];
  var postRows = [], storyAgg = {};
  posts.forEach(function (r) {
    var stamp = txt(r.posted_at) || dayText(r.posted_at);
    var d = dayText(stamp.slice(0, 10));
    if (!d || daysAgo(d, today) > SOCIAL_POST_DAYS) return;
    var surface = (txt(r.surface) || 'FEED').toUpperCase();
    if (surface === 'STORY') {
      var key = d + '|' + txt(r.account);
      var agg = storyAgg[key] || (storyAgg[key] = { d: d, a: acct(r.account), n: 0,
        reach: 0, views: 0, replies: 0, clicks: 0, follows: 0 });
      agg.n++;
      ['reach', 'views', 'replies', 'follows'].forEach(function (f) {
        agg[f] += num(r[f]) || 0;
      });
      agg.clicks += num(r.link_clicks) || 0;
      return;
    }
    postRows.push([txt(r.media_id), acct(r.account), stamp.slice(0, 16), surface,
      txt(r.media_type), txt(r.permalink), txt(r.caption), num(r.reach), num(r.views),
      num(r.likes), num(r.comments), num(r.saved), num(r.shares),
      num(r.total_interactions), num(r.profile_visits), num(r.follows),
      num(r.avg_watch_time_s)]);
  });
  postRows.sort(function (a, b) { return a[2] < b[2] ? 1 : a[2] > b[2] ? -1 : 0; });

  var storyCols = ['d', 'a', 'n', 'reach', 'views', 'replies', 'clicks', 'follows'];
  var storyRows = Object.keys(storyAgg).map(function (k) {
    var s = storyAgg[k];
    return [s.d, s.a, s.n, s.reach, s.views, s.replies, s.clicks, s.follows];
  }).sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });

  // Demographics are lifetime snapshots, so only the newest one is worth sending.
  var audDate = '';
  audience.forEach(function (r) {
    var d = dayText(r.date);
    if (d && d > audDate) audDate = d;
  });
  // A demographic bucket is one measurement, so repeated rows for the same bucket
  // must replace each other rather than add up — summing them would report an
  // audience several times larger than the follower count.
  var audCols = ['a', 'audience', 'dim', 'key', 'value'];
  var audSeen = {}, audRows = [], audDupes = 0;
  audience.forEach(function (r) {
    if (dayText(r.date) !== audDate) return;
    var row = [acct(r.account), txt(r.audience), txt(r.dimension), txt(r.key), num(r.value)];
    var k = row.slice(0, 4).join('|');
    if (k in audSeen) { audRows[audSeen[k]] = row; audDupes++; return; }
    audSeen[k] = audRows.length;
    audRows.push(row);
  });

  return {
    accounts: accounts,
    dailyCols: dailyCols, daily: dailyRows,
    postCols: postCols, posts: postRows,
    storyCols: storyCols, stories: storyRows,
    audCols: audCols, audience: audRows, audDate: audDate, audDupes: audDupes,
    lastRun: txt(PropertiesService.getScriptProperties().getProperty('IG_LAST_RUN') || ''),
    generatedAt: new Date().toISOString()
  };
}

/**
 * The pipeline as it stands, plus whatever daily history has accumulated. The
 * per-lead join lives in the pack's own columns; this block carries what has no
 * matching submission — Odoo records created outside the form, and the stage
 * snapshots that Odoo itself cannot reconstruct.
 */
function buildCrm(matched, total) {
  if (!CRM_IDX) return null;
  var rows = CRM_IDX.rows;
  var stages = {}, byStatus = { won: 0, lost: 0, open: 0 };
  var revenue = { won: 0, open: 0 }, closedDays = [];
  rows.forEach(function (r) {
    var st = txt(r.status) || 'open';
    if (byStatus[st] === undefined) byStatus[st] = 0;
    byStatus[st]++;
    var name = txt(r.stage) || '(no stage)';
    var seq = num(r.stage_seq);
    var b = stages[name] || (stages[name] = { name: name, seq: seq === null ? 999 : seq,
      won: 0, lost: 0, open: 0, revenue: 0 });
    b[st === 'won' || st === 'lost' ? st : 'open']++;
    var rev = num(r.revenue) || 0;
    b.revenue += rev;
    if (st === 'won') revenue.won += rev;
    else if (st !== 'lost') revenue.open += rev;
    var d = num(r.days_to_close);
    if (st === 'won' && d !== null && d >= 0) closedDays.push(d);
  });
  closedDays.sort(function (a, b) { return a - b; });

  var history = readTab(CRM_TABS.stages).map(function (r) {
    return [dayText(r.date), txt(r.stage), num(r.open) || 0, num(r.won) || 0, num(r.lost) || 0,
      Math.round(num(r.won_revenue) || 0)];
  }).filter(function (r) { return r[0]; })
    .sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });

  return {
    stages: Object.keys(stages).map(function (k) { return stages[k]; })
      .sort(function (a, b) { return a.seq - b.seq; }),
    status: byStatus,
    revenue: { won: Math.round(revenue.won), open: Math.round(revenue.open) },
    medianDaysToWin: closedDays.length ? closedDays[Math.floor(closedDays.length / 2)] : null,
    records: rows.length,
    // The whole point of the join: how many submissions actually reached Odoo,
    // measured against Odoo itself rather than against the sheet's own flag.
    matched: matched, submissions: total,
    unmatchedCrm: Math.max(0, rows.length - matched),
    historyCols: ['d', 'stage', 'open', 'won', 'lost', 'wonRevenue'],
    history: history,
    lastRun: txt(PropertiesService.getScriptProperties().getProperty('ODOO_LAST_RUN') || ''),
    generatedAt: new Date().toISOString()
  };
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

  // Built before the pack, because the pack's CRM columns read from it.
  try {
    CRM_IDX = buildCrmIndex();
  } catch (err) {
    CRM_IDX = null;
    var crmErr = String(err && err.message || err).slice(0, 200);
  }
  var pack = buildPack(dated, read.tabs, raw.length, raw.length - live.length,
                       live.length - recs.length, recs.length, usTextDates);
  var ppl = peopleStats(recs);
  pack.meta.people = ppl.people;
  pack.meta.repeatPeople = ppl.repeatPeople;
  pack.meta.extraSubs = ppl.extraSubs;
  // Social is optional: a failure here must not cost the page its lead data.
  try {
    var social = buildSocial();
    if (social) pack.social = social;
  } catch (err) {
    pack.meta.socialError = String(err && err.message || err).slice(0, 200);
  }
  if (crmErr) pack.meta.crmError = crmErr;
  try {
    if (CRM_IDX) {
      var matched = 0;
      for (var i = 0; i < dated.length; i++) if (crmFor(dated[i])) matched++;
      var crm = buildCrm(matched, dated.length);
      if (crm) pack.crm = crm;
    }
  } catch (err2) {
    pack.meta.crmError = String(err2 && err2.message || err2).slice(0, 200);
  }
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
  if (pack.social) {
    Logger.log('social: %s account(s), %s day(s), %s post(s), %s story-day(s), audience %s' +
      (pack.social.audDupes ? ' (' + pack.social.audDupes + ' duplicate audience rows collapsed — ' +
       'the IG Audience tab has repeats worth deleting)' : ''),
      pack.social.accounts.length, pack.social.daily.length, pack.social.posts.length,
      pack.social.stories.length, pack.social.audDate || 'none');
  } else {
    Logger.log('social: no IG tabs yet%s',
      pack.meta.socialError ? ' (error: ' + pack.meta.socialError + ')' : '');
  }
  if (pack.crm) {
    Logger.log('crm: %s Odoo records, %s of %s submissions matched (%s%%), %s won / %s open / %s lost, ' +
      '%s day(s) of stage history',
      pack.crm.records, pack.crm.matched, pack.crm.submissions,
      Math.round(100 * pack.crm.matched / (pack.crm.submissions || 1)),
      pack.crm.status.won || 0, pack.crm.status.open || 0, pack.crm.status.lost || 0,
      pack.crm.history.length);
  } else {
    Logger.log('crm: no Odoo tabs yet%s',
      pack.meta.crmError ? ' (error: ' + pack.meta.crmError + ')' : '');
  }
}
