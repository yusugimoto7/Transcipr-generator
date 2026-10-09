import { getLexbaseDeck } from "../../../../lib/newsletter/lexbase-deck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The newsletter section: a card for every item of a Lexbase issue. Cards are
// written in the background; the page polls this until `writing` is false.
export async function GET(request) {
  const issue = new URL(request.url).searchParams.get("issue") || "";
  try {
    const deck = await getLexbaseDeck({ issue });
    return Response.json(deck, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
