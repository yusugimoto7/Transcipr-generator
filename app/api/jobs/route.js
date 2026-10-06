import { startJob, getJobs, publicJob, topicKeyOf, JOB_KINDS } from "../../../lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start a background job and return immediately. The work keeps running on the
// server after this response, so the page can be closed or sent to the
// background without stopping it. See lib/jobs.js.
//
//   POST { kind, topic?, article?, fa?, en? }  ->  { job }
export async function POST(request) {
  try {
    const body = await request.json();
    const kind = String(body?.kind || "");
    if (!JOB_KINDS.includes(kind)) {
      return Response.json({ error: "unknown job kind" }, { status: 400 });
    }
    const needsArticle = kind === "publish" || kind === "docfile";
    if (needsArticle ? !body.article : !(body.topic && (body.topic.title_fa || body.topic.title_en))) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    const key = needsArticle
      ? String(body.article.slug || body.article.title_fa || "").toLowerCase()
      : topicKeyOf(body.topic);
    const job = startJob(kind, key, body);
    return Response.json({ job: publicJob(job) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// Check on jobs:  GET /api/jobs?ids=a,b,c  ->  { jobs, missing }
// `missing` are ids the server no longer knows (it restarted, or they expired).
export async function GET(request) {
  const ids = (new URL(request.url).searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  return Response.json(getJobs(ids), { headers: { "Cache-Control": "no-store" } });
}
