// Projects, versions (runs) and corrections of the Video Editing section. Every read goes through
// the signed-in user and canSee: a project is open to the whole team unless its owner or the admin
// narrowed it to chosen people (Hamed, Oct 26 2026), and a project id someone may not see answers
// 403 whatever the URL says. The editing itself is done by the rough-cut worker in
// the english-sugimotovisa repository (lib/editing/store.js dispatch); this file never cuts.

import { get, put, list, update, dispatch, newId, putShot, getWorkText } from "./store";

export const KINDS = { reel: "Reel 9:16", youtube: "YouTube 16:9", course: "Course lesson" };
export const LANGS = { fa: "Farsi", en: "English" };
export const ACTIVE = ["queued", "preparing", "deciding", "rendering", "verifying", "delivering"];

// The stages of a video, each with its own versions, corrections and approval. The work is done by
// the team's skills in english-sugimotovisa: video-rough-cut's method (cut), video-transcribe
// (subtitles), video-motion-graphics (graphics: a storyboard plan with still frames is approved
// first, then rendered). Each later stage starts from the approved cut.
// Names are pairs [Persian, English] (lib/i18n.js), read with L() where drawn.
export const STAGES = { cut: ["برش", "Cut"], dub: ["دوبله", "Dub"], subtitles: ["زیرنویس", "Subtitles"], graphics: ["موشن‌گرافیک", "Motion graphics"] };
export const stageOf = (run) => (run && run.stage) || "cut";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ID = { p: /^p-[a-f0-9]{12}$/, r: /^r-[a-f0-9]{12}$/, c: /^c-[a-f0-9]{12}$/, u: /^u-[a-f0-9]{12}$/ };
export function checkId(kind, v) {
  if (!ID[kind].test(String(v || ""))) throw new HttpError(404, "not found");
  return v;
}

export function isAdmin(u) {
  return u && u.role === "admin";
}

// Who sees a project. Without `access` (every project made before sharing existed) it is the team's.
export function accessOfProject(project) {
  const a = (project && project.access) || {};
  return { team: a.team !== false, members: Array.isArray(a.members) ? a.members : [] };
}

export function canSee(user, project) {
  if (!user || !project) return false;
  if (isAdmin(user) || project.owner_id === user.id) return true;
  const a = accessOfProject(project);
  return a.team || a.members.includes(user.id);
}

// Only the owner and the admin change who sees a project.
export function canShare(user, project) {
  return !!user && !!project && (isAdmin(user) || project.owner_id === user.id);
}

export async function setProjectAccess(user, project, body) {
  if (!canShare(user, project)) throw new HttpError(403, "only the project's owner or Hamed changes who sees it");
  const team = body && body.team !== false;
  const members = team ? [] : [...new Set((Array.isArray(body && body.members) ? body.members : []).filter((x) => ID.u.test(String(x))))].filter((x) => x !== project.owner_id);
  const access = { team, members };
  await update(`projects/${project.id}.json`, (p) => ({ ...p, access, updated_at: Date.now() }), `app: who sees ${project.id}`);
  return access;
}

export async function loadProject(user, id) {
  checkId("p", id);
  const rec = await get(`projects/${id}.json`);
  if (!rec) throw new HttpError(404, "not found");
  if (!canSee(user, rec.data)) throw new HttpError(403, "this project is not shared with you");
  return rec.data;
}

export async function runsOf(projectId) {
  return (await list("runs/")).map((x) => x.data).filter((r) => r.project_id === projectId).sort((a, b) => a.created_at - b.created_at);
}

export async function correctionsOf(runId) {
  // a correction timed only by its screenshot has no out_s until the worker reads it: last
  return (await list(`corrections/${runId}/`)).map((x) => x.data).filter((c) => !c.deleted).sort((a, b) => (a.out_s ?? 1e9) - (b.out_s ?? 1e9));
}

