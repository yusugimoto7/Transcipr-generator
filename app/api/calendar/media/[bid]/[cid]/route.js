import sharp from "sharp";
import { getBoard, checkId, mediaItems } from "../../../../../../lib/calendar/model";
import { checkMediaSig, openMedia } from "../../../../../../lib/calendar/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Instagram takes JPEG pictures only, up to 8 MB ("The image format is not supported", Oct 24 2026:
// a carousel's slides are PNG); anything else is turned into a JPEG on the way out.
const IG_MAX_BYTES = 8 * 1024 * 1024;

// The card's video or image, streamed from Drive, for platforms that fetch media by URL
// (Instagram). Only with a valid signature from lib/calendar/media.js, valid for a few hours.
export async function GET(request, { params }) {
  const q = new URL(request.url).searchParams;
  const i = Math.max(0, Math.floor(Number(q.get("i")) || 0));
  if (!checkMediaSig(params.bid, params.cid, q.get("exp"), q.get("sig"), i)) return new Response("not found", { status: 404 });
  try {
    const b = await getBoard(params.bid);
    const card = b.cards.find((c) => c.id === checkId(params.cid));
    const item = card && mediaItems(card.media)[i];
    if (!item) return new Response("not found", { status: 404 });
    const res = await openMedia(item.url);
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const size = Number(res.headers.get("content-length") || 0);
    if (item.kind === "image" && (type !== "image/jpeg" || !size || size > IG_MAX_BYTES)) {
      const input = Buffer.from(await res.arrayBuffer());
      const jpeg = await sharp(input)
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({ width: 1440, height: 1800, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
      return new Response(jpeg, { headers: { "Content-Type": "image/jpeg", "Content-Length": String(jpeg.length), "Cache-Control": "no-store" } });
    }
    const headers = { "Content-Type": res.headers.get("content-type") || "application/octet-stream", "Cache-Control": "no-store" };
    if (res.headers.get("content-length")) headers["Content-Length"] = res.headers.get("content-length");
    return new Response(res.body, { headers });
  } catch (e) {
    return new Response(String(e.message || e), { status: 502 });
  }
}
