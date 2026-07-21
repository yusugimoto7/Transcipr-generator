import { getLibrary, saveLibraryItem } from "../../../lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List every saved script/article. Errors resolve to an empty list (200) so the
// client can silently fall back to its own per-device storage.
export async function GET() {
  try {
    const items = await getLibrary();
    return Response.json({ items });
  } catch (e) {
    return Response.json({ items: [], error: String(e?.message || e) });
  }
}

// Save one item. Fire-and-forget from the client; localStorage stays the
// source of truth, so a failure here is non-fatal.
export async function POST(request) {
  try {
    const { item } = await request.json();
    if (!item || !item.id) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    const r = await saveLibraryItem(item);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json({ ok: false, error: String(e?.message || e) });
  }
}
