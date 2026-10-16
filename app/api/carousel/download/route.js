import { memoryImage } from "../../../../lib/carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One carousel image as a file download. Browsers ignore the download
// attribute on links to another site (the images live in the WordPress media
// library), so the page asks for them through here. Only the site's uploads
// and this app's own images are passed through, never an arbitrary address.
//   GET ?url=<image url>&name=<file name>
function allowed(u) {
  try {
    const url = new URL(u);
    const wp = new URL(process.env.WP_BASE_URL || "https://sugimotovisa.com");
    const bare = (h) => h.replace(/^www\./, "");
    return url.protocol === "https:" && bare(url.hostname) === bare(wp.hostname) && url.pathname.startsWith("/wp-content/uploads/");
  } catch (_) {
    return false;
  }
}

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const src = q.get("url") || "";
  const name = (q.get("name") || "slide.jpg").replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 80);
  const headers = { "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, max-age=300" };

  const own = src.match(/\/api\/carousel\/img\/([0-9a-f-]{36})$/i);
  if (own) {
    const buf = memoryImage(own[1]);
    if (!buf) return new Response("This image is gone (the server restarted since it was made).", { status: 404 });
    return new Response(buf, { headers });
  }
  if (!allowed(src)) return new Response("Not an image this app can download.", { status: 400 });
  const res = await fetch(src).catch(() => null);
  if (!res || !res.ok) return new Response("The image could not be fetched.", { status: 502 });
  return new Response(res.body, { headers: { ...headers, "Content-Type": res.headers.get("content-type") || "image/jpeg" } });
}
