import { Lfor } from "../../../lib/i18n";
import { listCases, archiveCase } from "../../../lib/visa-news/cases";
import { listPending, getPending, putPending, dropPending, cleanEdit } from "../../../lib/visa-news/pending";

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
    if (body.edit && getPending(id)) {
      putPending(id, cleanEdit(body.edit));
      return Response.json({ ok: true });
    }
    return Response.json({ error: "nothing to do" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
