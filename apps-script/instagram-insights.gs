/**
 * Instagram insights collector.
 *
 * Pulls account, post, story and audience insights from the Instagram Graph API
 * and writes them into extra tabs of the leads spreadsheet, so the dashboard can
 * show social performance next to lead volume.
 *
 * WHY IT WRITES TO THE SHEET INSTEAD OF READING LIVE
 *  Several Meta metrics are only queryable for a short window (day-level account
 *  metrics realistically 30 days; stories disappear ~24h after posting) and
 *  cannot be backfilled. Once a day is gone from the API it is gone forever, so
 *  this script accumulates its own history. That history is what makes month over
 *  month comparison possible at all.
 *
 * SETUP
 *  1. Add this file to the same Apps Script project as leads-dashboard.gs
 *     (Files -> + -> Script, name it "instagram-insights"). Every name in here
 *     is ig-prefixed, so nothing collides with the leads endpoint. A separate
 *     standalone project works too.
 *  2. Project Settings -> Script properties -> add:
 *       IG_TOKEN   (required)  a long-lived Instagram or Facebook user token
 *       IG_HOST    (optional)  graph.instagram.com (default) or graph.facebook.com
 *       IG_ACCOUNTS(optional)  label:id,label:id  — omit to auto-discover
 *     Never commit the token or paste it into the dashboard: it stays here.
 *  3. Run `igSetup` once. It authorises the script, prints the accounts it can
 *     see, and creates the tabs. Read the log before going further.
 *  4. Run `igCollectAll` once to fill in history, then `igInstallTrigger` to keep
 *     it running every 3 hours.
 *
 * TOKEN REQUIREMENTS
 *  The account must be a Business or Creator account. Scopes needed:
 *    Instagram Login (graph.instagram.com):
 *      instagram_business_basic, instagram_business_manage_insights
 *    Facebook Login (graph.facebook.com):
 *      instagram_basic, instagram_manage_insights, pages_read_engagement
 *  A token missing the insights scope still lists the account, so igSetup checks
 *  insights explicitly and tells you which scope is absent.
 *
 * TAB ORDER MATTERS
 *  leads-dashboard.gs reads the FIRST THREE tabs as leads. New tabs are created
 *  at the end of the workbook — never drag them in front of the lead tabs.
 */

var IG_VERSION = 'v26.0';              // current as of Jun 2026 docs
var IG_SHEET_ID = '1hiRcyNEA-zggpDW-OldQ1CRcbPVmjMipfpG0BZIiIOU';
var IG_DAILY_BACKFILL = 30;            // Meta keeps ~30d of day-level account data
var IG_REFRESH_DAYS = 4;               // re-fetch recent days: data lags up to 48h
var IG_POST_LOOKBACK = 120;            // days of posts to keep metrics fresh for
var IG_POST_HOT_DAYS = 14;             // a new post is re-measured on every run
var IG_POST_COLD_DAYS = 7;             // an older one, at most weekly
var IG_BUDGET_MS = 4.5 * 60 * 1000;    // stop before Apps Script's 6-minute kill
var IG_FLUSH_EVERY = 25;               // write partial progress this often
var IG_TAB_DAILY = 'IG Daily';
var IG_TAB_POSTS = 'IG Posts';
var IG_TAB_AUDIENCE = 'IG Audience';

/* Account metrics, in groups. Each group is one request and is fetched inside its
 * own try/catch: Meta retires metric names on its own schedule, and one dead name
 * must not take the whole day's collection down with it. */
var IG_DAILY_GROUPS = [
  ['reach', 'views', 'accounts_engaged', 'total_interactions'],
  ['likes', 'comments', 'shares', 'saves', 'replies', 'reposts'],
  ['profile_links_taps'],
  ['follows_and_unfollows']
];

