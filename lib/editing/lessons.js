// Lessons: rule changes the rough-cut worker proposes from a reviewer's corrections (english-
// sugimotovisa, scripts/rough_cut_lessons.py). Each one is a list of exact edits to the rule files.
// Only the admin sees and decides them; an approval starts the worker, which commits the edits to
// that repository's main branch exactly as they were shown here. This app never edits the rules.

import { get, list, update, dispatch } from "./store";
import { HttpError } from "./projects";

const OPEN = ["proposed", "applying"];

function checkLessonId(v) {
  if (!/^l-[a-f0-9]{12}$/.test(String(v || ""))) throw new HttpError(404, "not found");
  return v;
}

export async function listLessons() {
  return (await list("lessons/")).map((x) => x.data).sort((a, b) => {
    const open = (l) => (OPEN.includes(l.status) ? 0 : 1);
    return open(a) - open(b) || b.created_at - a.created_at;
  });
}

// A failed lesson can be approved again. A stale one (the rules changed after it was proposed, so
// its edits no longer fit) can only be rejected: the worker never overwrites a newer rule.
export async function decideLesson(user, id, action, note) {
  checkLessonId(id);
  const path = `lessons/${id}.json`;
  if (!(await get(path))) throw new HttpError(404, "not found");
  if (action === "reject") {
    await update(path, (l) => {
      if (!["proposed", "stale", "failed"].includes(l.status)) throw new HttpError(409, "this lesson was already decided");
      return { ...l, status: "rejected", rejection: { by: user.id, at: Date.now(), note: String(note || "").trim().slice(0, 500) }, updated_at: Date.now() };
    }, `app: reject ${id}`);
    return;
  }
  if (action !== "approve") throw new HttpError(400, "approve or reject");
  await update(path, (l) => {
    if (!["proposed", "failed"].includes(l.status)) throw new HttpError(409, "this lesson was already decided");
    return { ...l, status: "applying", approval: { by: user.id, at: Date.now() }, error: "", updated_at: Date.now() };
  }, `app: approve ${id}`);
  try {
    await dispatch(id, "lesson");
  } catch (e) {
    await update(path, (l) => ({ ...l, status: "proposed", approval: null, error: String(e.message || e), updated_at: Date.now() }));
    throw new HttpError(502, String(e.message || e));
  }
}
