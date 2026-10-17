// Signed session cookie for the Video Editing login. Web Crypto only, so the same code runs in
// the middleware (edge) and in the route handlers (node).

export const COOKIE = "ve_session";
export const SESSION_DAYS = 3;

const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export function sessionSecret() {
  const s = process.env.EDITING_SESSION_SECRET || "";
  return s.length >= 32 ? s : "";
}

// payload: { uid, role, pv (password version), mc (must change password) }
export async function signSession(payload) {
  const body = b64url(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + SESSION_DAYS * 864e5 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(sessionSecret()), enc.encode(body)));
  return body + "." + b64url(sig);
}

export async function readSession(token) {
  const secret = sessionSecret();
  if (!secret || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(secret), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64url(body)));
    return p.exp > Date.now() ? p : null;
  } catch (_) {
    return null;
  }
}

// A short-lived access ticket next to the session: which parts of the app this person may open, as
// the server last read it. The middleware cannot read the store, so it trusts the ticket for a few
// minutes and then has it renewed; a change on the Team page applies within that time.
export const TICKET = "ve_access";
export const TICKET_MINUTES = 5;

export async function signTicket(uid, ax) {
  const body = b64url(enc.encode(JSON.stringify({ t: 1, uid, ax, exp: Date.now() + TICKET_MINUTES * 60000 })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(sessionSecret()), enc.encode(body)));
  return body + "." + b64url(sig);
}

export async function readTicket(token, uid) {
  const p = await readSession(token);
  return p && p.t === 1 && p.uid === uid && Array.isArray(p.ax) ? p.ax : null;
}
