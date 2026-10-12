import { getIdeas } from "../../../lib/ideas/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// General ideas (lib/ideas/index.js). GET lists them and starts a batch when
// one is due; POST { refresh: true } asks for a new batch now. Generation
// runs in the background; the page polls while `generating` is true.
export async function GET() {
  try {
    return Response.json(await getIdeas(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e), ideas: [] }, { status: 500 });
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  try {
    return Response.json(await getIdeas({ refresh: !!body.refresh, waitMs: 1500 }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e), ideas: [] }, { status: 500 });
  }
}
