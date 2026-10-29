// The voice study (Hamed, Oct 29 2026: "analyze my last 100 videos, with the system you use for
// transcribing Persian videos in the Topic Engine"). The page's own latest videos are read through
// its Instagram connection, each is transcribed the way the social lane does it (the file itself,
// Groq's Whisper, else OpenAI; never the paid service), and every transcript is kept on
// editing-data as voice/videos/<media id>.json with its caption, date and counts. The analysis of
// Hamed's voice is made from those files (docs/voice-analysis.md, the sugimoto-voice skill); this
// file only collects them. It runs once after a deploy (the tick route checks voice/study.json),
// picks up where it stopped after a restart, and is started again only by the admin.

import { get, put, list } from "./editing/store.js";
import { ownVideos, ownVideoViews, ownMedia, ownChildren } from "./calendar/channels/instagram.js";
import { readSlides } from "./image-text.js";
import { videoTranscript, transcriptWay, groqEnabled } from "./video-transcript.js";
import { openaiEnabled } from "./openai.js";

const STATUS = "voice/study.json";
const DIR = "voice/videos/";
const state = globalThis.__voiceStudy || (globalThis.__voiceStudy = { running: false });

const persian = (t) => /[؀-ۿ]/.test(String(t || ""));

export async function studyStatus() {
  const s = await get(STATUS).catch(() => null);
  return { running: state.running, ...(s ? s.data : { status: "not started" }) };
}

async function saveStatus(data) {
  const cur = await get(STATUS).catch(() => null);
  await put(STATUS, data, cur ? cur.sha : null, "voice study: " + data.status + " " + (data.done || 0) + "/" + (data.count || 0));
}

// Start (or continue) the study. `restart` forgets the saved list of videos and reads it again.
export async function runStudy({ count = 100, market = "canada", restart = false, by = "" } = {}) {
  if (state.running) return { started: false, reason: "already running" };
  if (!groqEnabled() && !openaiEnabled()) return { started: false, reason: "no transcriber: set GROQ_API_KEY, or USE_OPENAI with OPENAI_API_KEY" };
  state.running = true;
  (async () => {
    let s = null;
    try {
      const cur = await get(STATUS).catch(() => null);
      s = cur && !restart ? cur.data : null;
      if (!s || !Array.isArray(s.items) || !s.items.length) {
        const videos = await ownVideos(market, { count });
        s = {
          status: "running",
          market,
          count: videos.length,
          asked_by: by,
          started_at: new Date().toISOString(),
          done: 0,
          items: videos.map((v) => ({ id: v.id, permalink: v.permalink, timestamp: v.timestamp, product: v.media_product_type || "", state: "waiting" })),
        };
        await saveStatus(s);
      } else {
        s.status = "running";
      }
      const have = new Set((await list(DIR).catch(() => [])).map((f) => f.path.slice(DIR.length).replace(/\.json$/, "")));
      // The file addresses Instagram hands out expire within hours, so they are read again now.
      const fresh = new Map((await ownVideos(market, { count: Math.max(count, s.items.length) })).map((v) => [v.id, v]));
      let sinceSave = 0;
      for (const item of s.items) {
        if (have.has(item.id)) {
          if (item.state !== "done") item.state = "done";
          continue;
        }
        const v = fresh.get(item.id);
        if (!v || !v.media_url) {
          item.state = "skipped";
          item.reason = "Instagram gave no file for it";
          continue;
        }
        try {
          const text = await videoTranscript(v.permalink, { video_url: v.media_url, lang: persian(v.caption) ? "fa" : "", fileOnly: true });
          const how = transcriptWay(v.permalink);
          const views = await ownVideoViews(market, v.id).catch(() => null);
          if (!text) {
            item.state = "skipped";
            item.reason = how === "none" ? "file too large or could not be fetched" : "no speech";
          } else {
            await put(
              DIR + v.id + ".json",
              {
                id: v.id,
                permalink: v.permalink,
                timestamp: v.timestamp,
                product: v.media_product_type || "",
                caption: v.caption || "",
                likes: v.like_count ?? null,
                comments: v.comments_count ?? null,
                views,
                how,
                transcript: text,
                words: text.split(/\s+/).filter(Boolean).length,
              },
              null,
              "voice study: transcript " + v.id
            );
            item.state = "done";
            item.words = text.split(/\s+/).filter(Boolean).length;
          }
        } catch (e) {
          item.state = "failed";
          item.reason = String(e.message || e).slice(0, 200);
        }
        s.done = s.items.filter((i) => i.state === "done").length;
        if (++sinceSave >= 10) {
          sinceSave = 0;
          await saveStatus(s).catch(() => {});
        }
        // Groq's free plan takes about two hours of audio an hour; a short gap keeps it below.
        await new Promise((r) => setTimeout(r, 3000));
      }
      s.done = s.items.filter((i) => i.state === "done").length;
      s.status = "done";
      s.finished_at = new Date().toISOString();
      await saveStatus(s);
      console.log("[voice study] done:", s.done, "of", s.count, "transcribed");
    } catch (e) {
      console.error("[voice study] stopped:", String(e.message || e).slice(0, 300));
      const error = String(e.message || e).slice(0, 300);
      await saveStatus(s ? { ...s, status: "stopped", error } : { status: "stopped", error, at: new Date().toISOString(), items: [] }).catch(() => {});
    } finally {
      state.running = false;
    }
  })();
  return { started: true };
}

