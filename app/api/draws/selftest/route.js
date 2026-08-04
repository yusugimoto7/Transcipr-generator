// Proves the duplicate-guard actually works, before anything is published.
//
//   GET /api/draws/selftest?key=DRAWS_CRON_SECRET
//
// Writes a throwaway record to the Google Sheet and reads it back. This is the
// check that would have caught the repeat-posting fault: the Sheet was
// accepting the write and reporting success while never storing anything, so
// every draw looked new again on the next run.
//
// Posting stays blocked until this reports ok:true.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { verifyStore } from "../../../../lib/draws/store";

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

  const store = await verifyStore();

  return Response.json(
    {
      safeToPost: store.ok,
      dedupStore: store,
      telegramTarget:
        process.env.DRAWS_TELEGRAM_CHANNEL_ID ||
        "(not set — draws Telegram posting is off)",
      maxPostsPerRun: Number(process.env.DRAWS_MAX_POSTS_PER_RUN || 3),
      verdict: store.ok
        ? "Duplicate guard confirmed working. Draws can be published safely."
        : "Duplicate guard is NOT working — publishing is blocked until it is fixed.",
    },
    { status: store.ok ? 200 : 503 }
  );
}
