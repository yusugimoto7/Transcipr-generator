// Lightweight, instant endpoint with no Claude call. Point an external
// pinger (Render Cron Job, UptimeRobot, cron-job.org, etc.) at this URL
// every ~10-14 minutes on free hosting tiers — any HTTP request resets the
// platform's inactivity timer, so the process (and the in-memory topic
// cache in /api/topics) stays warm instead of restarting between visits.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ ok: true, time: new Date().toISOString() });
}
