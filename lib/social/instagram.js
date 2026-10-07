// Recent Instagram posts from the creators in lib/creators.js, as topic
// candidates. Two ways in, used together:
//
// 1. Official Instagram API, "Business Discovery" (free). Our own Instagram
//    business account reads the public posts of other BUSINESS/CREATOR
//    accounts. Needs IG_DISCOVERY_TOKEN: a token from Facebook Login (not the
//    Instagram-Login token the draws poster uses, which cannot do this).
// 2. Apify's Instagram post scraper (paid per post). Reads any public account,
//    including personal ones Business Discovery cannot. Needs APIFY_TOKEN.
//
// Each handle goes through Business Discovery first; whatever it cannot read
// falls through to Apify. Either can be missing — the other still works, and
// with neither this simply returns nothing.
//
// Cost control: Business Discovery is free and refreshed hourly. Apify is
// called at most once per APIFY_MIN_HOURS (default 12) and asked for at most
// APIFY_MAX_POSTS_PER_DAY posts in total (default 60, about $0.10/day at the
// free-tier price), so a busy day cannot run up a bill. State is in memory: a
// restart can trigger one extra Apify run.

import { INSTAGRAM_HANDLES } from "../creators.js";
import { articleKey } from "../news.js";

const GRAPH = "https://graph.facebook.com/v21.0";
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

function handles() {
  const extra = (process.env.INSTAGRAM_HANDLES || "")
    .split(",")
    .map((h) => h.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, ""))
    .filter(Boolean);
  return [...new Set([...INSTAGRAM_HANDLES, ...extra].map((h) => h.toLowerCase()))];
}

async function getJson(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !data.error, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: { message: e.name === "AbortError" ? "timeout" : String(e.message || e) } } };
  } finally {
    clearTimeout(timer);
  }
}

