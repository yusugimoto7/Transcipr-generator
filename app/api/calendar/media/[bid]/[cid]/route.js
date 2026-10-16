import { getBoard, checkId } from "../../../../../../lib/calendar/model";
import { checkMediaSig, openMedia } from "../../../../../../lib/calendar/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The card's video or image, streamed from Drive, for platforms that fetch media by URL
// (Instagram). Only with a valid signature from lib/calendar/media.js, valid for a few hours.
export async function GET(request, { params }) {
  const q = new URL(request.url).searchParams;
  if (!checkMediaSig(params.bid, params.cid, q.get("exp"), q.get("sig"))) return new Response("not found", { status: 404 });
  try {
    const b = await getBoard(params.bid);
    const card = b.cards.find((c) => c.id === checkId(params.cid));
    if (!card || !card.media || !card.media.url) return new Response("not found", { status: 404 });
    const res = await openMedia(card.media.url);
    const headers = { "Content-Type": res.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" };
    if (res.headers.get("content-length")) headers["Content-Length"] = res.headers.get("content-length");
    return new Response(res.body, { headers });
  } catch (e) {
    return new Response(String(e.message || e), { status: 502 });
  }
}
