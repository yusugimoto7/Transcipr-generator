// The voice study (Hamed, Oct 29 2026: "analyze my last 100 videos, with the system you use for
// transcribing Persian videos in the Topic Engine"). The page's own latest videos are read through
// its Instagram connection, each is transcribed the way the social lane does it (the file itself,
// Groq's Whisper, else OpenAI; never the paid service), and every transcript is kept on
// editing-data as voice/videos/<media id>.json with its caption, date and counts. The analysis of
// Hamed's voice is made from those files (docs/voice-analysis.md, the sugimoto-voice skill); this
// file only collects them. It runs once after a deploy (the tick route checks voice/study.json),
// picks up where it stopped after a restart, and is started again only by the admin.

import { get, put, list } from "./editing/store.js";
import { ownVideos, ownVideoViews } from "./calendar/channels/instagram.js";
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

// Called by the clock after a deploy: runs the study when it was never finished.
export async function studyTick() {
  if (state.running) return { started: false, reason: "running" };
  const cur = await get(STATUS).catch(() => null);
  if (cur && cur.data && cur.data.status === "done") return { started: false, reason: "done" };
  return runStudy({ by: "deploy" });
}