function toItem(handle, { caption, permalink, timestamp }) {
  const text = String(caption || "").replace(/\s+\n/g, "\n").trim();
  if (!text || !permalink) return null;
  // Title from the first line that says something: captions often open with
  // a bare link or a row of hashtags.
  const firstLine =
    text.split("\n").find((l) => l.replace(/https?:\/\/\S+|[#@]\S+/g, "").trim().length > 3) || text;
  const ms = Date.parse(timestamp || "") || 0;
  return {
    key: articleKey(permalink),
    source_url: permalink,
    title: firstLine.replace(/[#@]\S+/g, "").trim().slice(0, 140) || text.slice(0, 140),
    snippet: text.replace(/\s+/g, " ").slice(0, 900),
    source_name: "@" + handle + " · Instagram",
    published: ms ? new Date(ms).toISOString() : "",
    published_ms: ms,
    social: "instagram",
    author: handle,
    lang: /[؀-ۿ]/.test(text) ? "fa" : "en",
  };
}

// ── 1. Business Discovery ─────────────────────────────────────────────────────
// Best is a PAGE token extended in Meta's Access Token Debugger: it does not
// expire. A long-lived USER token also works (we derive the page token from
// it) but dies after 60 days; /api/social says which kind is in use. The token
// itself is never shown anywhere — that page is public.
let identity = null; // { igId, token, pageToken, kind, username }
let kindProbe = "";

async function resolveIdentity() {
  if (identity) return identity;
  const token = process.env.IG_DISCOVERY_TOKEN;
  if (!token) return null;
  // Page token: /me is the Page. `category` exists only on Pages, so asking
  // for it alone is how the token kind is told apart (a user token rejects
  // it). The linked account is asked for separately: one field Meta refuses
  // would otherwise fail the whole request and misreport the kind.
  const kind = await getJson(`${GRAPH}/me?fields=id,name,category&access_token=${encodeURIComponent(token)}`);
  // Kept for /api/social: Meta's answer to "is this a Page?", without the token.
  kindProbe = kind.ok
    ? `/me → ${kind.data.category ? "Page (" + kind.data.category + ")" : "no category (" + (kind.data.name || kind.data.id || "?") + ")"}`
    : `/me → ${(kind.data.error && kind.data.error.message) || "HTTP " + kind.status}`;
  if (kind.ok && kind.data.category) {
    let ig = null;
    for (const f of ["instagram_business_account", "connected_instagram_account"]) {
      const r = await getJson(`${GRAPH}/me?fields=${f}{id,username}&access_token=${encodeURIComponent(token)}`);
      if (r.ok && r.data[f]) {
        ig = r.data[f];
        break;
      }
    }
    if (ig) {
      identity = { igId: process.env.IG_DISCOVERY_USER_ID || ig.id, token, kind: "page", username: ig.username, pageToken: token };
      return identity;
    }
  }
  // User token: find the Page that has our Instagram account linked.
  const pages = await getJson(`${GRAPH}/me/accounts?fields=name,access_token,instagram_business_account{id,username}&limit=50&access_token=${encodeURIComponent(token)}`);
  if (!pages.ok) throw new Error((pages.data.error && pages.data.error.message) || "token rejected");
  const list = (pages.data.data || []).filter((p) => p.instagram_business_account);
  // Several Pages can carry Sugimoto accounts (e.g. a Europe one); read as the
  // main account unless IG_DISCOVERY_ACCOUNT names another.
  const want = (process.env.IG_DISCOVERY_ACCOUNT || "sugimotovisa").toLowerCase();
  const pick =
    list.find((p) => (p.instagram_business_account.username || "").toLowerCase() === want) ||
    list.find((p) => /sugimoto/i.test(p.instagram_business_account.username || p.name)) ||
    list[0];
  if (!pick) throw new Error("no Facebook Page with a linked Instagram business account on this token");
  identity = {
    igId: process.env.IG_DISCOVERY_USER_ID || pick.instagram_business_account.id,
    token: pick.access_token,
    pageToken: pick.access_token,
    kind: "user",
    username: pick.instagram_business_account.username,
  };
  return identity;
}

async function discover(handle, id) {
  const fields = `business_discovery.username(${handle}){username,media.limit(6){caption,permalink,timestamp,media_type}}`;
  const r = await getJson(`${GRAPH}/${id.igId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(id.token)}`);
  if (!r.ok) throw new Error((r.data.error && r.data.error.message) || "HTTP " + r.status);
  const media = (r.data.business_discovery && r.data.business_discovery.media && r.data.business_discovery.media.data) || [];
  return media.map((m) => toItem(handle, m)).filter(Boolean);
}

// ── 2. Apify ──────────────────────────────────────────────────────────────────
const apifyState = { lastRun: 0, day: "", postsToday: 0 };

async function scrape(handlesToRead, maxAgeDays) {
  const token = process.env.APIFY_TOKEN;
  if (!token || !handlesToRead.length) return { items: [], skipped: !token ? "APIFY_TOKEN not set" : "" };
  const minHours = Number(process.env.APIFY_MIN_HOURS || 12);
  const dayBudget = Number(process.env.APIFY_MAX_POSTS_PER_DAY || 60);
  const today = new Date().toISOString().slice(0, 10);
  if (apifyState.day !== today) Object.assign(apifyState, { day: today, postsToday: 0 });
  if (Date.now() - apifyState.lastRun < minHours * 3600000) return { items: [], skipped: `ran less than ${minHours}h ago` };
  const left = dayBudget - apifyState.postsToday;
  if (left <= 0) return { items: [], skipped: "daily post budget used" };
  const perHandle = Math.max(1, Math.min(5, Math.floor(left / handlesToRead.length)));
  const since = new Date(Date.now() - maxAgeDays * 86400000).toISOString().slice(0, 10);

  apifyState.lastRun = Date.now();
  const r = await getJson(
    `https://api.apify.com/v2/acts/apify~instagram-post-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=240`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: handlesToRead,
        resultsLimit: perHandle,
        onlyPostsNewerThan: since,
        skipPinnedPosts: true,
        dataDetailLevel: "basicData",
      }),
    },
    260000
  );
  if (!r.ok) throw new Error((r.data.error && (r.data.error.message || r.data.error.type)) || "Apify HTTP " + r.status);
  const rows = Array.isArray(r.data) ? r.data : [];
  apifyState.postsToday += rows.length;
  const items = rows
    .map((p) =>
      toItem(String(p.ownerUsername || p.username || "").toLowerCase() || "instagram", {
        caption: p.caption,
        permalink: p.url || (p.shortCode ? `https://www.instagram.com/p/${p.shortCode}/` : ""),
        timestamp: p.timestamp,
      })
    )
    .filter(Boolean);
  return { items, skipped: "" };
}

// ── combined, cached ─────────────────────────────────────────────────────────
const cache = { at: 0, byHandle: new Map(), status: null, inflight: null };

async function refresh(maxAgeDays) {
  const all = handles();
  const status = { handles: {}, discovery: "", apify: "", account: "" };
  const unreadable = [];

  let id = null;
  try {
    id = await resolveIdentity();
    status.discovery = id ? `ok (reading as @${id.username})` : "IG_DISCOVERY_TOKEN not set";
    status.account = id ? (id.kind === "page" ? "Page token (does not expire)" : "user token (expires after 60 days; a Page token is better)") : "";
    if (id && id.kind !== "page" && kindProbe) status.account += " — " + kindProbe;
  } catch (e) {
    status.discovery = "token problem: " + String(e.message || e);
  }

  if (id) {
    await Promise.all(
      all.map(async (h) => {
        try {
          const items = await discover(h, id);
          cache.byHandle.set(h, items);
          status.handles[h] = { via: "official API", posts: items.length };
        } catch (e) {
          unreadable.push(h);
          const msg = String(e.message || e);
          status.handles[h] = {
            via: "official API",
            error: (/\(#10\)/.test(msg)
              ? "token is missing a permission (needs instagram_manage_insights and ads_read too) — "
              : "") + msg.slice(0, 160),
          };
        }
      })
    );
  } else {
    unreadable.push(...all);
  }

  try {
    const { items, skipped } = await scrape(unreadable, maxAgeDays);
    status.apify = skipped || `ok (${items.length} posts)`;
    const got = new Map();
    for (const it of items) got.set(it.author, [...(got.get(it.author) || []), it]);
    for (const h of unreadable) {
      if (got.has(h)) {
        cache.byHandle.set(h, got.get(h));
        status.handles[h] = { via: "Apify", posts: got.get(h).length };
      } else if (!skipped) {
        status.handles[h] = { ...(status.handles[h] || {}), via: "Apify", posts: 0 };
      }
    }
  } catch (e) {
    status.apify = "error: " + String(e.message || e).slice(0, 200);
  }

  cache.at = Date.now();
  cache.status = status;
}

// Posts from the last `maxAgeDays`, newest first, plus a status report. Never
// throws and never waits long: if a refresh is due it runs in the background
// and this returns what is already known (empty on the very first call).
export async function getInstagramItems({ maxAgeDays = 30, wait = false, waitMs = 0 } = {}) {
  if (!process.env.IG_DISCOVERY_TOKEN && !process.env.APIFY_TOKEN) {
    return { items: [], status: { discovery: "IG_DISCOVERY_TOKEN not set", apify: "APIFY_TOKEN not set", handles: {} } };
  }
  if (Date.now() - cache.at > DISCOVERY_TTL_MS && !cache.inflight) {
    cache.inflight = refresh(maxAgeDays).finally(() => (cache.inflight = null));
  }
  if (wait && cache.inflight) await cache.inflight;
  // A short wait lets the official API's answers (seconds) land; each handle's
  // posts are stored as soon as they arrive, so this never waits on Apify.
  else if (waitMs && cache.inflight) await Promise.race([cache.inflight, new Promise((r) => setTimeout(r, waitMs))]);
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const items = [...cache.byHandle.values()]
    .flat()
    .filter((it) => !it.published_ms || it.published_ms >= cutoff)
    .sort((a, b) => (b.published_ms || 0) - (a.published_ms || 0));
  return { items, status: cache.status || { pending: true, handles: {} } };
}

export function instagramHandles() {
  return handles();
}
