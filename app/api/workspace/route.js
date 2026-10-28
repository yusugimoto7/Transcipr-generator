import { getEntries, getEntry, setStatus, restore, keyOf } from "../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The shared workspace (see lib/workspace.js).
//   GET                -> { entries }  every topic with its status and which
//                         materials exist (light, for the list)
//   GET ?key=<key>     -> { entry }    one topic with its materials in full
//   POST { action: "use" | "archive" | "restore", topic }
//   POST { action: "add", title }      -> a topic added by its title alone (Studio → research)
export async function GET(request) {
  const key = new URL(request.url).searchParams.get("key");
  try {
    if (key) return Response.json({ entry: await getEntry(key) }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ entries: await getEntries() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e), entries: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { action, topic, title } = await request.json();
    if (action === "add") return add(title);
    if (!topic || !keyOf(topic)) return Response.json({ error: "bad request" }, { status: 400 });
    let rec;
    if (action === "use") rec = await setStatus(topic, "active", { pick: true });
    else if (action === "archive") rec = await setStatus(topic, "archived");
    else if (action === "restore") rec = await restore(topic);
    else return Response.json({ error: "unknown action" }, { status: 400 });
    return Response.json({ ok: true, status: rec.status, key: keyOf(topic) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

// A topic the team adds by its title alone, with no research (Hamed, Oct 28 2026): it is listed in
// Studio → research and holds what the team makes for it (their own carousel text…). `manual`
// keeps every writing step from writing from the title alone (lib/grounding.js). A title that is
// already a topic opens that topic and changes nothing.
async function add(raw) {
  const title = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (title.length < 4) return Response.json({ error: "write the topic's title" }, { status: 400 });
  const persian = /[\u0600-\u06FF]/.test(title);
  const topic = { ...(persian ? { title_fa: title } : { title_en: title }), custom: true, researched: true, manual: true, date: new Date().toISOString().slice(0, 10) };
  const have = await getEntry(keyOf(topic)).catch(() => null);
  if (have) return Response.json({ ok: true, exists: true, topic: have.topic || topic });
  await setStatus(topic, "new");
  return Response.json({ ok: true, topic });
}
