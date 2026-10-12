import { sourceTextFor, writeSlides } from "../../../../lib/carousel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic: the slide-text step alone for a topic, with the model's raw
// answer. Saves nothing and draws no images (about a cent per call).
//   POST { topic, count?, notes? } -> { source_chars, slides, caption, raw }
export async function POST(request) {
  try {
    const { topic, count, notes } = await request.json();
    if (!topic || !(topic.title_fa || topic.title_en)) return Response.json({ error: "bad request" }, { status: 400 });
    const sourceText = await sourceTextFor(topic);
    const out = await writeSlides(topic, count || 5, notes || "", sourceText, { returnRaw: true });
    return Response.json({ source_chars: sourceText.length, ...out });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
