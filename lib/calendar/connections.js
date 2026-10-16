// Accounts the admin connects from the calendar (YouTube, TikTok). Their refresh tokens are kept
// encrypted (AES-256-GCM, key derived from EDITING_SESSION_SECRET) on the data branch, so nobody
// has to copy tokens into Render. Changing EDITING_SESSION_SECRET means connecting them again.
// X, LinkedIn and Instagram use the keys already set on Render for the draws poster.

import crypto from "crypto";
import { get, put } from "../editing/store";

const pathOf = (ch) => `calendar/connections/${ch}.json`;

function key() {
  return crypto.createHash("sha256").update("calendar-connections:" + (process.env.EDITING_SESSION_SECRET || "")).digest();
}

export async function loadConnection(ch) {
  const rec = await get(pathOf(ch)).catch(() => null);
  if (!rec) return null;
  try {
    const { iv, tag, data } = rec.data;
    const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    const plain = Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
    return { ...JSON.parse(plain), _sha: rec.sha, _label: rec.data.label || "" };
  } catch (_) {
    return null; // secret changed: connect again
  }
}

export async function saveConnection(ch, value, label) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const { _sha, _label, ...clean } = value;
  const data = Buffer.concat([c.update(JSON.stringify(clean), "utf8"), c.final()]);
  const prev = await get(pathOf(ch)).catch(() => null);
  await put(pathOf(ch), {
    iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), data: data.toString("base64"),
    label: label !== undefined ? String(label).slice(0, 100) : (prev && prev.data.label) || "", updated_at: Date.now(),
  }, prev ? prev.sha : null, `calendar: ${ch} connection`);
}

// Signed OAuth "state" so a callback can only finish a sign-in the admin started.
export function makeState(uid) {
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + 15 * 60000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  return body + "." + sig;
}

export function readState(state) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", key()).update(body).digest("base64url");
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  return p.exp > Date.now() ? p : null;
}
