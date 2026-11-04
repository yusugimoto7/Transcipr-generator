// The voice study (Hamed, Oct 29 2026: "analyze my last 100 videos, with the system you use for
// transcribing Persian videos in the Topic Engine"). The page's own latest videos are read through
// its Instagram connection, each is transcribed the way the social lane does it (the file itself,
// Groq's Whisper, else OpenAI; never the paid service), and every transcript is kept on
// editing-data as voice/videos/<media id>.json with its caption, date and counts. The analysis of
// Hamed's voice is made from those files (docs/voice-analysis.md, the sugimoto-voice skill); this
// file only collects them. It runs once after a deploy (the tick route checks voice/study.json),
// picks up where it stopped after a restart, and is started again only by the admin.

import { get, put, list, putShot } from "./editing/store.js";
import sharp from "sharp";
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

// ── The design references (Hamed, Nov 4 2026: "templates exactly like my successful posts"): the
// slide pictures of his best-liked own carousels, saved as refs/hamed/<post id>-<slide>.jpg on
// editing-data so their design can be studied and made into templates. Needs the carousel study's
// files (voice/carousels) to pick from. Progress in voice/refs-study.json.
const R_STATUS = "voice/refs-study.json";
const rstate = globalThis.__refsStudy || (globalThis.__refsStudy = { running: false });
const wordsOf = (t) => String(t || "").split(/\s+/).filter(Boolean).length;

export async function refsStatus() {
  const s = await get(R_STATUS).catch(() => null);
  return { running: rstate.running, ...(s ? s.data : { status: "not started" }) };
}

export async function runRefsStudy({ market = "canada", restart = false } = {}) {
  if (rstate.running) return { started: false, reason: "already running" };
  rstate.running = true;
  (async () => {
    let st = { status: "running", started_at: new Date().toISOString(), posts: [], saved: 0 };
    const save = async () => {
      const cur = await get(R_STATUS).catch(() => null);
      await put(R_STATUS, st, cur ? cur.sha : null, "refs study: " + st.status + " " + st.saved);
    };
    try {
      const cur = await get(R_STATUS).catch(() => null);
      if (cur && cur.data.status === "done" && !restart) return;
      const all = (await list(C_DIR)).map((f) => f.data).filter((p) => p && p.type === "CAROUSEL_ALBUM");
      const text = (p) => p.slides.filter((x) => (x.kind === "designed" || x.kind === "tweet") && wordsOf(x.text) > 15).length >= 3;
      const yr = (p) => p.timestamp.slice(0, 4);
      const byLikes = (a, b) => (b.likes || 0) - (a.likes || 0);
      const pool = all.filter((p) => text(p) && yr(p) >= "2021" && yr(p) <= "2024").sort(byLikes);
      const picks = [];
      const add = (p, why) => p && !picks.some((x) => x.p.id === p.id) && picks.push({ p, why });
      pool.filter((p) => !p.kinds.includes("tweet")).slice(0, 6).forEach((p) => add(p, "top liked"));
      pool.filter((p) => p.kinds.includes("tweet")).slice(0, 2).forEach((p) => add(p, "tweets"));
      add(pool.find((p) => /خبر فوری|BREAKING/.test(p.slides[0].text)), "news");
      st.posts = picks.map(({ p, why }) => ({ id: p.id, why, likes: p.likes, date: p.timestamp.slice(0, 10), cover: p.slides[0].text.replace(/\s+/g, " ").slice(0, 60), saved: [] }));
      await save();
      for (const item of st.posts) {
        const kids = await ownChildren(market, item.id).catch(() => []);
        const n = kids.length;
        // cover, the second slide, a body slide, and the last two
        const want = [...new Set([1, 2, 3, Math.max(1, n - 1), n].filter((i) => i >= 1 && i <= n))];
        for (const i of want) {
          const c = kids[i - 1];
          const url = c && (c.media_type === "VIDEO" ? c.thumbnail_url : c.media_url);
          if (!url) continue;
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
            if (!res.ok) continue;
            const jpg = await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 86 }).toBuffer();
            await putShot(`refs/hamed/${item.id}-${i}.jpg`, jpg, "refs study: " + item.id + "-" + i);
            item.saved.push(i);
            st.saved++;
          } catch (e) {
            item.error = String(e.message || e).slice(0, 120);
          }
        }
        await save().catch(() => {});
      }
      st.status = "done";
      st.finished_at = new Date().toISOString();
      await save();
    } catch (e) {
      st.status = "stopped";
      st.error = String(e.message || e).slice(0, 300);
      await save().catch(() => {});
    } finally {
      rstate.running = false;
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
  // the design references need the carousel study's files, so they wait for it
  const rr = await get(R_STATUS).catch(() => null);
  const cdone = (await get(C_STATUS).catch(() => null)) || {};
  out.refs = rstate.running ? { started: false, reason: "running" } : rr && rr.data && rr.data.status === "done" ? { started: false, reason: "done" } : cdone.data && cdone.data.status === "done" ? await runRefsStudy() : { started: false, reason: "waiting for the carousel study" };
  return { started: !!(out.videos.started || out.carousels.started || out.refs.started), ...out };
}
