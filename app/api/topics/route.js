import { callClaude } from "../../../lib/anthropic";
import { topicPrompt, parseTopics } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    let exclude = [];
    try {
      const body = await request.json();
      if (Array.isArray(body?.exclude)) {
        exclude = body.exclude.slice(0, 60).map((t) => String(t).slice(0, 200));
      }
    } catch (_) {
      // no/invalid body — fine, just don't exclude anything
    }

    const today = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local date
    const text = await callClaude(
      [{ role: "user", content: topicPrompt(today, exclude) }],
      true
    );
    const parsed = parseTopics(text);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      return Response.json({ error: "parse" }, { status: 502 });
    }
    return Response.json({ topics: parsed });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
