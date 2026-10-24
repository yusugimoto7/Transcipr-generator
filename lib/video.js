// English video, made by the team's n8n workflow ("Topic Engine: English
// video", which renders the presenter's HeyGen digital twin). Nothing here runs
// until VIDEO_WORKFLOW_URL (the workflow's webhook,
// https://n8n.sugimotogroup.org/webhook/topic-engine-video) is set; until then
// the page shows the option as "not connected".
//
// Contract, so the workflow and this app can be changed independently. The app
// POSTs JSON:
//   { version: 2, request_id, topic_key,
//     topic: { title_en, title_fa, field, page, source_url, why_now, date },
//     script_en,            // the final script, as edited on the page
//     duration_sec,         // the length asked for
//     notes,                // free notes for the video
//     benchmark: { url, kind },   // reference video: google_drive | heygen | youtube | instagram | other
//     format: { aspect_ratio: "9:16" | "16:9" | "1:1", captions: boolean },
//     voice: "primary" | "secondary",
//     look_id,              // the HeyGen look to render in (lib/video-looks.js), chosen on the sheet
//     callback_url,         // where the workflow reports back (see below)
//     requested_at }
// with the header  Authorization: Bearer <VIDEO_WORKFLOW_SECRET>  when the
// secret is set. The workflow answers at once with any JSON (e.g. { status })
// and later POSTs progress to callback_url, with the same bearer header:
//   { request_id, topic_key, status: "rendering" | "done" | "failed",
//     video_url?, page_url?, duration?, error? }
// Each report is saved with the topic as its "video" material, for the team.

import { DEFAULT_LOOK, isLook } from "./video-looks.js";

export function videoWorkflowEnabled() {
  return !!process.env.VIDEO_WORKFLOW_URL;
}

export const DURATIONS = [30, 45, 60, 90, 120, 150, 180];
export const MAX_DURATION = 600;

// What kind of link the benchmark video is, so the workflow can fetch it the
// right way (a Drive file and a HeyGen video are downloaded differently).
export function benchmarkKind(url) {
  const u = String(url || "").toLowerCase();
  if (!u) return "";
  if (/drive\.google\.com|docs\.google\.com/.test(u)) return "google_drive";
  if (/heygen\.com/.test(u)) return "heygen";
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/instagram\.com/.test(u)) return "instagram";
  return "other";
}

function appUrl() {
  const u = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "";
  return u.replace(/\/+$/, "");
}

// Validates and normalises what the page sent. Throws with a message the page
// can show.
export function videoRequestFrom(body) {
  const script = String(body.script_en || "").trim();
  if (script.length < 40) throw new Error("the script is empty or too short");
  const duration = Math.round(Number(body.duration_sec) || 0);
  if (duration < 10 || duration > MAX_DURATION) throw new Error("choose a length between 10 seconds and 10 minutes");
  const bench = String(body.benchmark_url || "").trim();
  if (bench && !/^https?:\/\/\S+$/i.test(bench)) throw new Error("the benchmark link must be a full https:// link");
  const ratio = ["9:16", "16:9", "1:1"].includes(body.aspect_ratio) ? body.aspect_ratio : "9:16";
  return {
    script_en: script.slice(0, 12000),
    duration_sec: duration,
    notes: String(body.notes || "").trim().slice(0, 2000),
    benchmark: { url: bench, kind: benchmarkKind(bench) },
    format: { aspect_ratio: ratio, captions: body.captions !== false },
    voice: body.voice === "secondary" ? "secondary" : "primary",
    look_id: isLook(body.look_id) ? body.look_id : DEFAULT_LOOK,
  };
}

export async function requestVideo(topic, topicKey, req) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.VIDEO_WORKFLOW_SECRET) headers.Authorization = "Bearer " + process.env.VIDEO_WORKFLOW_SECRET;
  const requestId = globalThis.crypto.randomUUID();
  const base = appUrl();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(process.env.VIDEO_WORKFLOW_URL, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        version: 2,
        request_id: requestId,
        topic_key: topicKey,
        topic: {
          title_en: topic.title_en || "",
          title_fa: topic.title_fa || "",
          field: topic.field || "",
          page: topic.page || "",
          source_url: topic.source_url || "",
          why_now: topic.why_now || "",
          date: topic.date || "",
        },
        ...req,
        callback_url: base ? base + "/api/video/callback" : "",
        requested_at: new Date().toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error("video workflow: HTTP " + res.status + (data.error ? " " + data.error : data.message ? " " + data.message : ""));
    return { request_id: requestId, response: data };
  } finally {
    clearTimeout(timer);
  }
}

export function callbackAuthorized(request) {
  const secret = process.env.VIDEO_WORKFLOW_SECRET;
  if (!secret) return false; // without a shared secret anyone could write results
  return (request.headers.get("authorization") || "") === "Bearer " + secret;
}
