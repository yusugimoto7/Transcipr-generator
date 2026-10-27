// Push notifications to the team's phones (Hamed, Oct 27 2026): the app is added to the iPhone's
// home screen and tells each person when something they started is ready (a script, carousel,
// story, article, a HeyGen video, a Video Editing version) and when a post needs or got an approval.
//
// Each person's devices live in push/<user id>.json on the editing-data branch:
//   { subs: [{ endpoint, keys, ua, at }], team: false }
// `team` asks for the team's work as well as one's own. Keys: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT on the server; without them nothing is sent and the page hides the switch.
//
// Sending never throws: a notification is a courtesy, never a reason for the work itself to fail.

import webpush from "web-push";
import { get, put, update, list, storeConfigured } from "../editing/store";

const SUB_LIMIT = 6; // a phone, a tablet, a computer or two; old ones fall off

export function pushEnabled() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) && storeConfigured();
}

export function publicKey() {
  return process.env.VAPID_PUBLIC_KEY || "";
}

let configured = false;
function setup() {
  if (configured) return;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://sugimoto-topic-engine.onrender.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  configured = true;
}

const pathOf = (uid) => `push/${String(uid).replace(/[^a-z0-9-]/gi, "")}.json`;

export async function prefsOf(uid) {
  const rec = await get(pathOf(uid)).catch(() => null);
  return rec ? rec.data : { subs: [], team: false };
}

function cleanSub(s) {
  const endpoint = String((s && s.endpoint) || "");
  const keys = (s && s.keys) || {};
  if (!/^https:\/\//.test(endpoint) || !keys.p256dh || !keys.auth) throw new Error("not a push subscription");
  return { endpoint, keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) } };
}

async function save(uid, fn) {
  const p = pathOf(uid);
  const rec = await get(p);
  if (!rec) return put(p, fn({ subs: [], team: false }), null, "app: notifications");
  return update(p, fn, "app: notifications");
}

export async function subscribe(uid, sub, ua = "") {
  const s = { ...cleanSub(sub), ua: String(ua).slice(0, 160), at: Date.now() };
  await save(uid, (d) => ({ ...d, subs: [s, ...(d.subs || []).filter((x) => x.endpoint !== s.endpoint)].slice(0, SUB_LIMIT) }));
}

export async function unsubscribe(uid, endpoint) {
  await save(uid, (d) => ({ ...d, subs: (d.subs || []).filter((x) => x.endpoint !== endpoint) }));
}

export async function setTeam(uid, team) {
  await save(uid, (d) => ({ ...d, team: !!team }));
}

// Who gets an event: the people named, plus everyone who asked for the team's work too.
// `except` is whoever did the thing themselves (no notification for your own click).
async function recipients(uids, { team = true, except = "", allow = null } = {}) {
  const want = new Set((uids || []).filter(Boolean));
  const out = new Map();
  for (const rec of await list("push/").catch(() => [])) {
    const uid = rec.path.replace(/^push\/|\.json$/g, "");
    const d = rec.data || {};
    if (!(d.subs || []).length) continue;
    if (want.has(uid) || (team && d.team)) out.set(uid, d);
  }
  if (except) out.delete(except);
  // the team's work goes only to people who may open it
  if (allow) for (const uid of [...out.keys()]) if (!want.has(uid) && !(await allow(uid))) out.delete(uid);
  return out;
}

// title/body: what happened, each a pair [Persian, English] read in the person's own app language
// (or a plain string); url: where a tap opens; tag: a later notification with the same tag replaces
// the earlier one on the phone (a version going from "failed" to "ready").
export async function notify(uids, { title, body = "", url = "/", tag = "" }, opts = {}) {
  if (!pushEnabled()) return 0;
  let sent = 0;
  try {
    setup();
    const to = await recipients(uids, opts);
    if (!to.size) return 0;
    const langs = Object.fromEntries((await list("users/").catch(() => [])).map((r) => [r.data.id, r.data.lang === "en" ? 1 : 0]));
    const pick = (v, i) => (Array.isArray(v) ? v[i] || v[0] : v);
    for (const [uid, d] of to) {
      const i = langs[uid] || 0;
      const payload = JSON.stringify({ title: String(pick(title, i)).slice(0, 120), body: String(pick(body, i) || "").slice(0, 300), url, tag, dir: i ? "ltr" : "rtl" });
      const dead = [];
      for (const s of d.subs) {
        try {
          await webpush.sendNotification(s, payload, { TTL: 24 * 3600, urgency: "normal" });
          sent++;
        } catch (e) {
          // 404/410: the person removed the app or turned notifications off on that device
          if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint);
        }
      }
      if (dead.length) await save(uid, (x) => ({ ...x, subs: (x.subs || []).filter((s) => !dead.includes(s.endpoint)) })).catch(() => {});
    }
  } catch (e) {
    console.error("push:", e && e.message);
  }
  return sent;
}

// Fire and forget, for code paths that must not wait on the phones.
export function notifyLater(uids, msg, opts) {
  notify(uids, msg, opts).catch(() => {});
}

// The admin accounts (Hamed): who is asked to approve a post.
export async function adminIds() {
  return (await list("users/").catch(() => [])).map((r) => r.data).filter((u) => u && u.role === "admin" && u.active !== false).map((u) => u.id);
}
