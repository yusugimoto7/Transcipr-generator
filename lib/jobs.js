// Background jobs. The slow steps (writing scripts, sending them to Telegram,
// writing the article, publishing the draft, sending the Word file) run HERE,
// on the server, not inside the browser page.
//
// Why: a phone suspends a page the moment you switch apps, and every step used
// to be a fetch the page was waiting on, so leaving the browser froze the whole
// pipeline halfway. Now the page only starts a job (one tiny request) and later
// asks how it is going; the work continues on Render whether or not anyone is
// looking, and finished scripts/articles are saved to the Library by the server
// itself, so they are there even if the page never comes back.
//
// State is in memory: Render runs one long-lived process, so a job outlives the
// request that started it. A restart mid-job loses it; the page notices (the id
// is unknown) and offers a retry. Finished work is already in the Library.

import { POST as scriptPost } from "../app/api/script/route";
import { POST as articlePost } from "../app/api/article/route";
import { POST as telegramPost } from "../app/api/telegram/route";
import { POST as publishPost } from "../app/api/publish/route";
import { POST as docfilePost } from "../app/api/docfile/route";
import { saveLibraryItem } from "./library";

const store = globalThis.__sugimotoJobs || (globalThis.__sugimotoJobs = new Map());

const KEEP_MS = 3 * 60 * 60 * 1000; // finished jobs stay readable this long
const MAX_RUNNING = 8; // runaway guard: every job spends model calls

export function topicKeyOf(t) {
  return String((t && (t.title_fa || t.title_en)) || "").trim().toLowerCase();
}

// Run an existing route handler in-process, so the job and the HTTP endpoint
// can never disagree about how a step works.
async function callRoute(handler, body) {
  const req = new Request("http://internal.invalid/job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || "HTTP " + res.status);
  return data;
}

function libraryItem(type, topic, extra) {
  return {
    id: type + ":" + topicKeyOf(topic),
    type,
    title_fa: topic.title_fa,
    title_en: topic.title_en,
    field: topic.field,
    page: topic.page,
    source_url: topic.source_url || "",
    score: topic.score || 0,
    why_now: topic.why_now || "",
    ts: Date.now(),
    ...extra,
  };
}

const runners = {
  async script(job, { topic }) {
    const [fa, en] = (
      await Promise.all([
        callRoute(scriptPost, { topic, lang: "fa" }),
        callRoute(scriptPost, { topic, lang: "en" }),
      ])
    ).map((r) => r.text || "");
    if (!fa && !en) throw new Error("empty script");
    // Show the scripts as soon as they exist; Telegram follows.
    job.result = { fa, en, tg: "pending", tgMsg: "" };
    await saveLibraryItem(libraryItem("script", topic, { script_fa: fa, script_en: en })).catch(() => {});
    let tg = "sent";
    let tgMsg = "";
    try {
      await callRoute(telegramPost, { topic, fa, en });
    } catch (e) {
      tg = "error";
      tgMsg = String(e?.message || e);
    }
    return { fa, en, tg, tgMsg };
  },

  async article(job, { topic }) {
    const data = await callRoute(articlePost, { topic });
    await saveLibraryItem(libraryItem("article", topic, { article: data.article })).catch(() => {});
    return { article: data.article, provider: data.provider };
  },

  async telegram(job, { topic, fa, en }) {
    await callRoute(telegramPost, { topic, fa, en });
    return { sent: true };
  },

  async publish(job, { article }) {
    return callRoute(publishPost, { article });
  },

  async docfile(job, { article }) {
    return callRoute(docfilePost, { article });
  },
};

export const JOB_KINDS = Object.keys(runners);

function prune() {
  const cutoff = Date.now() - KEEP_MS;
  for (const [id, j] of store) if ((j.finishedAt || j.startedAt) < cutoff) store.delete(id);
}

// What the browser is allowed to see.
export function publicJob(j) {
  return {
    id: j.id,
    kind: j.kind,
    key: j.key,
    status: j.status,
    result: j.result || null,
    error: j.error || "",
    startedAt: j.startedAt,
    finishedAt: j.finishedAt || 0,
  };
}

export function startJob(kind, key, payload) {
  if (!runners[kind]) throw new Error("unknown job kind: " + kind);
  prune();

  // Same step for the same topic already in flight: join it instead of paying
  // for a second copy (a double tap, or a page that reloaded and asked again).
  for (const j of store.values()) {
    if (j.status === "running" && j.kind === kind && j.key === key) return j;
  }
  let running = 0;
  for (const j of store.values()) if (j.status === "running") running++;
  if (running >= MAX_RUNNING) throw new Error("too many jobs running; wait for one to finish");

  const job = {
    id: globalThis.crypto.randomUUID(),
    kind,
    key,
    status: "running",
    result: null,
    error: "",
    startedAt: Date.now(),
    finishedAt: 0,
  };
  store.set(job.id, job);

  // Deliberately not awaited: this is what lets the work outlive the request.
  runners[kind](job, payload)
    .then((result) => {
      job.result = result;
      job.status = "done";
    })
    .catch((e) => {
      job.error = String(e?.message || e);
      job.status = "error";
    })
    .finally(() => {
      job.finishedAt = Date.now();
    });

  return job;
}

export function getJobs(ids) {
  const found = [];
  const missing = [];
  for (const id of ids) {
    const j = store.get(id);
    if (j) found.push(publicJob(j));
    else missing.push(id);
  }
  return { jobs: found, missing };
}
