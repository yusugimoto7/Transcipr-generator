import { sheetEnabled, appendRows } from "../../../lib/sheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Record a single APPROVED topic to the durable, cross-device "seen" history so
// it never comes back on any device. Called by the client when the user swipes
// right / taps ✓ — NOT at generation time. Topics the user never approved are
// never written here, so they stay available in future runs.
export async function POST(request) {
  try {
    const { topic } = await request.json();
    if (!topic || !(topic.title_fa || topic.title_en)) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    // Evergreen how-to cards are meant to recur — never burn them.
    if (topic.evergreen) return Response.json({ ok: true, skipped: "evergreen" });
    if (!sheetEnabled()) return Response.json({ ok: true, skipped: "no-sheet" });
    await appendRows([topic]);
    return Response.json({ ok: true });
  } catch (e) {
    // Non-fatal: the client also keeps a local record, so a failure here just
    // means this approval isn't in the cross-device history.
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
}
