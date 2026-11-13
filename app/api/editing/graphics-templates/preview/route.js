import { guard } from "../../../../../lib/editing/auth";
import { getRepoPicture } from "../../../../../lib/editing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A look's preview still (?id=<look>&n=1|2), drawn by the real graphics engine in english-sugimotovisa
// (scripts/graphics_previews.py) and read from its main; never a copy kept in this app.
export async function GET(request) {
  const g = await guard(request);
  if (g.res) return g.res;
  const q = new URL(request.url).searchParams;
  const id = String(q.get("id") || "");
  const n = q.get("n") === "2" ? "2" : "1";
  if (!/^[a-z0-9-]{1,30}$/.test(id)) return new Response("bad id", { status: 400 });
  try {
    const buf = await getRepoPicture(`config/graphics_previews/${id}-${n}.jpg`);
    if (!buf) return new Response("no preview yet", { status: 404 });
    return new Response(buf, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    return new Response(String(e.message || e), { status: 502 });
  }
}
