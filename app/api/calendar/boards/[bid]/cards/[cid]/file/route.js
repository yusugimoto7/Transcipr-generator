import { Lfor } from "../../../../../../../../lib/i18n";
import { guard, json } from "../../../../../../../../lib/editing/auth";
import { getBoard, checkId, mediaItems } from "../../../../../../../../lib/calendar/model";
import { openMedia } from "../../../../../../../../lib/calendar/media";
import { effectiveCaption, CHANNELS } from "../../../../../../../../lib/calendar/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" };

function slug(t) {
  const s = String(t || "post").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return s || "post";
}

// The finished post, for taking it somewhere by hand: ?i=<n> is file n of the card, ?caption=1 the
// words. Same sign-in as the board; nothing is sent to any network from here.
export async function GET(request, { params }) {
  const g = await guard(request);
  if (g.res) return g.res;
  try {
    const q = new URL(request.url).searchParams;
    const b = await getBoard(params.bid);
    const card = b.cards.find((c) => c.id === checkId(params.cid));
    if (!card) return json({ error: Lfor(request)("این کارت بایگانی یا حذف شده است", "this card was archived or removed") }, 404);
    const base = slug(card.title);
    if (q.get("caption")) {
      const on = Object.keys(CHANNELS).filter((k) => card.channels[k] && card.channels[k].on);
      const texts = on.map((k) => [CHANNELS[k].name, effectiveCaption(card, k)]);
      const distinct = new Set(texts.map((t) => t[1]));
      const body = !texts.length ? card.caption || "" : distinct.size === 1 ? texts[0][1] : texts.map(([n, t]) => `${n}\n${"-".repeat(n.length)}\n${t}`).join("\n\n");
      return new Response("﻿" + body + "\n", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="caption.txt"; filename*=UTF-8''${encodeURIComponent(base)}%20-%20caption.txt`,
          "Cache-Control": "no-store",
        },
      });
    }
    const items = mediaItems(card.media);
    const i = Math.max(0, Math.floor(Number(q.get("i")) || 0));
    const item = items[i];
    if (!item) return json({ error: Lfor(request)("این پست چنین فایلی ندارد", "this post has no such file") }, 404);
    const res = await openMedia(item.url);
    const type = (res.headers.get("content-type") || "").split(";")[0];
    const ext = EXT[type] || (item.kind === "image" ? "jpg" : "mp4");
    const name = `${base}${items.length > 1 ? ` ${i + 1}` : ""}.${ext}`;
    const headers = {
      "Content-Type": type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="file.${ext}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    };
    if (res.headers.get("content-length")) headers["Content-Length"] = res.headers.get("content-length");
    return new Response(res.body, { headers });
  } catch (e) {
    return json({ error: String(e.message || e).slice(0, 300) }, e.status || 502);
  }
}
