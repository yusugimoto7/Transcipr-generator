// Voice notes: one place for the limits and the spelling hints, used by the app-wide dictation
// (/api/voice/transcribe) and by spoken corrections in Video Editing.

import { openaiEnabled, openaiTranscribe } from "../openai";
import { loadGlossary } from "../glossary.js";

export const MAX_BYTES = 20 * 1024 * 1024; // the speech API takes 25 MB; a 5-minute note is far less

// Terms the team says in English inside Farsi, written the way the brand writes them.
const HINT =
  "Sugimoto Visa. Farsi and English, often mixed. Express Entry, IRCC, PNP, LMIA, Inland, Outland, Overseas, Sponsorship, Spousal, Study Permit, Work Permit, PGWP, CRS, Federal Court, Lexbase, Reel, Carousel, Story.";

export function voiceEnabled() {
  return openaiEnabled();
}

export async function audioFrom(request) {
  const form = await request.formData().catch(() => null);
  const file = form && form.get("audio");
  if (!file || typeof file === "string") throw Object.assign(new Error("no recording came with the request"), { status: 400 });
  if (file.size > MAX_BYTES) throw Object.assign(new Error("the recording is too long; keep a note under 5 minutes"), { status: 413 });
  if (file.size < 1000) throw Object.assign(new Error("the recording is empty; hold the phone closer and try again"), { status: 400 });
  return { file, form };
}

// The speech model takes a short hint (about 220 tokens), so only the terms people say most:
// work, study, programmes and family first, in the glossary's own Persian names.
const HINT_GROUPS = ["work", "study", "programs", "pnp", "family", "status", "institutions", "process"];
async function hintFor() {
  try {
    const items = await loadGlossary();
    const picked = [];
    let len = 0;
    for (const g of HINT_GROUPS) {
      for (const t of items) {
        if (t.group !== g || !t.fa || /[A-Za-z]/.test(t.fa)) continue;
        if (len + t.fa.length + 2 > 330) return picked.join("، ");
        picked.push(t.fa);
        len += t.fa.length + 2;
      }
    }
    return picked.join("، ");
  } catch {
    return "";
  }
}

export async function transcribe(file) {
  if (!voiceEnabled()) throw Object.assign(new Error("voice notes are not switched on (USE_OPENAI and OPENAI_API_KEY)"), { status: 503 });
  const names = await hintFor();
  return openaiTranscribe(file, names ? `${HINT} ${names}.` : HINT);
}
