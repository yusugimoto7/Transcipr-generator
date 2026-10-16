// Background jobs. The slow steps (writing scripts, sending them to Telegram,
// writing the article, publishing the draft, sending the Word file) run HERE,
// on the server, not inside the browser page.
//
// Why: a phone suspends a page the moment you switch apps, and every step used
// to be a fetch the page was waiting on, so leaving the browser froze the whole
// pipeline halfway. Now the page only starts a job (one tiny request) and later
// asks how it is going; the work continues on Render whether or not anyone is
// looking, and finished material is saved to the shared workspace
// (lib/workspace.js) by the server itself, so it is there even if the page
// never comes back — for everyone on the team.
//
// State is in memory: Render runs one long-lived process, so a job outlives the
// request that started it. A restart mid-job loses it; the page notices (the id
// is unknown) and offers a retry. Finished work is already in the workspace.

import { POST as scriptPost } from "../app/api/script/route";
import { POST as articlePost } from "../app/api/article/route";
import { POST as telegramPost } from "../app/api/telegram/route";
import { POST as publishPost } from "../app/api/publish/route";
import { POST as docfilePost } from "../app/api/docfile/route";
import { saveMaterial, setStatus, getEntry, keyOf } from "./workspace";
import { sourceTextFor, writeSlides, drawSlides, redrawSlide, sendCarousel } from "./carousel";
import { videoWorkflowEnabled, videoRequestFrom, requestVideo } from "./video";
import { storyEnabled, writeStory, captureShots, drawStory, sendStory } from "./story";

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

