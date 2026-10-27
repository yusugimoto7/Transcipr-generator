import { Lfor } from "../../../lib/i18n";
import { startJob, getJobs, publicJob, topicKeyOf, JOB_KINDS } from "../../../lib/jobs";
import { currentUser } from "../../../lib/editing/auth";
import { accessOf, PUBLISH_JOBS } from "../../../lib/editing/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start a background job and return immediately. The work keeps running on the
// server after this response, so the page can be closed or sent to the
// background without stopping it. See lib/jobs.js.
//
//   POST { kind, topic?, article?, fa?, en?, count?, notes?, num?, target?, script?, seconds?, video? }  ->  { job }
export async function POST(request) {
  try {
    const body = await request.json();
    const kind = String(body?.kind || "");
    if (!JOB_KINDS.includes(kind)) {
      return Response.json({ error: "unknown job kind" }, { status: 400 });
    }
    // With one login for the whole app, Telegram and WordPress sends need "publishing".
    if (process.env.APP_LOGIN === "all" && PUBLISH_JOBS.includes(kind.replace(/@en$/, ""))) {
      const user = await currentUser(request).catch(() => null);
      if (!accessOf(user).includes("publishing")) {
        return Response.json({ error: Lfor(request)("حسابت اجازهٔ ارسال به تلگرام یا وردپرس ندارد؛ از حامد بخواه", "your account cannot send to Telegram or WordPress; ask Hamed") }, { status: 403 });
      }
    }
    // Teaching the app a rule changes what everyone's content is made with: the admin's alone.
    if (kind === "learn") {
      const user = await currentUser(request).catch(() => null);
      if (!user || !accessOf(user).includes("learn")) return Response.json({ error: Lfor(request)("یاد دادن قاعده به برنامه نیاز به تیک «یاد دادن به برنامه» در صفحهٔ تیم دارد", "teaching the app a rule needs \"Teach the app\" on the Team page") }, { status: 403 });
      body.by = user.id;
    }
    const needsArticle = kind === "publish" || kind === "docfile";
    if (needsArticle ? !body.article : !(body.topic && (body.topic.title_fa || body.topic.title_en))) {
      return Response.json({ error: "bad request" }, { status: 400 });
    }
    const key = needsArticle
      ? String(body.article.slug || body.article.title_fa || "").toLowerCase()
      : topicKeyOf(body.topic);
    // whoever started it is told on their phone when it is ready (lib/push)
    // (never taken from the page: a page could otherwise send notifications to someone else)
    body.by_uid = (await currentUser(request).catch(() => null))?.id || "";
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
