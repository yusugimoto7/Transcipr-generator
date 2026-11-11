import { getEntries, getEntry, setStatus, restore, keyOf, setFlag } from "../../../lib/workspace";
import { currentUser, allUsers } from "../../../lib/editing/auth";
import { accessOf } from "../../../lib/editing/access";
import { notifyLater } from "../../../lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The shared workspace (see lib/workspace.js).
//   GET                -> { entries }  every topic with its status and which
//                         materials exist (light, for the list)
//   GET ?key=<key>     -> { entry }    one topic with its materials in full
//   POST { action: "use" | "archive" | "restore", topic }
//   POST { action: "add", title }      -> a topic added by its title alone (Studio → research)
//   POST { action: "flag", topic, on, to: [user ids], note } -> mark a topic for the team (or take
//                         the mark off); the people it is for get a notification
//   GET ?team=1        -> { people }   who works on topics, for choosing whom a mark is for
export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const key = q.get("key");
  try {
    if (q.get("team")) return Response.json({ people: await topicPeople() }, { headers: { "Cache-Control": "no-store" } });
    if (key) return Response.json({ entry: await getEntry(key) }, { headers: { "Cache-Control": "no-store" } });
    return Response.json({ entries: await getEntries() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: String(e?.message || e), entries: [] }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, topic, title } = body;
    if (action === "add") return add(title);
    if (action === "flag") return flag(request, body);
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

// Everyone who works on topics (the admin, and members with Topic Engine access).
async function topicPeople() {
  return (await allUsers().catch(() => []))
    .filter((u) => u && u.active !== false && accessOf(u).includes("topics"))
    .map((u) => ({ id: u.id, name: u.name || u.email || u.id }));
}

async function flag(request, { topic, on = true, to = [], note = "" }) {
  if (!topic || !keyOf(topic)) return Response.json({ error: "bad request" }, { status: 400 });
  const me = await currentUser(request).catch(() => null);
  const people = await topicPeople();
  const chosen = (Array.isArray(to) ? to : []).filter((id) => people.some((p) => p.id === id));
  const names = chosen.map((id) => people.find((p) => p.id === id).name);
  const rec = await setFlag(topic, { on, by: (me && me.id) || "", by_name: (me && me.name) || "", to: chosen, to_names: names, note });
  if (on) {
    // the people it is for, or the whole team; never the one who marked it
    const who = (chosen.length ? chosen : people.map((p) => p.id)).filter((id) => !me || id !== me.id);
    const title = topic.title_fa || topic.title_en || "";
    const by = (me && me.name) || "";
    const n = String(note || "").trim();
    notifyLater(who, {
      title: [`📌 ${by || "یک نفر"} این موضوع رو برای کار علامت زد`, `📌 ${by || "Someone"} marked a topic to work on`],
      body: [[title, n].filter(Boolean).join("\n"), [title, n].filter(Boolean).join("\n")],
      url: "/?t=" + encodeURIComponent(keyOf(topic)),
      tag: "flag-" + keyOf(topic),
    }, { except: (me && me.id) || "" });
  }
  return Response.json({ ok: true, key: keyOf(topic), flag: on ? { on: true, by: rec.by, by_name: rec.by_name, to: rec.to, to_names: rec.to_names, note: rec.note, at: rec.ts } : null });
}

// A topic the team adds by its title alone, with no research (Hamed, Oct 28 2026): it is listed in
// Studio → research and holds what the team makes for it (their own carousel text…). `manual`
// keeps every writing step from writing from the title alone (lib/grounding.js). A title that is
// already a topic opens that topic and changes nothing.
async function add(raw) {
  const title = String(raw || "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (title.length < 4) return Response.json({ error: "write the topic's title" }, { status: 400 });
  const persian = /[\u0600-\u06FF]/.test(title);
  // a pasted link is the topic's source, so its words are read rather than its address written about
  const link = (title.match(/https?:\/\/[^\s<>"']+/) || [])[0] || "";
  const topic = { ...(persian ? { title_fa: title } : { title_en: title }), custom: true, researched: true, manual: true, date: new Date().toISOString().slice(0, 10), ...(link ? { source_url: link } : {}) };
  const have = await getEntry(keyOf(topic)).catch(() => null);
  if (have) return Response.json({ ok: true, exists: true, topic: have.topic || topic });
  await setStatus(topic, "new");
  return Response.json({ ok: true, topic });
}
