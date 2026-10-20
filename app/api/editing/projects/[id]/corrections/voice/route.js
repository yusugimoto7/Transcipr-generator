import { guard, json } from "../../../../../../../lib/editing/auth";
import { get } from "../../../../../../../lib/editing/store";
import { loadProject } from "../../../../../../../lib/editing/projects";
import { audioFrom, transcribe } from "../../../../../../../lib/voice";
import { correctionsFromSpeech } from "../../../../../../../lib/voice/corrections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST multipart { audio }: the spoken review of the version under review, split into corrections
// by output second. Nothing is saved here: the page shows them to be checked, then adds them one by
// one through the corrections route like typed ones.
export async function POST(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const run = (await get(`runs/${project.latest_run_id}.json`))?.data;
    if (!run || run.status !== "review") return json({ error: "corrections can be added while the latest version is waiting for review" }, 409);
    const { file } = await audioFrom(request);
    const text = await transcribe(file);
    return json({ text, ...(await correctionsFromSpeech(text, run.result && run.result.output_s)) });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
