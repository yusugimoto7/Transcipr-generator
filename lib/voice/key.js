// A personal key for voice typing outside the app (the browser extension in extensions/voice, used
// in Odoo's CRM notes, Oct 29 2026). The extension cannot carry the app's session cookie to another
// site, so each person copies this key from Settings once. It is the account's id and a signature
// over it and the password version: changing the password, or the session secret, ends every key.
import crypto from "node:crypto";
import { get } from "../editing/store.js";
import { sessionSecret } from "../editing/session.js";

function sig(uid, pv) {
  return crypto.createHmac("sha256", sessionSecret()).update(`voice-ext:${uid}:${pv || 0}`).digest("base64url").slice(0, 32);
}

export function voiceKeyFor(user) {
  if (!sessionSecret() || !user) return "";
  return `${user.id}.${sig(user.id, user.pw_v)}`;
}

// The active account a key belongs to, or null.
export async function userForVoiceKey(key) {
  const m = String(key || "").match(/^([A-Za-z0-9_-]{4,64})\.([A-Za-z0-9_-]{32})$/);
  if (!m || !sessionSecret()) return null;
  const rec = await get(`users/${m[1]}.json`).catch(() => null);
  const u = rec && rec.data;
  if (!u || !u.active) return null;
  const want = Buffer.from(sig(u.id, u.pw_v));
  const got = Buffer.from(m[2]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? u : null;
}
