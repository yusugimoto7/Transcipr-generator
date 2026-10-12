// English video, made by an external workflow (the team's Anthropic-based
// video pipeline, to be connected later). Nothing here runs until
// VIDEO_WORKFLOW_URL is set; until then the page shows the option as
// "coming soon".
//
// Contract, so the workflow can be built against it: a POST with JSON
//   { topic: { title_en, title_fa, field, page, source_url, why_now, date },
//     script_en, script_fa, requested_at }
// and, when VIDEO_WORKFLOW_SECRET is set, the header
//   Authorization: Bearer <VIDEO_WORKFLOW_SECRET>
// The workflow answers with any JSON (e.g. { id, status, url }); it is saved
// with the topic as its "video" material.

export function videoWorkflowEnabled() {
  return !!process.env.VIDEO_WORKFLOW_URL;
}

export async function requestVideo(topic, script) {
  const headers = { "Content-Type": "application/json" };
  if (process.env.VIDEO_WORKFLOW_SECRET) headers.Authorization = "Bearer " + process.env.VIDEO_WORKFLOW_SECRET;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(process.env.VIDEO_WORKFLOW_URL, {
      method: "POST",
      headers,
      signal: ctrl.signal,
      body: JSON.stringify({
        topic: {
          title_en: topic.title_en || "",
          title_fa: topic.title_fa || "",
          field: topic.field || "",
          page: topic.page || "",
          source_url: topic.source_url || "",
          why_now: topic.why_now || "",
          date: topic.date || "",
        },
        script_en: script.script_en || "",
        script_fa: script.script_fa || "",
        requested_at: new Date().toISOString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error("video workflow: HTTP " + res.status + (data.error ? " " + data.error : ""));
    return data;
  } finally {
    clearTimeout(timer);
  }
}
