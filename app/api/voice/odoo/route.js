import { toFile } from "openai";
import { MAX_BYTES, transcribe, voiceEnabled } from "../../../../lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voice typing in Odoo's chatter (odoo-migration odoo_addons/voice_dictation). Odoo cannot run the
// speech call itself (its add-on is imported without Python), so the page puts the recording into
// Odoo as an attachment with a fresh access token and sends us only { id, token }. We fetch it back
// from our own Odoo, so only someone signed in to it can make us transcribe anything, and no key
// lives in the browser. Open in access.js; nothing is stored here.
const ODOO = (process.env.ODOO_VOICE_URL || "https://odoo.sugimotogroup.org").replace(/\/+$/, "");
const CORS = {
  "Access-Control-Allow-Origin": ODOO,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
  Vary: "Origin",
};

function reply(body, status = 200) {
  return Response.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  if (!voiceEnabled()) return reply({ error: "voice typing is not switched on in the Topic Engine" }, 503);
  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  const token = String(body.token || "");
  if (!Number.isInteger(id) || id <= 0 || !/^[A-Za-z0-9-]{20,64}$/.test(token)) return reply({ error: "bad request" }, 400);
  try {
    const r = await fetch(`${ODOO}/web/content/${id}?access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return reply({ error: "the recording could not be read from Odoo; please try again" }, 400);
    const type = String(r.headers.get("content-type") || "").split(";")[0];
    if (!/^(audio|video)\//.test(type)) return reply({ error: "that file is not a recording" }, 400);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return reply({ error: "the recording is too long; keep a note under 5 minutes" }, 413);
    if (buf.length < 1000) return reply({ error: "the recording is empty; please speak closer to the microphone" }, 400);
    const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : "webm";
    const text = await transcribe(await toFile(buf, `note.${ext}`, { type }));
    return reply({ text });
  } catch (e) {
    return reply({ error: String(e.message || e) }, e.status || 500);
  }
}