const runners = {
  // Scripts only. The Telegram news post is its own step now, chosen per
  // topic on the topic page (it used to go out automatically here).
  async script(job, { topic }) {
    // Used from now on, for everyone: the list shows it as being written.
    await setStatus(topic, "active").catch(() => {});
    // Settled separately: an English failure must not throw away the Farsi.
    const [faR, enR] = await Promise.allSettled([
      callRoute(scriptPost, { topic, lang: "fa" }),
      callRoute(scriptPost, { topic, lang: "en" }),
    ]);
    const fa = faR.status === "fulfilled" ? faR.value.text || "" : "";
    const en = enR.status === "fulfilled" ? enR.value.text || "" : "";
    if (!fa && !en) throw new Error((faR.reason && faR.reason.message) || "empty script");
    await saveMaterial("script", topic, { script_fa: fa, script_en: en }).catch(() => {});
    return { fa, en, enError: enR.status === "rejected" ? String(enR.reason?.message || enR.reason) : "" };
  },

  // Rewrite the English script: into English when it came back in Farsi,
  // and/or to the length chosen for the video. Saved as the topic's English
  // script, the Farsi one kept.
  async script_en(job, { topic, script, seconds, notes, save = true }) {
    const entry = await getEntry(keyOf(topic)).catch(() => null);
    const saved = (entry && entry.materials.script) || {};
    const base = String(script || saved.script_en || saved.script_fa || "").trim();
    if (!base) throw new Error("write the scripts first");
    const { text } = await callRoute(scriptPost, { topic, lang: "en", rewrite: { script: base, seconds, notes } });
    if (save) await saveMaterial("script", topic, { script_fa: saved.script_fa || "", script_en: text }).catch(() => {});
    return { en: text, seconds: Number(seconds) || 0 };
  },
  async article(job, { topic }) {
    await setStatus(topic, "active").catch(() => {});
    const data = await callRoute(articlePost, { topic });
    await saveMaterial("article", topic, { article: data.article }).catch(() => {});
    return { article: data.article, provider: data.provider };
  },

  async telegram(job, { topic, fa, en }) {
    await callRoute(telegramPost, { topic, fa, en });
    const sent = Date.now();
    await saveMaterial("telegram", topic, { sent }).catch(() => {});
    return { sent };
  },

  async publish(job, { article }) {
    return callRoute(publishPost, { article });
  },

  async docfile(job, { article }) {
    return callRoute(docfilePost, { article });
  },

  // Carousel: slide texts first (shown as soon as they exist), then one image
  // per slide. Saved after the texts and again when the images are in, so a
  // restart midway keeps what was done and the page offers to finish it.
  async carousel(job, { topic, count, notes, revise }) {
    await setStatus(topic, "active").catch(() => {});
    const note = String(notes || "").slice(0, 1500);
    const sourceText = await sourceTextFor(topic);
    if (!sourceText || sourceText.length < 60) throw new Error("no source text to build the carousel from");
    let previous = null;
    if (revise) {
      const entry = await getEntry(keyOf(topic)).catch(() => null);
      previous = (entry && entry.materials.carousel) || null;
    }
    job.result = { stage: "writing", slides: [], caption: "" };
    const { slides, caption } = await writeSlides(topic, count, note, sourceText, { previous });
    const carousel = { slides, caption, count: slides.length, notes: note, sent: {} };
    job.result = { stage: "drawing", ...carousel };
    await saveMaterial("carousel", topic, carousel).catch(() => {});
    await drawSlides(topic, slides, note, () => {
      job.result = { stage: "drawing", ...carousel, slides: slides.map((x) => ({ ...x })) };
    });
    await saveMaterial("carousel", topic, carousel).catch(() => {});
    return { stage: "done", ...carousel };
  },

  // Redraw one slide (num) or every slide still without an image ("missing").
  async carousel_slide(job, { topic, num }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials.carousel;
    if (!saved) throw new Error("no carousel saved for this topic");
    const carousel = { slides: saved.slides.map((x) => ({ ...x })), caption: saved.caption, count: saved.count, notes: saved.notes || "", sent: saved.sent || {} };
    if (num === "missing") await drawSlides(topic, carousel.slides, carousel.notes);
    else await redrawSlide(topic, carousel.slides, num, carousel.notes);
    await saveMaterial("carousel", topic, carousel);
    return { stage: "done", ...carousel };
  },

  async carousel_send(job, { topic, target }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials.carousel;
    if (!saved) throw new Error("no carousel saved for this topic");
    const r = await sendCarousel(saved, target === "public" ? "public" : "review");
    const sent = { ...(saved.sent || {}), [target === "public" ? "public" : "review"]: Date.now() };
    await saveMaterial("carousel", topic, {
      slides: saved.slides, caption: saved.caption, count: saved.count, notes: saved.notes || "", sent,
    }).catch(() => {});
    return { sent, ...r };
  },

  // Fact story: text first, then the screenshots of the original source
  // (taken only now, for this topic), then each page is drawn. Saved after
  // every stage so a restart keeps what was done.
  async story(job, { topic, count, notes, revise, bg }) {
    if (!storyEnabled()) throw new Error("stories need HCTI_USER_ID and HCTI_API_KEY on the server");
    await setStatus(topic, "active").catch(() => {});
    const note = String(notes || "").slice(0, 1500);
    const sourceText = await sourceTextFor(topic);
    if (!sourceText || sourceText.length < 60) throw new Error("no source text to build the story from");
    const entry = await getEntry(keyOf(topic)).catch(() => null);
    const saved = (entry && entry.materials.story) || null;
    job.result = { stage: "writing", pages: [], caption: "" };
    const written = await writeStory(topic, count, note, sourceText, revise ? saved : null);
    const story = {
      pages: written.pages,
      caption: written.caption,
      count: written.pages.length,
      notes: note,
      sent: {},
      bg: String(bg || (saved && saved.bg) || "black"),
      // The same source: its masthead and earlier screenshots are reused.
      masthead_url: (saved && saved.masthead_url) || "",
      source_label: (saved && saved.source_label) || "",
    };
    job.result = { stage: "screenshots", ...story };
    await captureShots(topic, story, (saved && saved.pages) || []);
    job.result = { stage: "drawing", ...story };
    await saveMaterial("story", topic, story).catch(() => {});
    await drawStory(story, () => {
      job.result = { stage: "drawing", ...story, pages: story.pages.map((p) => ({ ...p })) };
    });
    await saveMaterial("story", topic, story).catch(() => {});
    return { stage: "done", ...story };
  },

  // Draw again the pages without an image (a page that failed to render),
  // or every page in a new background colour. The text stays as it is.
  async story_draw(job, { topic, bg }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials.story;
    if (!saved) throw new Error("no story saved for this topic");
    const story = { ...saved, pages: saved.pages.map((p) => ({ ...p })) };
    if (bg && bg !== saved.bg) {
      story.bg = String(bg);
      for (const p of story.pages) p.image_url = "";
    }
    job.result = { stage: "drawing", ...story };
    await drawStory(story, () => {
      job.result = { stage: "drawing", ...story, pages: story.pages.map((p) => ({ ...p })) };
    });
    await saveMaterial("story", topic, story);
    return { stage: "done", ...story };
  },

  async story_send(job, { topic, target }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials.story;
    if (!saved) throw new Error("no story saved for this topic");
    const where = target === "public" ? "public" : "review";
    const r = await sendStory(saved, where);
    const sent = { ...(saved.sent || {}), [where]: Date.now() };
    await saveMaterial("story", topic, { ...saved, sent }).catch(() => {});
    return { sent, ...r };
  },

  // English video, through the n8n workflow (see lib/video.js). Inactive
  // until VIDEO_WORKFLOW_URL is set. The page sends the final script as
  // edited plus the options; the workflow reports back to /api/video/callback.
  async video(job, { topic, video }) {
    if (!videoWorkflowEnabled()) throw new Error("the video workflow is not connected yet");
    const req = videoRequestFrom(video || {});
    await setStatus(topic, "active").catch(() => {});
    const { request_id, response } = await requestVideo(topic, keyOf(topic), req);
    const record = { status: "requested", request_id, request: req, requested_at: Date.now(), response };
    await saveMaterial("video", topic, record).catch(() => {});
    return record;
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