/* Media metrics differ by surface; asking for a story metric on a reel errors. */
var IG_MEDIA_METRICS = {
  FEED: ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions', 'profile_visits', 'follows'],
  // profile_visits and follows are asked for on reels too. If Meta does not serve
  // them for that surface the per-metric fallback records the name and skips it.
  REELS: ['reach', 'views', 'likes', 'comments', 'saved', 'shares', 'total_interactions',
    'ig_reels_avg_watch_time', 'profile_visits', 'follows'],
  STORY: ['reach', 'views', 'replies', 'shares', 'total_interactions', 'profile_visits', 'follows', 'link_clicks']
};

var IG_DAILY_HEADERS = ['date', 'account', 'followers', 'following', 'media_count',
  'reach', 'views', 'accounts_engaged', 'total_interactions', 'likes', 'comments',
  'shares', 'saves', 'replies', 'reposts', 'profile_links_taps', 'follows',
  'unfollows', 'updated_at', 'notes'];

var IG_POST_HEADERS = ['media_id', 'account', 'posted_at', 'surface', 'media_type',
  'permalink', 'caption', 'reach', 'views', 'likes', 'comments', 'saved', 'shares',
  'total_interactions', 'profile_visits', 'follows', 'link_clicks', 'replies',
  'avg_watch_time_s', 'updated_at', 'notes'];

var IG_AUDIENCE_HEADERS = ['date', 'account', 'audience', 'dimension', 'key', 'value', 'updated_at'];

/* -------------------------------------------------------------------- budget */
/**
 * Apps Script kills a function at six minutes with no warning and no chance to
 * save. A large account needs more calls than that allows on a first run, so the
 * collector watches the clock, writes what it has, and says it needs another go.
 * Every phase is resumable because rows are upserted by key.
 */
var igRunStart = 0;
function igStartClock() { igRunStart = Date.now(); }
function igOutOfTime() {
  if (!igRunStart) igStartClock();
  return Date.now() - igRunStart > IG_BUDGET_MS;
}

/* ------------------------------------------------------------------- config */
function igProps() { return PropertiesService.getScriptProperties(); }

function igConfig() {
  var p = igProps();
  var token = (p.getProperty('IG_TOKEN') || '').trim();
  if (!token) {
    throw new Error('IG_TOKEN is not set. Project Settings -> Script properties -> add IG_TOKEN.');
  }
  var host = (p.getProperty('IG_HOST') || 'graph.instagram.com').trim();
  return {
    token: token,
    host: host,
    fbLogin: host.indexOf('graph.facebook.com') === 0,
    accounts: (p.getProperty('IG_ACCOUNTS') || '').trim(),
    sheetId: (p.getProperty('IG_SHEET_ID') || IG_SHEET_ID).trim()
  };
}

function igBook() { return SpreadsheetApp.openById(igConfig().sheetId); }

/* --------------------------------------------------------------------- http */
function igFetch(cfg, path, params) {
  var qs = ['access_token=' + encodeURIComponent(cfg.token)];
  for (var k in params) {
    if (params[k] === undefined || params[k] === null || params[k] === '') continue;
    qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
  }
  var url = 'https://' + cfg.host + '/' + IG_VERSION + '/' + path + '?' + qs.join('&');
  return igFetchUrl(cfg, url);
}

/** Follows paging.next URLs too, which already carry their own query string. */
function igFetchUrl(cfg, url) {
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = res.getResponseCode();
  var body = res.getContentText();
  var json;
  try { json = JSON.parse(body); } catch (err) { json = null; }
  if (code >= 200 && code < 300 && json && !json.error) return json;
  var msg = (json && json.error && json.error.message) || body.slice(0, 300);
  var sub = (json && json.error && json.error.error_subcode) || '';
  throw new Error('Meta API ' + code + ': ' + msg + (sub ? ' (subcode ' + sub + ')' : ''));
}

/** Media insights return values[0].value; account insights return total_value.value. */
function igMetricValue(entry) {
  if (!entry) return '';
  if (entry.total_value && entry.total_value.value !== undefined) return entry.total_value.value;
  if (entry.values && entry.values.length) {
    var v = entry.values[entry.values.length - 1].value;
    return (v === undefined || v === null) ? '' : v;
  }
  return '';
}

