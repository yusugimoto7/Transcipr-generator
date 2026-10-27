import { guard, json } from "../../../../lib/editing/auth";
import { getRepoFile } from "../../../../lib/editing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The voices a dub speaker can have (Hamed, 27 Oct 2026: the border-officer series, where the officer keeps
// Hamed's voice and the traveller gets another one). Read from the worker's config/video_process.json on
// main, the one place the video process is defined: Hamed's approved voice, and the HeyGen public voices
// offered for anyone else. The app never holds a copy of the list.
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const text = await getRepoFile("config/video_process.json");
    if (!text) return json({ error: "config/video_process.json was not found on main" }, 502);
    const cfg = JSON.parse(text);
    const sp = cfg.speakers || {};
    const other = sp.other_voices || {};
    return json({
      hamed: { voice_id: "hamed", name: cfg.voice_name || "Hamed" },
      max: sp.max || 4,
      female: (other.female || []).map((v) => ({ voice_id: v.voice_id, name: v.name })),
      male: (other.male || []).map((v) => ({ voice_id: v.voice_id, name: v.name })),
    });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
