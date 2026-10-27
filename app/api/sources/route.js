import { loadSources, sourcesStatus, unplacedRows, kindOf } from "../../../lib/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// What the app reads from the Sources sheet right now (lib/sources.js): how many rows of each kind,
// which are ticked, the rows it could not place, and any read error. ?refresh=1 reads the sheet
// again at once instead of waiting out the 10-minute cache.
export async function GET(request) {
  const url = new URL(request.url);
  const rows = await loadSources({ fresh: url.searchParams.get("refresh") === "1" });
  return Response.json(
    {
      ...sourcesStatus(),
      unplaced: unplacedRows().map((r) => ({ section: r.section, type: r.type, name: r.name, link: r.link })),
      rows: (rows || []).map((r) => ({ ...r, kind: kindOf(r) })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
