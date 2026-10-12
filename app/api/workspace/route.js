import { getEntries, getEntry, setStatus, restore, keyOf } from "../../../lib/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The shared workspace (see lib/workspace.js).
//   GET                -> { entries }  every topic with its status and which
//                         materials exist (light, for the list)
//   GET ?key=<key>     -> { entry }    one topic with its materials in full
//   POST { action: "use" | "archive" | "restore", topic }
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
    const { action, topic } = await request.json();
    if (!topic || !keyOf(topic)) return Response.json({ error: "bad request" }, { status: 400 });
    let rec;
    if (action === "use") rec = await setStatus(topic, "active");
    else if (action === "archive") rec = await setStatus(topic, "archived");
    else if (action === "restore") rec = await restore(topic);
    else return Response.json({ error: "unknown action" }, { status: 400 });
    return Response.json({ ok: true, status: rec.status, key: keyOf(topic) });
  } catch (e) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