// The approved file of every stage of a project, latest version of each, in stage order: the cut (2 min
// of a 10 min recording), the dub, the subtitled file, the graphics file. Each is its own file in Drive,
// reachable in one click from the card and the project page (Hamed, 26 Oct 2026).
export function approvedFiles(runs) {
  return ORDER.map((stage) => {
    const ok = runs.filter((r) => stageOf(r) === stage && r.status === "approved" && r.delivery && r.delivery.file_id);
    const r = ok.sort((a, b) => b.version - a.version)[0];
    if (!r) return null;
    // the review preview is the shared, playable copy: the picker's thumbnails and player use it
    const pv = (r.result && r.result.preview) || null;
    return { stage, run_id: r.id, version: r.version, file_id: r.delivery.file_id, view: r.delivery.view, folder: r.delivery.folder,
      preview: pv ? { id: pv.id, embed: pv.embed } : null, output_s: r.result && r.result.output_s };
  }).filter(Boolean);
}

export async function listProjects(user, ownerFilter) {
  const projects = (await list("projects/")).map((x) => x.data);
  const all = (await list("runs/")).map((x) => x.data);
  const runs = new Map(all.map((r) => [r.id, r]));
  const byProject = new Map();
  for (const r of all) byProject.set(r.project_id, [...(byProject.get(r.project_id) || []), r]);
  return projects
    .filter((p) => canSee(user, p) && (!ownerFilter || p.owner_id === ownerFilter))
    .map((p) => ({ ...p, latest: runs.get(p.latest_run_id) || null, approved: approvedFiles(byProject.get(p.id) || []) }))
    .sort((a, b) => (b.latest?.updated_at || b.created_at) - (a.latest?.updated_at || a.created_at));
}

// ---- source link ------------------------------------------------------------------------------

export function driveId(url) {
  const u = String(url || "");
  const m = u.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || u.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : "";
}

// The worker downloads Drive files through their /file/d/<id>/ form, so that is what is stored.
export function normaliseSource(url) {
  const u = String(url || "").trim();
  if (!/^https:\/\/\S+$/i.test(u)) throw new HttpError(400, "paste the full https:// link of the video");
  if (/drive\.google\.com|docs\.google\.com/.test(u)) {
    const id = driveId(u);
    if (!id) throw new HttpError(400, "this Drive link does not point to one file; open the video in Drive and copy its link");
    return { url: `https://drive.google.com/file/d/${id}/view`, download: `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t` };
  }
  return { url: u, download: u };
}

// Accept a link only if the worker will be able to download it.
export async function checkSource(download) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(download, { headers: { Range: "bytes=0-1023" }, redirect: "follow", signal: ctrl.signal, cache: "no-store" });
    const type = res.headers.get("content-type") || "";
    const head = new Uint8Array(await res.arrayBuffer()).slice(0, 64);
    const text = new TextDecoder().decode(head).toLowerCase();
    if (!res.ok || type.includes("text/html") || text.includes("<html") || text.includes("<!doctype")) {
      throw new HttpError(400, "the video cannot be downloaded: in Drive, set sharing to \"Anyone with the link\" and try again");
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, "the link did not answer in time; check it opens in a private browser window");
  } finally {
    clearTimeout(timer);
  }
}

// ---- actions ----------------------------------------------------------------------------------

async function startRun(run) {
  await put(`runs/${run.id}.json`, run, null, `app: run ${run.id} queued`);
  try {
    await dispatch(run.id, "run", stageOf(run));
  } catch (e) {
    await update(`runs/${run.id}.json`, (r) => ({ ...r, status: "failed", error: String(e.message || e), updated_at: Date.now() }));
    throw new HttpError(502, String(e.message || e));
  }
}

function newRun(project, user, version, extra = {}) {
  return {
    id: newId("r"),
    project_id: project.id,
    owner_id: project.owner_id,
    version,
    stage: "cut",
    step: "",
    status: "queued",
    stage_note: "waiting for the editing machine",
    requested_by: user.id,
    prev_run_id: null,
    corrections: [],
    created_at: Date.now(),
    updated_at: Date.now(),
    ...extra,
  };
}

