// Preview the Instagram story card for a real draw, without posting anything.
//
//   GET /api/draws/story?key=…                 → card for the newest item that has one
//   GET /api/draws/story?key=…&program=alberta-aaip-weekly
//   GET /api/draws/story?key=…&list=1          → which programs currently have a card
//   GET /api/draws/story?key=…&png=1           → render via HCTI and return the PNG URL
//
// The SVG is returned as an image, so opening the URL in a browser shows the
// exact card that would be posted — fonts, Persian layout, logo and all.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { collectAll } from "../../../../lib/draws/sources";
import { buildStorySvg, renderStoryPng, renderEnabled } from "../../../../lib/draws/story";

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

  const wanted = url.searchParams.get("program");
  const asPng = ["1", "true", "yes"].includes(
    (url.searchParams.get("png") || "").toLowerCase()
  );
  const asList = ["1", "true", "yes"].includes(
    (url.searchParams.get("list") || "").toLowerCase()
  );

  let items = [];
  let errors = [];
  try {
    ({ items, errors } = await collectAll({}));
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }

  const withCards = items.filter((i) => i.card && !i.skipInstagram);

  if (asList) {
    return Response.json({
      available: withCards.map((i) => ({
        program: i.program,
        dedupKey: i.dedupKey,
        previewUrl: `/api/draws/story?key=…&program=${encodeURIComponent(i.program)}`,
      })),
      withoutCard: items
        .filter((i) => !i.card || i.skipInstagram)
        .map((i) => ({ program: i.program, reason: "no numbers to show (e.g. a program update)" })),
      sourceErrors: errors,
    });
  }

  const item = wanted
    ? withCards.find((i) => i.program === wanted)
    : withCards[0];

  if (!item) {
    return Response.json(
      {
        error: wanted
          ? `no story card available for program "${wanted}"`
          : "no draw with a story card is available right now",
        available: withCards.map((i) => i.program),
        sourceErrors: errors,
      },
      { status: 404 }
    );
  }

  if (asPng) {
    if (!renderEnabled()) {
      return Response.json(
        { error: "HCTI_USER_ID / HCTI_API_KEY are not set, so the PNG cannot be rendered" },
        { status: 400 }
      );
    }
    try {
      const pngUrl = await renderStoryPng(buildStorySvg(item.card));
      return Response.json({ program: item.program, imageUrl: pngUrl, caption: item.igCaption });
    } catch (e) {
      return Response.json({ error: String(e?.message || e) }, { status: 502 });
    }
  }

  return new Response(buildStorySvg(item.card), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
