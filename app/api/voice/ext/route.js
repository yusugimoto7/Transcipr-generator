import { audioFrom, transcribe } from "../../../../lib/voice";
import { userForVoiceKey } from "../../../../lib/voice/key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voice typing from the browser extension (extensions/voice), on any site: POST multipart { audio }
// with "Authorization: Bearer <personal key>" → { text }. Open in access.js; the key is the check.
// Nothing is stored. Any origin may call it because the key, not a cookie, is what lets it in.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
  "Cache-Control": "no-store",
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request) {
  const key = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const user = await userForVoiceKey(key);
  if (!user) return Response.json({ error: "the key is not valid; copy it again from Settings in the Topic Engine" }, { status: 401, headers: CORS });
  try {
    const { file } = await audioFrom(request);
    return Response.json({ text: await transcribe(file) }, { headers: CORS });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: e.status || 500, headers: CORS });
  }
}