function igMetricMap(json) {
  var out = {};
  ((json && json.data) || []).forEach(function (entry) {
    out[entry.name] = igMetricValue(entry);
    if (entry.total_value && entry.total_value.breakdowns) out[entry.name + '__b'] = entry.total_value.breakdowns;
  });
  return out;
}

/* -------------------------------------------------------- unsupported metrics */
/**
 * Meta rejects an entire insights call when any one metric in it is unavailable
 * for the account, so a single retired name would blank every metric beside it.
 * Names that fail on their own are remembered and skipped from then on, which
 * also stops the collector burning a failing request on every run.
 */
function igBadMetrics() {
  var raw = igProps().getProperty('IG_BAD_METRICS') || '';
  var set = {};
  raw.split(',').forEach(function (m) { if (m) set[m] = true; });
  return set;
}
function igMarkBad(metric) {
  var set = igBadMetrics();
  if (set[metric]) return;
  set[metric] = true;
  igProps().setProperty('IG_BAD_METRICS', Object.keys(set).join(','));
  Logger.log('metric "%s" is unavailable for this account and will be skipped from now on', metric);
}
/** Clears the skip list — run after adding a permission or when Meta ships a metric. */
function igResetBadMetrics() {
  igProps().deleteProperty('IG_BAD_METRICS');
  Logger.log('metric skip list cleared');
}

/* ----------------------------------------------------------------- accounts */
/**
 * Resolves the accounts to collect. IG_ACCOUNTS wins when set; otherwise the
 * token is asked what it can see, which differs by login type.
 */
var igAccountCache = null;
function igAccounts(cfg) {
  // Four collections per run would otherwise re-resolve and re-profile every account.
  if (igAccountCache) return igAccountCache;
  var out = [];
  if (cfg.accounts) {
    cfg.accounts.split(',').forEach(function (pair) {
      var bits = pair.split(':');
      var id = (bits.pop() || '').trim();
      var label = bits.join(':').trim();
      if (id) out.push({ id: id, label: label || id });
    });
  } else if (cfg.fbLogin) {
    var pages = igFetch(cfg, 'me/accounts', {
      fields: 'name,instagram_business_account{id,username}', limit: 50
    });
    (pages.data || []).forEach(function (page) {
      var ig = page.instagram_business_account;
      if (ig && ig.id) out.push({ id: ig.id, label: ig.username || page.name });
    });
  } else {
    var me = igFetch(cfg, 'me', { fields: 'user_id,username' });
    var id = me.user_id || me.id;
    if (id) out.push({ id: String(id), label: me.username || String(id) });
  }
  if (!out.length) {
    throw new Error('No Instagram accounts visible to this token. For Facebook Login set ' +
      'IG_HOST=graph.facebook.com; otherwise set IG_ACCOUNTS to label:instagram_user_id.');
  }
  // followers_count is on the account node, not in insights.
  out.forEach(function (acct) {
    try {
      var prof = igFetch(cfg, acct.id, { fields: 'username,followers_count,follows_count,media_count' });
      acct.label = acct.label || prof.username;
      acct.followers = prof.followers_count;
      acct.following = prof.follows_count;
      acct.mediaCount = prof.media_count;
    } catch (err) {
      acct.profileError = String(err.message || err);
    }
  });
  igAccountCache = out;
  return out;
}

/* -------------------------------------------------------------------- dates */
function igTz() { return Session.getScriptTimeZone(); }
function igDayStr(d) { return Utilities.formatDate(d, igTz(), 'yyyy-MM-dd'); }
function igToday() { return igDayStr(new Date()); }

