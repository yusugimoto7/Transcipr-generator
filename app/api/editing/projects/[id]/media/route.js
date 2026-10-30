import { guard, json } from "../../../../../../lib/editing/auth";
import { loadProject, previewOf } from "../../../../../../lib/editing/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A version's preview, passed through from Drive with byte ranges, for the hand editor. Played from
// this app's own address the editor may draw its frames into the filmstrip; straight from Drive the
// browser forbids reading them.
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const project = await loadProject(g.user, params.id);
    const id = await previewOf(project, new URL(request.url).searchParams.get("run"));
    const range = request.headers.get("range");
    const res = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, {
      headers: range ? { Range: range } : {},
      redirect: "follow",
      cache: "no-store",
    });
    const type = res.headers.get("content-type") || "";
    if ((!res.ok && res.status !== 206) || type.includes("text/html")) return json({ error: "Drive did not give the preview (" + res.status + ")" }, 502);
    const headers = new Headers({ "Content-Type": "video/mp4", "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes" });
    for (const h of ["content-length", "content-range"]) if (res.headers.get(h)) headers.set(h, res.headers.get(h));
    return new Response(res.body, { status: res.status, headers });
  } catch (e) {
    return json({ error: String(e.message || e) }, e.status || 500);
  }
}
