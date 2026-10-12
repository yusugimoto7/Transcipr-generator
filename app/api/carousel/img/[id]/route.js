import { memoryImage } from "../../../../../lib/carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A carousel image kept in memory because WordPress could not take it.
export async function GET(_request, { params }) {
  const buf = memoryImage(params.id);
  if (!buf) return new Response("Not found (the server restarted since this image was made).", { status: 404 });
  return new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" } });
}
