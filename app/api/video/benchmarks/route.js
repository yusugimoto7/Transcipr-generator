import { listBenchmarks, benchmarkThumbnail, benchmarkFolderUrl } from "../../../../lib/benchmarks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The benchmark videos in the team's Drive folder, for the video options sheet.
//   GET /api/video/benchmarks            -> { folder, videos: [{ id, title, url, thumb, ratio, orientation, fits }] }
//   GET /api/video/benchmarks?fresh=1    -> the same, read again now
//   GET /api/video/benchmarks?thumb=<id> -> that video's thumbnail image
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const thumb = params.get("thumb");
  try {
    if (thumb) {
      const t = await benchmarkThumbnail(thumb);
      if (!t) return new Response("not found", { status: 404 });
      return new Response(t.buf, { headers: { "Content-Type": t.type, "Cache-Control": "public, max-age=86400" } });
    }
    const videos = await listBenchmarks({ fresh: params.get("fresh") === "1" });
    return Response.json({ folder: benchmarkFolderUrl(), videos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ folder: benchmarkFolderUrl(), videos: [], error: String(e?.message || e) }, { status: 200 });
  }
}
