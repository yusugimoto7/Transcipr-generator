// Accounts for the Video Editing section. Hamed (admin) creates every account; nobody signs up.
// Passwords are scrypt hashes; a session is a signed cookie (lib/editing/session.js) that is
// checked against the stored user on every request, so disabling a member or changing a password
// ends their old sessions at once.
//
//   EDITING_SESSION_SECRET   32+ random characters; without it the section is switched off
//   ADMIN_EMAIL              Hamed's email; with ADMIN_BOOTSTRAP_PASSWORD it creates the admin
//   ADMIN_BOOTSTRAP_PASSWORD account on the first login, after which it is no longer accepted

import crypto from "crypto";
import { get, put, list, update, newId, storeConfigured } from "./store";
import { COOKIE, SESSION_DAYS, readSession, signSession, sessionSecret } from "./session";

export const MIN_PASSWORD = 10;

export function editingEnabled() {
  return !!sessionSecret() && storeConfigured();
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function checkPassword(pw, stored) {
  const [kind, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = crypto.scryptSync(String(pw), Buffer.from(salt, "base64"), want.length);
  return crypto.timingSafeEqual(want, got);
}

export function publicUser(u) {
  if (!u) return null;
  const { hash, ...rest } = u;
  return rest;
}

export function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}

export async function allUsers() {
  return (await list("users/")).map((x) => x.data);
}

export async function findByEmail(email) {
  const e = normEmail(email);
  return (await allUsers()).find((u) => normEmail(u.email) === e) || null;
}

export async function createUser({ name, email, password, role = "member", may_approve_own = false, created_by = "" }) {
  const e = normEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error("enter a valid email");
  if (!String(name || "").trim()) throw new Error("enter a name");
  if (String(password || "").length < MIN_PASSWORD) throw new Error(`the temporary password needs at least ${MIN_PASSWORD} characters`);
  if (await findByEmail(e)) throw new Error("an account with this email already exists");
  const user = {
    id: newId("u"),
    name: String(name).trim().slice(0, 80),
    email: e,
    role: role === "admin" ? "admin" : "member",
    may_approve_own: !!may_approve_own,
    active: true,
    must_change: true,
    pw_v: 1,
    hash: hashPassword(password),
    created_at: Date.now(),
    created_by,
  };
  await put(`users/${user.id}.json`, user, null, `app: add user ${user.id}`);
  return user;
}

export async function setPassword(userId, password, { mustChange = false } = {}) {
  if (String(password || "").length < MIN_PASSWORD) throw new Error(`the password needs at least ${MIN_PASSWORD} characters`);
  return update(`users/${userId}.json`, (u) => ({
    ...u,
    hash: hashPassword(password),
    pw_v: (u.pw_v || 1) + 1,
    must_change: mustChange,
  }), `app: password ${userId}`);
}

// ---- sessions ---------------------------------------------------------------------------------

function cookieValue(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}

export async function sessionCookie(user) {
  const token = await signSession({ uid: user.id, role: user.role, pv: user.pw_v, mc: !!user.must_change });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// The signed-in, active user, or null.
export async function currentUser(request) {
  const s = await readSession(cookieValue(request, COOKIE));
  if (!s) return null;
  const rec = await get(`users/${s.uid}.json`).catch(() => null);
  const u = rec && rec.data;
  if (!u || !u.active || u.pw_v !== s.pv) return null;
  return u;
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

// For route handlers: { user } or { res } to return as is.
export async function guard(request, { admin = false, allowMustChange = false } = {}) {
  if (!editingEnabled()) return { res: json({ error: "Video Editing is not switched on yet" }, 503) };
  const user = await currentUser(request);
  if (!user) return { res: json({ error: "sign in again" }, 401) };
  if (user.must_change && !allowMustChange) return { res: json({ error: "change your temporary password first" }, 403) };
  if (admin && user.role !== "admin") return { res: json({ error: "only the admin can do this" }, 403) };
  return { user };
}

// Login attempts per email, kept in memory: 8 failures lock that email for 15 minutes.
const fails = globalThis.__editingFails || (globalThis.__editingFails = new Map());
export function loginLocked(email) {
  const f = fails.get(normEmail(email));
  return !!f && f.n >= 8 && Date.now() - f.at < 15 * 60 * 1000;
}
export function loginFailed(email) {
  const k = normEmail(email);
  const f = fails.get(k);
  const fresh = !f || Date.now() - f.at > 15 * 60 * 1000;
  fails.set(k, { n: fresh ? 1 : f.n + 1, at: fresh ? Date.now() : f.at });
}
export function loginOk(email) {
  fails.delete(normEmail(email));
}