/** Unix seconds for local midnight of a yyyy-MM-dd string, in the script's timezone. */
function igDayStart(dateStr) {
  return Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 1000);
}
function igShiftDay(dateStr, days) {
  var t = new Date(dateStr + 'T00:00:00').getTime() + days * 86400000;
  return igDayStr(new Date(t));
}
function igIsoNow() { return Utilities.formatDate(new Date(), igTz(), "yyyy-MM-dd'T'HH:mm:ss"); }

/* ------------------------------------------------------------------- sheets */
function igSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    // Append at the end: leads-dashboard.gs reads the first three tabs as leads.
    sh = ss.insertSheet(name, ss.getNumSheets());
  }
  var first = sh.getRange(1, 1, 1, Math.max(headers.length, sh.getLastColumn() || 1)).getValues()[0];
  var same = headers.every(function (h, i) { return String(first[i] || '') === h; });
  if (!same) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function igRead(sh, headers) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  return values.map(function (row, i) {
    var rec = { _row: i + 2 };
    headers.forEach(function (h, c) { rec[h] = row[c]; });
    return rec;
  });
}

/**
 * Writes rows, replacing any existing row with the same key and appending the
 * rest. Re-running a collection therefore corrects earlier numbers rather than
 * duplicating them, which matters because Meta revises data for up to 48 hours.
 */
