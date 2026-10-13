import { callbackAuthorized } from "../../../../lib/video";
import { getEntry, saveMaterial } from "../../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["rendering", "done", "failed"];

// The video workflow reports progress here (see lib/video.js for the
// contract). Saved over the topic's "video" material, so whoever opens the
// topic sees the rendered video or why it failed.
export async function POST(request) {
  if (!callbackAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const key = String(body?.topic_key || "");
  const status = String(body?.status || "");
  if (!key || !STATUSES.includes(status)) return Response.json({ error: "bad request" }, { status: 400 });

  const entry = await getEntry(key).catch(() => null);
  if (!entry || !entry.topic) return Response.json({ error: "unknown topic" }, { status: 404 });
  const prev = entry.materials.video || {};
  // A report for an older request must not overwrite a newer one.
  if (prev.request_id && body.request_id && prev.request_id !== body.request_id) {
    return Response.json({ ok: true, ignored: "stale request" });
  }
  const str = (v, n = 1000) => String(v || "").slice(0, n);
  await saveMaterial("video", entry.topic, {
    status,
    request_id: prev.request_id || str(body.request_id, 80),
    request: prev.request || null,
    requested_at: prev.requested_at || 0,
    video_url: str(body.video_url) || prev.video_url || "",
    page_url: str(body.page_url) || prev.page_url || "",
    duration: Number(body.duration) || prev.duration || 0,
    error: status === "failed" ? str(body.error, 500) || "the workflow reported a failure" : "",
    updated_at: Date.now(),
  });
  return Response.json({ ok: true });
}