// A finished video can start at a later stage (Hamed, Oct 26 2026): subtitles only, or motion
// graphics only, with the settings chosen on the New project page. The worker then takes the
// project's own video as the cut (english-sugimotovisa rough_cut_service.py cmd_stage).
// "dub": a Farsi video dubbed into English or an English one into Farsi, by english-sugimotovisa's
// dub pipeline (Hamed, Oct 26 2026). An approved dub takes the cut's place for the later stages.
const STARTS = ["cut", "dub", "subtitles", "graphics"];
const ORDER = ["cut", "dub", "subtitles", "graphics"];
const int = (v, lo, hi) => {
  const n = Math.round(Number(v) || 0);
  return n ? Math.max(lo, Math.min(hi, n)) : 0;
};
function cleanSettings(raw) {
  const sub = (raw && raw.subtitles) || {};
  const gfx = (raw && raw.graphics) || {};
  const dub = (raw && raw.dub) || {};
  // Pixels on the 1080x1920 (or 1920x1080) frame; 0 keeps the approved style. The worker clamps
  // again to subtitle_style in config/video_stages.json.
  return {
    subtitles: { size: int(sub.size, 40, 110), position_y: int(sub.position_y, 600, 1600), words_per_group: int(sub.words_per_group, 2, 4) },
    graphics: {
      amount: ["light", "normal", "rich"].includes(gfx.amount) ? gfx.amount : "normal",
      brief: String(gfx.brief || "").trim().slice(0, 1000),
      with_subtitles: !!gfx.with_subtitles,
    },
    dub: { to: dub.to === "fa" ? "fa" : "en" },
  };
}

export async function createProject(user, body) {
  const title = String(body.title || "").trim().slice(0, 120);
  if (!title) throw new HttpError(400, "give the project a title");
  const kind = KINDS[body.kind] ? body.kind : "reel";
  const start = STARTS.includes(body.start) ? body.start : "cut";
  if (start !== "cut" && process.env.EDITING_STAGES !== "on") throw new HttpError(409, "subtitles and motion graphics are not switched on yet");
  // "auto": the worker listens for the language; a chosen one is used as is
  const settings = start !== "cut" ? cleanSettings(body.settings) : null;
  // a dub's spoken language is the other one of its direction
  const language_fixed = start === "cut" || start === "dub" || body.language !== "auto";
  const language = start === "dub" ? (settings.dub.to === "fa" ? "en" : "fa") : LANGS[body.language] ? body.language : "fa";
  // From another project's approved file (Hamed, 26 Oct 2026: "use the existing card"): a new project
  // whose video is that file, read by the worker through Drive. The project it came from is kept.
  let src, from = null, source_file_id = "";
  if (body.from && body.from.project_id) {
    const origin = await loadProject(user, body.from.project_id);
    const file = approvedFiles(await runsOf(origin.id)).find((f) => f.run_id === body.from.run_id);
    if (!file) throw new HttpError(400, "that project has no approved file of that stage");
    src = { url: file.view };
    source_file_id = file.file_id;
    from = { project_id: origin.id, title: origin.title, run_id: file.run_id, stage: file.stage, version: file.version };
  } else {
    src = normaliseSource(body.source_url);
    await checkSource(src.download);
  }
  const project = {
    id: newId("p"),
    owner_id: user.id,
    title,
    topic: String(body.topic || "").trim().slice(0, 200),
    source_url: src.url,
    ...(from ? { source_file_id, from } : {}),
    kind,
    language,
    language_fixed,
    start,
    ...(settings ? { settings } : {}),
    wants_subtitles: false, // phase 2
    created_at: Date.now(),
    latest_run_id: "",
    latest_version: 1,
  };
  const run = newRun(project, user, 1, start === "cut" ? {} : { stage: start, step: start === "graphics" ? "plan" : "" });
  project.latest_run_id = run.id;
  await put(`projects/${project.id}.json`, project, null, `app: project ${project.id}`);
  await startRun(run);
  return project;
}

export function parseOut(v) {
  const s = String(v || "").trim();
  const m = s.match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  if (!m) throw new HttpError(400, "write the time as seconds (109) or minutes:seconds (1:49)");
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
}

async function latestRun(project) {
  const rec = await get(`runs/${project.latest_run_id}.json`);
  if (!rec) throw new HttpError(404, "this project has no version yet");
  return rec.data;
}

