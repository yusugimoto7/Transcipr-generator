import { json } from "../../../../lib/editing/auth";
import { audioFrom, transcribe, voiceEnabled } from "../../../../lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: is dictation on. POST multipart { audio }: the text of the note, in the language it was
// spoken. Nothing is stored.
export async function GET() {
  return json({ enabled: voiceEnabled() });
}

export async function POST(request) {
  try {
    const { file } = await audioFrom(request);
    return json({ text: await transcribe(file) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
