// Read-only preview: shows exactly what the next run would post, and which
// items are already recorded as posted. Sends nothing. Useful for verifying
// parsers and message text before switching the cron on.
//
//   GET https://<your-app>/api/draws/preview?key=DRAWS_CRON_SECRET
//   GET .../preview?key=...&only=alberta
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { previewDrawCycle } from "../../../../lib/draws/run";

export async function GET(request) {
  const expected = process.env.DRAWS_CRON_SECRET;
  if (!expected) {
    return Response.json({ error: "DRAWS_CRON_SECRET is not set" }, { status: 500 });
  }
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("key") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const onlyParam = url.searchParams.get("only");
  const only = onlyParam
    ? onlyParam.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  try {
    const report = await previewDrawCycle({ only });
    return Response.json(report);
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