export async function addCorrection(user, project, body) {
  const run = await latestRun(project);
  if (body.run_id && body.run_id !== run.id) throw new HttpError(409, "a newer version exists; reload the page");
  if (run.status !== "review") throw new HttpError(409, "corrections can be added while the latest version is waiting for review");
  const shots = shotsFrom(body.images);
  // a note on the whole video has no second; otherwise, with a screenshot the time may be left out:
  // the worker reads it from the player in the picture
  const general = !!body.general;
  const hasOut = !general && String(body.out || "").trim() !== "";
  if (!general && !hasOut && !shots.length) throw new HttpError(400, "write the second, or add a screenshot that shows the player's time");
  const out_s = hasOut ? parseOut(body.out) : null;
  const dur = run.result && run.result.output_s;
  if (hasOut && dur && out_s > dur + 0.5) throw new HttpError(400, `this version is only ${Math.floor(dur / 60)}:${String(Math.round(dur % 60)).padStart(2, "0")} long`);
  const note = String(body.note || "").trim().slice(0, 500);
  if (!note && !shots.length) throw new HttpError(400, "say what is wrong at that moment");
  const c = { id: newId("c"), run_id: run.id, project_id: project.id, author_id: user.id, out: hasOut ? String(body.out).trim() : "", out_s, note, general, created_at: Date.now() };
  c.images = [];
  for (const [i, buf] of shots.entries()) {
    const p = `shots/${c.id}-${i + 1}.jpg`;
    await putShot(p, buf, `app: screenshot for ${c.id}`);
    c.images.push(p);
  }
  await put(`corrections/${run.id}/${c.id}.json`, c, null, `app: correction on ${run.id}`);
  return c;
}

// ---- subtitle editor -----------------------------------------------------------------------------
// The lines of a subtitles version, each with its time (Hamed, 27 Oct 2026: "an editor for
// transcripts"; Farhad could not fix one wrong word). The worker returns them as result.lines;
// versions made before that are read from its work files. A changed line is a correction that
// carries the line, the text it had and the new text: the worker writes it exactly as typed
// (english-sugimotovisa video_stages.line_edits), so a typo is fixed without a model guessing.

