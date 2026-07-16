import { callClaude } from "../../../lib/anthropic";
import { scriptPrompt } from "../../../lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { topic, lang } = await request.json();
    if (!topic || (lang !== "fa" && lang !== "en")) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    const text = await callClaude(
      [{ role: "user", content: scriptPrompt(topic, lang) }],
      false
    );
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
