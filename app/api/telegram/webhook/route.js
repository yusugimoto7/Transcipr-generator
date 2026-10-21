export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The old review flow (drafts sent to a Telegram review chat with ✅/✏️/❌ buttons) is gone:
// posts are written, edited and approved in the app now (Oct 2026). Telegram may still call this
// address if the webhook was registered once; it is answered and ignored, so Telegram stops retrying.
export async function POST() {
  return Response.json({ ok: true });
}
