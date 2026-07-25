// Setup self-check. Tells you what is configured, what is missing, and the
// exact next step — so you never have to hunt through docs.
//
//   GET https://<your-app>/api/draws/status?key=DRAWS_CRON_SECRET
//
// Reports only whether each secret is present, never its value.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { setupStatus } from "../../../../lib/draws/status";

export async function GET(request) {
  const expected = process.env.DRAWS_CRON_SECRET;
  if (!expected) {
    // Nothing is configured yet, so there is no secret to check against.
    // Report the setup state rather than locking the user out of the one
    // endpoint that would tell them what to do.
    return Response.json(setupStatus());
  }
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("key") ||
    (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (provided !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(setupStatus());
}