// ── The carousel study (Hamed, Oct 29 2026: "read all our carousel posts; the older ones, 2024 and
// before, I mostly wrote by hand; some are tweets of mine I copied in; some are handwritten notes from
// 2022-2023"). Every carousel and single-picture post of the page is read slide by slide by the vision
// model (readSlides: the kind of slide and its words exactly) and kept as voice/carousels/<id>.json
// with its caption, date and counts. Oldest first, because the older posts are the ones Hamed wrote
// himself; resumable like the video study. Progress in voice/carousel-study.json.
const C_STATUS = "voice/carousel-study.json";
const C_DIR = "voice/carousels/";
const cstate = globalThis.__carouselStudy || (globalThis.__carouselStudy = { running: false });
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

async function asDataUrl(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  const type = /png/.test(res.headers.get("content-type") || "") ? "image/png" : "image/jpeg";
  return `data:${type};base64,${buf.toString("base64")}`;
}

export async function carouselStatus() {
  const s = await get(C_STATUS).catch(() => null);
  return { running: cstate.running, ...(s ? s.data : { status: "not started" }) };
}

async function saveCStatus(data) {
  const cur = await get(C_STATUS).catch(() => null);
  await put(C_STATUS, data, cur ? cur.sha : null, "carousel study: " + data.status + " " + (data.done || 0) + "/" + (data.count || 0));
}

export async function runCarouselStudy({ market = "canada", restart = false, by = "" } = {}) {
  if (cstate.running) return { started: false, reason: "already running" };
  if (!process.env.OPENAI_API_KEY) return { started: false, reason: "OPENAI_API_KEY is not set" };
  cstate.running = true;
  (async () => {
    let s = null;
    try {
      const cur = await get(C_STATUS).catch(() => null);
      s = cur && !restart ? cur.data : null;
      // Every post the page has (Instagram hands them 50 at a time, newest first).
      const posts = await ownMedia(market, { types: ["CAROUSEL_ALBUM", "IMAGE"], count: 5000, maxPages: 120 });
      const byId = new Map(posts.map((p) => [p.id, p]));
      if (!s || !Array.isArray(s.items) || !s.items.length) {
        s = {
          status: "running",
          market,
          asked_by: by,
          started_at: new Date().toISOString(),
          count: posts.length,
          done: 0,
          items: posts
            .slice()
            .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
            .map((p) => ({ id: p.id, timestamp: p.timestamp, type: p.media_type, state: "waiting" })),
        };
        await saveCStatus(s);
      } else s.status = "running";
      const have = new Set((await list(C_DIR).catch(() => [])).map((f) => f.path.slice(C_DIR.length).replace(/\.json$/, "")));
      let sinceSave = 0;
      for (const item of s.items) {
        if (have.has(item.id)) {
          item.state = "done";
          continue;
        }
        const p = byId.get(item.id);
        if (!p) {
          item.state = "skipped";
          item.reason = "no longer on the page";
          continue;
        }
        try {
          const pics =
            p.media_type === "CAROUSEL_ALBUM"
              ? (await ownChildren(market, p.id)).map((c) => (c.media_type === "VIDEO" ? c.thumbnail_url : c.media_url) || "")
              : [p.media_url || ""];
          const urls = [];
          for (const u of pics.slice(0, 10)) urls.push(u ? await asDataUrl(u).catch(() => null) : null);
          const ok = urls.filter(Boolean);
          if (!ok.length) {
            item.state = "skipped";
            item.reason = "Instagram gave no pictures for it";
          } else {
            const read = await readSlides(ok);
            const slides = read.map((r) => ({ ...r }));
            await put(
              C_DIR + p.id + ".json",
              {
                id: p.id,
                permalink: p.permalink,
                timestamp: p.timestamp,
                type: p.media_type,
                caption: p.caption || "",
                likes: p.like_count ?? null,
                comments: p.comments_count ?? null,
                slides,
                kinds: [...new Set(slides.map((x) => x.kind))],
              },
              null,
              "carousel study: " + p.id
            );
            item.state = "done";
            item.slides = slides.length;
          }
        } catch (e) {
          item.state = "failed";
          item.reason = String(e.message || e).slice(0, 200);
        }
        s.done = s.items.filter((i) => i.state === "done").length;
        if (++sinceSave >= 10) {
          sinceSave = 0;
          await saveCStatus(s).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      s.done = s.items.filter((i) => i.state === "done").length;
      s.status = "done";
      s.finished_at = new Date().toISOString();
      await saveCStatus(s);
      console.log("[carousel study] done:", s.done, "of", s.count);
    } catch (e) {
      console.error("[carousel study] stopped:", String(e.message || e).slice(0, 300));
      const error = String(e.message || e).slice(0, 300);
      await saveCStatus(s ? { ...s, status: "stopped", error } : { status: "stopped", error, at: new Date().toISOString(), items: [] }).catch(() => {});
    } finally {
      cstate.running = false;
    }
  })();
  return { started: true };
}

// Called by the clock after a deploy: runs each study that was never finished.
export async function studyTick() {
  const out = {};
  const cur = await get(STATUS).catch(() => null);
  out.videos = state.running ? { started: false, reason: "running" } : cur && cur.data && cur.data.status === "done" ? { started: false, reason: "done" } : await runStudy({ by: "deploy" });
  const cc = await get(C_STATUS).catch(() => null);
  out.carousels = cstate.running ? { started: false, reason: "running" } : cc && cc.data && cc.data.status === "done" ? { started: false, reason: "done" } : await runCarouselStudy({ by: "deploy" });
  return { started: !!(out.videos.started || out.carousels.started), ...out };
}
