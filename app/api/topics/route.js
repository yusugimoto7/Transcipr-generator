import { callClaude } from "../../../lib/anthropic";
import { TOPIC_PROMPT, parseTopics } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const text = await callClaude([{ role: "user", content: TOPIC_PROMPT }], true);
    const parsed = parseTopics(text);
    if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
      return Response.json({ error: "parse" }, { status: 502 });
    }
    return Response.json({ topics: parsed });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
