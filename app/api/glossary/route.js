import { loadGlossary, glossaryStatus, formatGlossary, seedSheet, GROUPS } from "../../../lib/glossary";
import { guard, json } from "../../../lib/editing/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The glossary the app is using right now (lib/glossary.js): JSON by default, or the prompt block
// with ?format=text&lang=fa|en, for the editing worker, the video workflow and anyone checking a
// term. ?refresh=1 reads the Sheet again at once instead of waiting out the cache.
export async function GET(request) {
  const url = new URL(request.url);
  const items = await loadGlossary({ fresh: url.searchParams.get("refresh") === "1" });
  const lang = url.searchParams.get("lang") === "en" ? "en" : "fa";
  if (url.searchParams.get("format") === "text") {
    return new Response(formatGlossary(items, lang), { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return json({ ...glossaryStatus(), groups: GROUPS, items });
}

// POST { seed: true } (admin): add the built-in terms the Sheet's Glossary tab does not have yet.
export async function POST(request) {
  const g = await guard(request, { admin: true });
  if (g.res) return g.res;
  try {
    const body = await request.json().catch(() => ({}));
    if (!body || !body.seed) return json({ error: "nothing to do" }, 400);
    const out = await seedSheet();
    await loadGlossary({ fresh: true });
    return json({ ok: true, added: Number(out && out.added) || 0, ...glossaryStatus() });
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}
