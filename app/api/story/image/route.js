export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A story page as a file to save. The pages are hosted on HCTI, a different
// origin, so the browser can neither download nor share them directly; this
// passes the image through. Only HCTI images, so it is not an open proxy.
//   GET /api/story/image?u=<hcti url>&name=<file name>
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  let url;
  try {
    url = new URL(params.get("u") || "");
  } catch (_) {
    return Response.json({ error: "bad url" }, { status: 400 });
  }
  if (url.protocol !== "https:" || !/(^|\.)hcti\.io$/.test(url.hostname)) {
    return Response.json({ error: "not a story image" }, { status: 400 });
  }
  const res = await fetch(url, { redirect: "follow" }).catch(() => null);
  if (!res || !res.ok) return Response.json({ error: "image not available" }, { status: 502 });
  const type = res.headers.get("content-type") || "image/png";
  if (!/^image\//.test(type)) return Response.json({ error: "not an image" }, { status: 502 });
  const name = String(params.get("name") || "story.png").replace(/[^\w.-]+/g, "-").slice(0, 80);
  return new Response(res.body, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