function igUpsert(sh, headers, keyFn, rows) {
  if (!rows.length) return { updated: 0, added: 0 };
  var existing = igRead(sh, headers);
  var index = {};
  existing.forEach(function (rec) {
    var key = keyFn(rec);
    if (key) index[key] = rec._row;
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

function igDailyKey(r) { return igDayStr2(r.date) + '|' + r.account; }
function igDayStr2(v) {
  if (v instanceof Date) return igDayStr(v);
  return String(v || '').slice(0, 10);
}

/* ------------------------------------------------------- account day metrics */
/**
 * Only `reach` supports metric_type=time_series, so every other account metric
 * has to be asked for one day at a time with a since/until window.
 */
function igDayMetrics(cfg, acctId, dateStr) {
  var since = igDayStart(dateStr);
  var until = since + 86399;
  var base = { period: 'day', metric_type: 'total_value', since: since, until: until };
  var ask = function (metrics) {
    var params = { metric: metrics.join(',') };
    for (var k in base) params[k] = base[k];
    return igMetricMap(igFetch(cfg, acctId + '/insights', params));
  };
  var bad = igBadMetrics();
  var out = {}, notes = [];
  IG_DAILY_GROUPS.forEach(function (group) {
    var wanted = group.filter(function (m) { return !bad[m]; });
    if (!wanted.length) return;
    try {
      var got = ask(wanted);
      for (var k in got) out[k] = got[k];
      return;
    } catch (err) {
      // One unavailable name fails the whole group, so fall back to asking each
      // metric on its own and remember which one is actually broken.
      if (wanted.length === 1) { igMarkBad(wanted[0]); notes.push(wanted[0] + ' unavailable'); return; }
    }
    var lost = [];
    wanted.forEach(function (metric) {
      try {
        var one = ask([metric]);
        for (var k2 in one) out[k2] = one[k2];
      } catch (inner) {
        igMarkBad(metric);
        lost.push(metric);
      }
    });
    if (lost.length) notes.push('unavailable: ' + lost.join(','));
  });
  out._notes = notes.join(' | ');
  return out;
}

/** follows_and_unfollows comes back as one number unless broken down. */
function igFollowSplit(cfg, acctId, dateStr) {
  var since = igDayStart(dateStr);
  try {
    var json = igFetch(cfg, acctId + '/insights', {
      metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value',
      breakdown: 'follow_type', since: since, until: since + 86399
    });
    var entry = ((json && json.data) || [])[0];
    var breakdowns = entry && entry.total_value && entry.total_value.breakdowns;
    if (!breakdowns || !breakdowns.length) return null;
    var follows = '', unfollows = '';
    (breakdowns[0].results || []).forEach(function (res) {
      var key = String((res.dimension_values || [])[0] || '').toUpperCase();
      if (key.indexOf('UNFOLLOW') !== -1) unfollows = res.value;
      else if (key.indexOf('FOLLOW') !== -1) follows = res.value;
    });
    return { follows: follows, unfollows: unfollows };
  } catch (err) { return null; }
}

function igCollectDaily() {
  var cfg = igConfig(), ss = igBook();
  var sh = igSheet(ss, IG_TAB_DAILY, IG_DAILY_HEADERS);
  var have = {};
  igRead(sh, IG_DAILY_HEADERS).forEach(function (r) { have[igDailyKey(r)] = r; });
  var accounts = igAccounts(cfg);
  var today = igToday(), rows = [], log = [];
  var written = { updated: 0, added: 0 }, ranOut = false;
  var flush = function () {
    if (!rows.length) return;
    var r = igUpsert(sh, IG_DAILY_HEADERS, igDailyKey, rows);
    written.updated += r.updated; written.added += r.added;
    rows = [];
  };

  accounts.forEach(function (acct) {
    var fetched = 0;
    // newest day first: if the clock runs out, the days that matter most are saved
    for (var back = 0; back <= IG_DAILY_BACKFILL; back++) {
      var day = igShiftDay(today, -back);
      var key = day + '|' + acct.label;
      // Days already stored are left alone once they are old enough to be final.
      if (have[key] && back >= IG_REFRESH_DAYS) continue;
      if (igOutOfTime()) { ranOut = true; break; }
      if (rows.length >= IG_FLUSH_EVERY) flush();
      var m = igDayMetrics(cfg, acct.id, day);
      var split = igFollowSplit(cfg, acct.id, day);
      rows.push({
        date: day,
        account: acct.label,
        // Follower count has no history in the API: today's value is stamped on
        // today's row, and older rows keep whatever was true when first written.
        followers: day === today ? igBlank(acct.followers) : igKeep(have[key], 'followers'),
        following: day === today ? igBlank(acct.following) : igKeep(have[key], 'following'),
        media_count: day === today ? igBlank(acct.mediaCount) : igKeep(have[key], 'media_count'),
        reach: igBlank(m.reach),
        views: igBlank(m.views),
        accounts_engaged: igBlank(m.accounts_engaged),
        total_interactions: igBlank(m.total_interactions),
        likes: igBlank(m.likes),
        comments: igBlank(m.comments),
        shares: igBlank(m.shares),
        saves: igBlank(m.saves),
        replies: igBlank(m.replies),
        reposts: igBlank(m.reposts),
        profile_links_taps: igBlank(m.profile_links_taps),
        follows: split ? igBlank(split.follows) : igBlank(m.follows_and_unfollows),
        unfollows: split ? igBlank(split.unfollows) : '',
        updated_at: igIsoNow(),
        notes: m._notes
      });
      fetched++;
    }
    log.push(acct.label + ': ' + fetched + ' day(s)');
  });

  flush();
  Logger.log('IG Daily -> %s updated, %s added (%s)%s', written.updated, written.added,
    log.join('; '), ranOut ? ' — OUT OF TIME, run igCollectAll again to finish' : '');
  return written;
}

function igBlank(v) { return (v === undefined || v === null) ? '' : v; }
function igKeep(prev, field) { return prev ? igBlank(prev[field]) : ''; }

/* --------------------------------------------------------------------- posts */
function igSurface(media) {
  var t = String(media.media_product_type || '').toUpperCase();
  if (t === 'REELS' || t === 'REEL') return 'REELS';
  if (t === 'STORY') return 'STORY';
  return 'FEED';
}

function igMediaInsights(cfg, media) {
  var surface = igSurface(media);
  var metrics = IG_MEDIA_METRICS[surface] || IG_MEDIA_METRICS.FEED;
  // One metric at a time is slower but survives Meta dropping a single name; the
  // combined call is tried first and only falls back when it errors.
  try {
    return { values: igMetricMap(igFetch(cfg, media.id + '/insights', { metric: metrics.join(',') })), notes: '' };
  } catch (err) {
    var out = {}, notes = [];
    metrics.forEach(function (metric) {
      try {
        var got = igMetricMap(igFetch(cfg, media.id + '/insights', { metric: metric }));
        for (var k in got) out[k] = got[k];
      } catch (inner) {
        notes.push(metric);
      }
    });
    return { values: out, notes: notes.length ? 'unavailable: ' + notes.join(',') : '' };
  }
}

function igMediaRow(acct, media, ins) {
  var v = ins.values;
  return {
    media_id: String(media.id),
    account: acct.label,
    posted_at: media.timestamp ? String(media.timestamp).slice(0, 19).replace('T', ' ') : '',
    surface: igSurface(media),
    media_type: media.media_type || '',
    permalink: media.permalink || '',
    caption: String(media.caption || '').replace(/\s+/g, ' ').slice(0, 120),
    reach: igBlank(v.reach),
    views: igBlank(v.views),
    likes: igBlank(v.likes !== undefined ? v.likes : media.like_count),
    comments: igBlank(v.comments !== undefined ? v.comments : media.comments_count),
    saved: igBlank(v.saved),
    shares: igBlank(v.shares),
    total_interactions: igBlank(v.total_interactions),
    profile_visits: igBlank(v.profile_visits),
    follows: igBlank(v.follows),
    link_clicks: igBlank(v.link_clicks),
    replies: igBlank(v.replies),
    avg_watch_time_s: v.ig_reels_avg_watch_time === undefined || v.ig_reels_avg_watch_time === ''
      ? '' : Math.round(Number(v.ig_reels_avg_watch_time) / 100) / 10,
    updated_at: igIsoNow(),
    notes: ins.notes
  };
}

function igMediaKey(r) { return String(r.media_id); }

/**
 * A post keeps accruing reach for a couple of weeks and then barely moves, so
 * older ones are only re-measured weekly. Without this the collector spends a
 * request per post per run and runs into Meta's hourly call limit.
 */
function igStale(prev, postedAt) {
  if (!prev) return true;
  var posted = postedAt ? new Date(postedAt).getTime() : 0;
  if (!posted || (Date.now() - posted) / 86400000 <= IG_POST_HOT_DAYS) return true;
  var seen = prev.updated_at;
  var last = (Object.prototype.toString.call(seen) === '[object Date]')
    ? seen.getTime() : Date.parse(String(seen || '').replace(' ', 'T'));
  if (!last) return true;
  return (Date.now() - last) / 86400000 >= IG_POST_COLD_DAYS;
}

/** Posts and reels: walk back through /media until older than IG_POST_LOOKBACK. */
function igCollectPosts() {
  var cfg = igConfig(), ss = igBook();
  var sh = igSheet(ss, IG_TAB_POSTS, IG_POST_HEADERS);
  var seen = {};
  igRead(sh, IG_POST_HEADERS).forEach(function (r) { seen[igMediaKey(r)] = r; });
  var accounts = igAccounts(cfg);
  var cutoff = new Date(new Date().getTime() - IG_POST_LOOKBACK * 86400000).getTime();
  var rows = [], log = [];
  var written = { updated: 0, added: 0 }, ranOut = false;
  var flush = function () {
    if (!rows.length) return;
    var r = igUpsert(sh, IG_POST_HEADERS, igMediaKey, rows);
    written.updated += r.updated; written.added += r.added;
    rows = [];
  };

  accounts.forEach(function (acct) {
    if (ranOut) return;
    var fields = 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count';
    var json = igFetch(cfg, acct.id + '/media', { fields: fields, limit: 50 });
    var count = 0, skipped = 0, pages = 0, done = false;
    while (json && !done) {
      var items = json.data || [];
      for (var i = 0; i < items.length; i++) {
        var media = items[i];
        var ts = media.timestamp ? new Date(media.timestamp).getTime() : 0;
        if (ts && ts < cutoff) { done = true; break; }
        if (!igStale(seen[String(media.id)], media.timestamp)) { skipped++; continue; }
        // /media returns newest first, so an interrupted run has still covered the
        // posts most likely to still be moving.
        if (igOutOfTime()) { ranOut = true; done = true; break; }
        if (rows.length >= IG_FLUSH_EVERY) flush();
        rows.push(igMediaRow(acct, media, igMediaInsights(cfg, media)));
        count++;
      }
      if (done || !json.paging || !json.paging.next || ++pages > 20) break;
      json = igFetchUrl(cfg, json.paging.next);
    }
    log.push(acct.label + ': ' + count + ' post(s), ' + skipped + ' already current');
  });

  flush();
  Logger.log('IG Posts -> %s updated, %s added (%s)%s', written.updated, written.added,
    log.join('; '), ranOut ? ' — OUT OF TIME, run igCollectAll again to finish' : '');
  return written;
}

/**
 * Stories vanish from the API roughly 24 hours after posting, so they are only
 * ever captured by a run that happens while they are live. This is the reason
 * the trigger runs every few hours rather than nightly.
 */
function igCollectStories() {
  var cfg = igConfig(), ss = igBook();
  var sh = igSheet(ss, IG_TAB_POSTS, IG_POST_HEADERS);
  var accounts = igAccounts(cfg);
  var rows = [], log = [];
  accounts.forEach(function (acct) {
    try {
      var json = igFetch(cfg, acct.id + '/stories', {
        fields: 'id,caption,media_type,media_product_type,permalink,timestamp'
      });
      (json.data || []).forEach(function (media) {
        if (!media.media_product_type) media.media_product_type = 'STORY';
        rows.push(igMediaRow(acct, media, igMediaInsights(cfg, media)));
      });
      log.push(acct.label + ': ' + (json.data || []).length + ' live story/stories');
    } catch (err) {
      log.push(acct.label + ': stories failed — ' + String(err.message || err).slice(0, 120));
    }
  });
  var res = igUpsert(sh, IG_POST_HEADERS, igMediaKey, rows);
  Logger.log('IG Stories -> %s updated, %s added (%s)', res.updated, res.added, log.join('; '));
  return res;
}

/* ------------------------------------------------------------------ audience */
var IG_AUDIENCE_DIMS = ['country', 'city', 'age', 'gender'];

function igAudienceKey(r) {
  return [igDayStr2(r.date), r.account, r.audience, r.dimension, r.key].join('|');
}

/**
 * follower_demographics / engaged_audience_demographics are lifetime snapshots,
 * so one row per day is enough. Stored long-format: one row per bucket.
 */
function igCollectAudience() {
  var cfg = igConfig(), ss = igBook();
  var sh = igSheet(ss, IG_TAB_AUDIENCE, IG_AUDIENCE_HEADERS);
  var today = igToday();
  var have = {};
  igRead(sh, IG_AUDIENCE_HEADERS).forEach(function (r) { have[igAudienceKey(r)] = true; });
  var accounts = igAccounts(cfg);
  var rows = [], log = [];

  accounts.forEach(function (acct) {
    ['follower_demographics', 'engaged_audience_demographics'].forEach(function (metric) {
      IG_AUDIENCE_DIMS.forEach(function (dim) {
        var json = igAudienceFetch(cfg, acct.id, metric, dim);
        if (!json) { return; }
        var entry = ((json && json.data) || [])[0];
        var breakdowns = entry && entry.total_value && entry.total_value.breakdowns;
        if (!breakdowns || !breakdowns.length) return;
        var keys = breakdowns[0].dimension_keys || [];
        var at = keys.indexOf(dim);
        if (at === -1) at = keys.length - 1;   // response sometimes prefixes "timeframe"
        (breakdowns[0].results || []).forEach(function (res) {
          var bucket = String((res.dimension_values || [])[at] || '');
          if (!bucket) return;
          rows.push({
            date: today, account: acct.label,
            audience: metric === 'follower_demographics' ? 'followers' : 'engaged',
            dimension: dim, key: bucket, value: res.value, updated_at: igIsoNow()
          });
        });
      });
    });
    log.push(acct.label);
  });

  var res = igUpsert(sh, IG_AUDIENCE_HEADERS, igAudienceKey, rows);
  Logger.log('IG Audience -> %s updated, %s added (%s)', res.updated, res.added, log.join('; '));
  return res;
}

/** The docs spell the parameter `breakdown` in one place and `breakdowns` in another. */
function igAudienceFetch(cfg, acctId, metric, dim) {
  var base = { metric: metric, period: 'lifetime', timeframe: 'this_week', metric_type: 'total_value' };
  var attempts = [{ breakdown: dim }, { breakdowns: dim }];
  for (var i = 0; i < attempts.length; i++) {
    var params = { };
    for (var k in base) params[k] = base[k];
    for (var k2 in attempts[i]) params[k2] = attempts[i][k2];
    try {
      return igFetch(cfg, acctId + '/insights', params);
    } catch (err) {
      if (i === attempts.length - 1) {
        Logger.log('audience %s/%s unavailable: %s', metric, dim, String(err.message || err).slice(0, 140));
        return null;
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------- entrypoints */
/** Everything, in the order the trigger should run it. */
function igCollectAll() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { Logger.log('another collection is already running'); return; }
  igAccountCache = null;
  igStartClock();
  try {
    igCollectStories();     // first: these expire
    igCollectDaily();
    igCollectPosts();
    // Demographics are a lifetime snapshot — losing today's costs nothing, so it
    // yields to the phases that capture data which cannot be re-read later.
    if (igOutOfTime()) {
      Logger.log('skipping audience this run: out of time. Run igCollectAll again.');
    } else {
      igCollectAudience();
    }
    igProps().setProperty('IG_LAST_RUN', igIsoNow());
    Logger.log('run finished in %ss', Math.round((Date.now() - igRunStart) / 1000));
  } finally {
    lock.releaseLock();
  }
}

/** One-time check. Run this before anything else and read the log. */
function igSetup() {
  var cfg = igConfig();
  igAccountCache = null;
  Logger.log('host: %s  version: %s', cfg.host, IG_VERSION);
  var accounts = igAccounts(cfg);
  accounts.forEach(function (acct) {
    Logger.log('account: %s (id %s) followers=%s posts=%s%s', acct.label, acct.id,
      igBlank(acct.followers), igBlank(acct.mediaCount),
      acct.profileError ? ' PROFILE ERROR: ' + acct.profileError : '');
    try {
      var probe = igFetch(cfg, acct.id + '/insights', {
        metric: 'reach', period: 'day', metric_type: 'total_value'
      });
      Logger.log('  insights OK, last 24h reach = %s', igMetricValue((probe.data || [])[0]));
    } catch (err) {
      Logger.log('  INSIGHTS FAILED: %s', String(err.message || err));
      Logger.log('  Usually a missing scope (instagram_business_manage_insights / ' +
                 'instagram_manage_insights) or a personal rather than business account.');
    }
  });
  var ss = igBook();
  igSheet(ss, IG_TAB_DAILY, IG_DAILY_HEADERS);
  igSheet(ss, IG_TAB_POSTS, IG_POST_HEADERS);
  igSheet(ss, IG_TAB_AUDIENCE, IG_AUDIENCE_HEADERS);
  Logger.log('tabs ready in "%s": %s', ss.getName(), ss.getSheets().map(function (s) {
    return s.getName();
  }).join(', '));
  Logger.log('next: run igCollectAll once, then igInstallTrigger.');
}

function igInstallTrigger() {
  igRemoveTriggers();
  ScriptApp.newTrigger('igCollectAll').timeBased().everyHours(3).create();
  Logger.log('trigger installed: igCollectAll every 3 hours');
}

function igRemoveTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'igCollectAll') ScriptApp.deleteTrigger(t);
  });
}
