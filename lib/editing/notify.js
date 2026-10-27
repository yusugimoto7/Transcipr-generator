// Video Editing on the team's phones (lib/push). The versions are made by the worker in
// english-sugimotovisa, which tells this app each time a run changes; the app reads the run itself
// from the data branch (so the call needs no secret: it can only make the app look) and sends one
// notification per run and state, remembered as notified/<run id>-<state>.json.

import { get, put, refresh, ConflictError } from "./store";
import { notify } from "../push";
import { canSee, stageOf, checkId } from "./projects";
import { accessOf } from "./access";

const STAGE = { cut: ["برش", "Cut"], dub: ["دوبله", "Dub"], subtitles: ["زیرنویس", "Subtitles"], graphics: ["موشن‌گرافیک", "Motion graphics"] };
const WORTH = ["review", "failed", "approved"];

function versionName(run, i) {
  const st = stageOf(run);
  if (st === "graphics" && run.step === "plan") return i ? `Graphics plan ${run.version}` : `طرح موشن‌گرافیک نسخهٔ ${run.version}`;
  return i ? `${STAGE[st][1]} version ${run.version}` : `${STAGE[st][0]} نسخهٔ ${run.version}`;
}

export async function runChanged(runId) {
  checkId("r", runId);
  refresh();
  const run = (await get(`runs/${runId}.json`))?.data;
  if (!run || !WORTH.includes(run.status)) return { sent: 0, why: "nothing to tell" };
  const project = (await get(`projects/${run.project_id}.json`))?.data;
  if (!project) return { sent: 0, why: "no project" };
  try {
    await put(`notified/${runId}-${run.status}.json`, { at: Date.now() }, null, `app: notified ${runId} ${run.status}`);
  } catch (e) {
    if (e instanceof ConflictError) return { sent: 0, why: "already told" };
    throw e;
  }
  const v = [versionName(run, 0), versionName(run, 1)];
  const title = {
    review: [`${v[0]} آمادهٔ بازبینی است`, `${v[1]} is ready for review`],
    failed: [`${v[0]} ساخته نشد`, `${v[1]} failed`],
    approved: [`${v[0]} تأیید شد و در Drive است`, `${v[1]} approved, in Drive`],
  }[run.status];
  const users = new Map();
  const allow = async (uid) => {
    if (!users.has(uid)) users.set(uid, (await get(`users/${uid}.json`).catch(() => null))?.data || null);
    const u = users.get(uid);
    return !!u && accessOf(u).includes("editing") && canSee(u, project);
  };
  const sent = await notify([project.owner_id, run.requested_by, ...(((project.access || {}).team === false && project.access.members) || [])], {
    title,
    body: project.title + (run.status === "failed" && run.error ? "\n" + String(run.error).slice(0, 200) : ""),
    url: `/editing/p/${project.id}`,
    tag: "run-" + runId,
  }, { allow });
  return { sent };
}
