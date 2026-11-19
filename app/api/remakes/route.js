import { bestOwnPosts } from "../../../lib/remakes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The page's own best posts to make again (lib/remakes.js), best first, the remade ones apart.
export async function GET() {
  try {
    return Response.json(await bestOwnPosts(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e), posts: [], made: [] }, { status: 500 });
  }
}
