// The worker endpoint. Point a Render Cron Job (or any pinger) at:
//   POST/GET  https://<your-app>/api/draws/run?key=DRAWS_CRON_SECRET
// every ~15 minutes. Each visit runs one full cycle: check every program for
// new draws, post the new ones to Telegram/X/LinkedIn/Instagram, and refresh
// the WordPress page when the draw data changed.
//
// Dedup makes idle runs harmless, so a missed or repeated ping costs nothing.
//
// Query flags:
//   ?dry=1            collect + report, send nothing
//   ?seed=1           mark current draws as posted WITHOUT sending (run once
//                     before enabling autorun to skip the existing backlog)
//   ?only=alberta,ee  restrict to specific sources (ids from lib/draws/sources)
//   ?wp=0             skip the WordPress page this run
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { runDrawCycle } from "../../../../lib/draws/run";

function authorize(request) {
  const expected = process.env.DRAWS_CRON_SECRET;
  if (!expected) {
    return { ok: false, status: 500, error: "DRAWS_CRON_SECRET is not set" };
  }
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("key") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

async function handle(request) {
  const auth = authorize(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const url = new URL(request.url);
  const dryRun = ["1", "true", "yes"].includes(
    (url.searchParams.get("dry") || "").toLowerCase()
  );
  const seed = ["1", "true", "yes"].includes(
    (url.searchParams.get("seed") || "").toLowerCase()
  );
  const withWordPress = !["0", "false", "no"].includes(
    (url.searchParams.get("wp") || "").toLowerCase()
  );
  const onlyParam = url.searchParams.get("only");
  const only = onlyParam
    ? onlyParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  try {
    const report = await runDrawCycle({ dryRun, seed, only, withWordPress });
    return Response.json(report, { status: report.ok ? 200 : 500 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
