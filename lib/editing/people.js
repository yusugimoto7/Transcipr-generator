// The people who speak in dubbed videos (Hamed, 28 Oct 2026: the border-officer series, where each actor
// must keep one voice across every video). A person is cast/<id>.json on editing-data: a name, the HeyGen
// voice they always get, and the voice prints the worker (english-sugimotovisa, dub_speakers.py) takes
// from every video they were named in, so the next video recognises them by voice. Hamed is always in
// the list with the approved voice ("hamed"); the worker creates his record on the first dub.
import { HttpError } from "./projects";
import { get, list, put, newId, getRepoFile, getWorkText } from "./store";

export const HAMED = { id: "hamed", name: "Hamed", voice_id: "hamed" };

// The voices a person can have: Hamed's approved voice, and the HeyGen public voices of the worker's
// catalogue (config/video_process.json on main; never a copy here).
export async function voiceCatalogue() {
  const text = await getRepoFile("config/video_process.json");
  if (!text) throw new HttpError(502, "config/video_process.json was not found on main");
  const cfg = JSON.parse(text);
  const other = (cfg.speakers || {}).other_voices || {};
  const pick = (g) => (other[g] || []).map((v) => ({ voice_id: v.voice_id, name: v.name, gender: g }));
  return { hamed: { voice_id: "hamed", name: cfg.voice_name || "Hamed" }, max: (cfg.speakers || {}).max || 4, female: pick("female"), male: pick("male") };
}

function publicPerson(p) {
  return {
    id: p.id,
    name: p.name,
    voice_id: p.voice_id,
    voice_name: p.voice_name || "",
    gender: p.gender || "",
    prints: (p.prints || []).length,
    created_at: p.created_at || 0,
  };
}

export async function listPeople() {
  const rows = (await list("cast/")).map((x) => x.data);
  const out = rows.map(publicPerson);
  if (!out.some((p) => p.id === "hamed")) out.unshift({ ...HAMED, voice_name: "", gender: "male", prints: 0, created_at: 0 });
  out.sort((a, b) => (a.id === "hamed" ? -1 : b.id === "hamed" ? 1 : a.name.localeCompare(b.name)));
  return out;
}

// A new person: a name and a voice from the catalogue. With run_id + speaker, the voice print the worker
// took of that speaker in that version comes along (runs/<id>/work/speakers.json), so the person is
// recognised from the next version on; without it, the first video they are cast in gives the print.
export async function createPerson(user, body) {
  const name = String(body.name || "").trim().slice(0, 40);
  if (!name) throw new HttpError(400, "give the person a name");
  const cat = await voiceCatalogue();
  const voice = [...cat.female, ...cat.male].find((v) => v.voice_id === String(body.voice_id || ""));
  if (!voice) throw new HttpError(400, "choose one of the voices");
  const prints = [];
  if (body.run_id && body.speaker) {
    if (!/^r-[a-f0-9]{12}$/.test(String(body.run_id))) throw new HttpError(400, "bad run");
    const text = await getWorkText(`runs/${body.run_id}/work/speakers.json`);
    const sp = text ? JSON.parse(text) : null;
    const s = sp && (sp.speakers || []).find((x) => x.id === Number(body.speaker));
    if (!s || !s.print) throw new HttpError(400, "that version has no voice print of that speaker");
    const run = await get(`runs/${body.run_id}.json`);
    prints.push({ vec: s.print, run_id: body.run_id, project_id: run ? run.data.project_id : "", seconds: s.seconds, at: Date.now() });
  }
  const person = { id: newId("pe"), name, voice_id: voice.voice_id, voice_name: voice.name, gender: voice.gender, prints, created_at: Date.now(), created_by: user.id };
  await put(`cast/${person.id}.json`, person, null, `app: person ${person.id}`);
  return publicPerson(person);
}