const sameText = (a, b) => String(a || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim() === String(b || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
const clock = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

export async function subtitleLines(project, runId) {
  checkId("r", runId);
  const rec = await get(`runs/${runId}.json`);
  if (!rec || rec.data.project_id !== project.id) throw new HttpError(404, "not found");
  if (stageOf(rec.data) !== "subtitles") return [];
  const r = rec.data.result || {};
  if (Array.isArray(r.lines) && r.lines.length) return r.lines;
  const [txt, isl] = await Promise.all([getWorkText(`runs/${runId}/work/sub/corrected.txt`), getWorkText(`runs/${runId}/work/sub/cut_islands.json`)]);
  if (!txt || !isl) return [];
  let times = [];
  try {
    times = JSON.parse(isl);
  } catch (_) {}
  // older versions hold the no-break space written out as six characters
  const lines = txt.split("\n").filter((l) => l.trim()).map((l) => l.replace(/\\u00a0/gi, "\u00a0"));
  return lines.map((text, i) => ({ n: i + 1, start: times[i] ? Math.round(times[i].start * 100) / 100 : null, end: times[i] ? Math.round(times[i].end * 100) / 100 : null, text }));
}

// edits: [{ line, text }]. A line typed back to what it was drops its earlier edit.
export async function editSubtitleLines(user, project, body) {
  const run = await latestRun(project);
  if (body.run_id && body.run_id !== run.id) throw new HttpError(409, "a newer version exists; reload the page");
  if (run.status !== "review" || stageOf(run) !== "subtitles") throw new HttpError(409, "subtitle lines can be changed while a subtitles version is waiting for review");
  const lines = await subtitleLines(project, run.id);
  if (!lines.length) throw new HttpError(409, "this version's subtitle lines could not be read");
  const edits = Array.isArray(body.edits) ? body.edits.slice(0, 500) : [];
  const open = (await correctionsOf(run.id)).filter((c) => c.line);
  let added = 0, removed = 0;
  for (const e of edits) {
    const line = lines.find((l) => l.n === Number(e.line));
    if (!line) throw new HttpError(400, `there is no line ${e.line}`);
    const text = String(e.text || "").replace(/[\r\n]+/g, " ").replace(/[ \t]+/g, " ").trim().slice(0, 400);
    if (!text) throw new HttpError(400, `line ${line.n} cannot be empty: every line stays, so write what is said there`);
    for (const c of open.filter((c) => c.line === line.n)) {
      const rec = await get(`corrections/${run.id}/${c.id}.json`);
      if (rec) await put(`corrections/${run.id}/${c.id}.json`, { ...rec.data, deleted: true, deleted_by: user.id }, rec.sha, `app: subtitle line ${line.n} edited again`);
      removed++;
    }
    if (sameText(text, line.text)) continue;
    const t = line.start || 0;
    const c = { id: newId("c"), run_id: run.id, project_id: project.id, author_id: user.id, out: clock(t), out_s: t,
      note: `«${line.text.replace(/\u00a0/g, " ")}» → «${text}»`, general: false, images: [], line: line.n, before: line.text, text, created_at: Date.now() };
    await put(`corrections/${run.id}/${c.id}.json`, c, null, `app: subtitle line ${line.n} on ${run.id}`);
    added++;
  }
  return { added, removed };
}

// Up to 3 screenshots per correction, sent as JPEG data URLs (the page shrinks them to 1600 px first).
const MAX_SHOTS = 3;
const MAX_SHOT_BYTES = 1.5 * 1024 * 1024;
function shotsFrom(images) {
  const list = Array.isArray(images) ? images.slice(0, MAX_SHOTS + 1) : [];
  if (list.length > MAX_SHOTS) throw new HttpError(400, `at most ${MAX_SHOTS} screenshots per correction`);
  return list.map((u) => {
    const m = String(u || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new HttpError(400, "a screenshot could not be read; try another picture");
    const buf = Buffer.from(m[1], "base64");
    if (buf.length > MAX_SHOT_BYTES || buf[0] !== 0xff || buf[1] !== 0xd8) throw new HttpError(400, "a screenshot is too large or not a picture");
    return buf;
  });
}

// A screenshot belongs to a correction of this project (the caller loaded the project for the user).
export async function shotOf(project, name) {
  const m = String(name || "").match(/^(c-[a-f0-9]{12})-[1-9]\.jpg$/);
  if (!m) throw new HttpError(404, "not found");
  const path = `shots/${name}`;
  for (const r of await runsOf(project.id)) {
    const inRun = (r.corrections || []).some((c) => (c.images || []).includes(path));
    const open = inRun || (await correctionsOf(r.id)).some((c) => (c.images || []).includes(path));
    if (open) return path;
  }
  throw new HttpError(404, "not found");
}

export async function deleteCorrection(user, project, runId, cid) {
  checkId("r", runId);
  checkId("c", cid);
  const rec = await get(`corrections/${runId}/${cid}.json`);
  if (!rec || rec.data.project_id !== project.id) throw new HttpError(404, "not found");
  if (!isAdmin(user) && rec.data.author_id !== user.id) throw new HttpError(403, "only its author can remove a correction");
  const run = await latestRun(project);
  if (run.id !== runId || run.status !== "review") throw new HttpError(409, "this version is no longer being reviewed");
  await put(rec.path || `corrections/${runId}/${cid}.json`, { ...rec.data, deleted: true, deleted_by: user.id }, rec.sha);
}

// New version: the corrections on the version under review, or a retry of a failed one.
export async function rerun(user, project) {
  const run = await latestRun(project);
  let extra;
  if (run.status === "review") {
    const corr = await correctionsOf(run.id);
    if (!corr.length) throw new HttpError(400, "add at least one correction first");
    extra = {
      prev_run_id: run.id,
      corrections: corr.map((c) => ({ id: c.id, out: c.out, out_s: c.out_s, note: c.note, author_id: c.author_id, images: c.images || [], general: !!c.general, ...(c.line ? { line: c.line, before: c.before, text: c.text } : {}) })),
    };
    // corrections on a rendered graphics version change the storyboard first: a new plan to approve
    if (stageOf(run) !== "cut") extra = { ...extra, stage: stageOf(run), step: stageOf(run) === "graphics" ? "plan" : "" };
  } else if (run.status === "failed") {
    extra = { prev_run_id: run.prev_run_id || null, corrections: run.corrections || [], retry_of: run.id, stage: stageOf(run), step: run.step || "", plan_run_id: run.plan_run_id || null };
  } else {
    throw new HttpError(409, "the latest version is still being made or is already approved");
  }
  const next = newRun(project, user, run.version + 1, extra);
  await update(`projects/${project.id}.json`, (p) => {
    if (p.latest_run_id !== run.id) throw new HttpError(409, "a newer version was just started; reload the page");
    return { ...p, latest_run_id: next.id, latest_version: next.version };
  });
  await startRun(next);
  return next;
}

// The next stage, from the latest version once it is approved: subtitles after the cut, motion
// graphics after the cut or the subtitles.
export function nextStages(runs, project) {
  // EDITING_STAGES=on once english-sugimotovisa's worker knows the stages (video_stages.py); an older
  // worker would read a subtitles run as a cut and cut the raw footage again
  if (process.env.EDITING_STAGES !== "on") return [];
  const latest = runs.find((r) => r.id === project.latest_run_id);
  if (!latest || latest.status !== "approved") return [];
  // A project that started at a later stage never had the stages before it, and needs none.
  const skipped = (st) => ORDER.indexOf(st) < ORDER.indexOf(project.start || "cut");
  const done = (st) => skipped(st) || runs.some((r) => stageOf(r) === st && r.status === "approved" && r.delivery);
  // a dub project's first stage is the dub, which is not skipped by having no cut
  if (!done("cut") || (project.start === "dub" && !done("dub"))) return [];
  return ["subtitles", "graphics"].filter((st) => !done(st) && !(st === "subtitles" && done("graphics")));
}

export async function startStage(user, project, stage) {
  if (!["subtitles", "graphics"].includes(stage)) throw new HttpError(400, "unknown stage");
  const runs = await runsOf(project.id);
  if (!nextStages(runs, project).includes(stage)) throw new HttpError(409, "this step can start once the version before it is approved");
  const version = 1 + Math.max(0, ...runs.filter((r) => stageOf(r) === stage).map((r) => r.version));
  const next = newRun(project, user, version, { stage, step: stage === "graphics" ? "plan" : "" });
  await update(`projects/${project.id}.json`, (p) => {
    if (p.latest_run_id !== project.latest_run_id) throw new HttpError(409, "a newer version was just started; reload the page");
    return { ...p, latest_run_id: next.id, latest_version: next.version };
  });
  await startRun(next);
  return next;
}

export function canApprove(user, project, owner) {
  if (isAdmin(user)) return true;
  return project.owner_id === user.id && !!(owner && owner.may_approve_own) && !!user.may_approve_own;
}

// Approval needs the latest version in review: the review step cannot be skipped. The worker then
// moves the full file to Drive. Nothing is posted anywhere from this section.
export async function approve(user, project, runId, owner) {
  if (!canApprove(user, project, owner)) throw new HttpError(403, "Hamed approves this project");
  const run = await latestRun(project);
  if (run.id !== runId) throw new HttpError(409, "only the latest version can be approved");
  if (run.status !== "review") throw new HttpError(409, "this version is not waiting for review");
  if (run.step === "plan") return approvePlan(user, project, run);
  if (!run.result || !run.result.full) throw new HttpError(409, "this version has no full-quality file on Drive; connect Drive and make a new version");
  await update(`runs/${run.id}.json`, (r) => {
    if (r.status !== "review") throw new HttpError(409, "this version changed; reload the page");
    return { ...r, status: "delivering", stage_note: "copying the full-quality file to Drive", approval: { by: user.id, at: Date.now() }, error: "", updated_at: Date.now() };
  }, `app: approve ${run.id}`);
  try {
    await dispatch(run.id, "deliver");
  } catch (e) {
    await update(`runs/${run.id}.json`, (r) => ({ ...r, status: "review", approval: null, error: String(e.message || e), updated_at: Date.now() }));
    throw new HttpError(502, String(e.message || e));
  }
}

// An approved graphics plan is rendered as it was shown (the storyboard the stills were drawn from).
async function approvePlan(user, project, plan) {
  await update(`runs/${plan.id}.json`, (r) => {
    if (r.status !== "review") throw new HttpError(409, "this version changed; reload the page");
    return { ...r, status: "approved", stage_note: "", approval: { by: user.id, at: Date.now() }, updated_at: Date.now() };
  }, `app: approve plan ${plan.id}`);
  const render = newRun(project, user, plan.version, { stage: "graphics", step: "render", plan_run_id: plan.id, prev_run_id: plan.id });
  await update(`projects/${project.id}.json`, (p) => ({ ...p, latest_run_id: render.id, latest_version: render.version }));
  await startRun(render);
}
