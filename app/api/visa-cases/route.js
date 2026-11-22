import { Lfor } from "../../../lib/i18n";
import { listCases, archiveCase } from "../../../lib/visa-news/cases";
import { listPending, getPending, putPending, dropPending, cleanEdit } from "../../../lib/visa-news/pending";
import { cleanVisaImages } from "../../../lib/visa-news/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^vc-[a-z0-9]{6,24}$/;

// Studio's visa-result cases.
//   GET            -> { cases: saved, pending: being worked on (no pictures) }
//   GET ?id=<id>   -> { case } with its pictures, when it is still being worked on
//   POST { id, edit }      -> keep the page's checks / text / design on a case being worked on
//   POST { id, archive }   -> take a case off the list (a case being worked on is let go)
export async function GET(request) {
  const id = new URL(request.url).searchParams.get("id") || "";
  try {
    if (id) {
      const c = ID_RE.test(id) ? getPending(id) : null;
      // ?held=1: only whether the server still holds it (the page asks before a step that needs it)
      if (c && new URL(request.url).searchParams.get("held")) return Response.json({ held: true }, { headers: { "Cache-Control": "no-store" } });
      return c ? Response.json({ case: c }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: Lfor(request)("این پرونده دیگر روی سرور نیست", "this case is no longer on the server") }, { status: 404 });
    }
    return Response.json({ cases: await listCases(), pending: listPending() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ cases: [], pending: [], error: String(e?.message || e) }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const id = String((body && body.id) || "");
    if (!ID_RE.test(id)) return Response.json({ error: "bad id" }, { status: 400 });
    if (body.archive) {
      if (getPending(id)) dropPending(id);
      else await archiveCase(id);
      return Response.json({ ok: true });
    }
    // A case this server lost (a restart) put back from the page's own device copy (app/visa-device.js):
    // the same pictures the person uploaded, held in memory again, never written anywhere.
    if (body.restore && typeof body.restore === "object") {
      const held = getPending(id);
      if (held && held.images && held.images.length) return Response.json({ case: held });
      const r = body.restore;
      const images = cleanVisaImages(r.images);
      if (!images.length) return Response.json({ error: "no pictures to restore" }, { status: 400 });
      const c = putPending(id, {
        status: "ready",
        progress: "",
        created: Number(r.created) || Date.now(),
        notes: String(r.notes || "").slice(0, 3000),
        images,
        kinds: (Array.isArray(r.kinds) ? r.kinds : []).slice(0, 10).map(String),
        ...cleanEdit(r),
      });
      return Response.json({ case: c });
    }
    if (body.edit && getPending(id)) {
      putPending(id, cleanEdit(body.edit));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "nothing to do" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
