import { listCases, archiveCase } from "../../../lib/visa-news/cases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Studio's saved visa-result cases. GET lists them; POST { id, archive: true } removes one from the list.
export async function GET() {
  try {
    return Response.json({ cases: await listCases() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ cases: [], error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (body && body.archive) await archiveCase(String(body.id || ""));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
