import { runChanged } from "../../../../../../lib/editing/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The worker (english-sugimotovisa rough_cut_service.py) calls this after a run reaches review,
// fails or is delivered. Open on purpose: the app only re-reads the run from the data branch and
// tells people at most once per state (lib/editing/notify.js).
export async function POST(request, { params }) {
  try {
    return Response.json(await runChanged(params.id));
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: e.status || 500 });
  }
}
