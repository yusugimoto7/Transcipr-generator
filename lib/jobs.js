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
import { POST as publishPost } from "../app/api/publish/route";
import { saveMaterial, setStatus, getEntry, keyOf } from "./workspace";
import { buildCustomTopic } from "./custom-news";
import { cleanVisaImages, scanVisaImages, scanVisaImage, readVisaNotes } from "./visa-news/scan.js";
import { putPending, getPending, dropPending } from "./visa-news/pending.js";
import { splitCases } from "./visa-news/draft.js";
import { drawVisaStories, keptImageUrl, LAYOUT, cleanManual } from "./visa-news/compose.js";
import { saveCase } from "./visa-news/cases.js";
import { sourceTextFor, writeSlides, drawSlides, redrawSlide, editSlide, sendCarousel, templateOf, cleanSlides, capHashtags } from "./carousel";
import { writePost, drawPicture, editPostPicture, sendPost, cleanLink } from "./telegram-post";
import { editStoryPage } from "./story-page";
import { learnFromNote, lessonsBlock } from "./learning";
import { openaiScript } from "./openai";
import { researchIdea, findIdeas } from "./idea-research";
import { officialDrawSource } from "./provinces";
import { videoWorkflowEnabled, videoRequestFrom, requestVideo } from "./video";
import { langOf, materialOf } from "./lang";
import { storyEnabled, writeStory, captureShots, drawStory, sendStory, cleanPageManual, cleanTemplate, templateMeta } from "./story";
import { fillStoryPhotos, makeStoryPhoto } from "./story/photo";

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

// The story layout the page or a note may set (lib/visa-news/compose.js LAYOUT).
function cleanLayout(l) {
  const x = l && typeof l === "object" ? l : {};
  return {
    big: ["letter", "timeline", "none"].includes(x.big) ? x.big : LAYOUT.big,
    first: ["letter", "timeline"].includes(x.first) ? x.first : LAYOUT.first,
    text: ["over", "below"].includes(x.text) ? x.text : LAYOUT.text,
    size: ["small", "normal", "large"].includes(x.size) ? x.size : LAYOUT.size,
    // Hand-drawn layouts, one per story (by its number on the page).
    ...(x.manual && typeof x.manual === "object" && !Array.isArray(x.manual) ? { manual: Object.fromEntries(Object.entries(x.manual).slice(0, 10).map(([k, v]) => [String(k).slice(0, 4), cleanManual(v)]).filter(([, v]) => v)) } : {}),
  };
}

const runners = {
  // Hamed's note, read for a rule to keep (lib/learning.js). Admin only: checked in /api/jobs.
  async learn(job, { topic, scope, note, context, by }) {
    const r = await learnFromNote({ scope, note, context, topicTitle: (topic && (topic.title_fa || topic.title_en)) || "", by });
    return { topic, ...r };
  },

  // News from the editor's own links (lib/custom-news.js). The card is saved
  // as a new topic in the shared workspace, so it is in everyone's list.
  async custom_news(job, { links, note, images }) {
    const { topic, skipped } = await buildCustomTopic({ links, note, images });
    await setStatus(topic, "new").catch(() => {});
    return { topic, skipped };
  },

  // Visa results (lib/visa-news): the pictures are read for what must be hidden and the dates to
  // mark; the page shows every box to be checked. Nothing is stored: the pictures stay with the page.
  // The case lives in the server's memory while this runs (lib/visa-news/pending.js), so leaving or
  // closing the page does not lose it: the page lists it from there and opens it when it is read.
  async visa_scan(job, { images, notes, caseId }) {
    const list = cleanVisaImages(images);
    if (!list.length) throw new Error("add at least one picture");
    const id = /^vc-[a-z0-9]{6,24}$/.test(String(caseId || "")) ? String(caseId) : "";
    const progress = (n) => {
      job.result = { stage: "reading", done: n, total: list.length };
      if (id) putPending(id, { status: "reading", progress: `${n} از ${list.length}` });
    };
    if (id) putPending(id, { status: "reading", progress: "", images: list, notes: String(notes || "").slice(0, 3000) });
    progress(0);
    try {
      const [scans, clients] = await Promise.all([
        scanVisaImages(list, progress),
        readVisaNotes(notes).catch((e) => {
          console.log("[visa-news] notes not read:", String(e?.message || e).slice(0, 160));
          return [];
        }),
      ]);
      const ids = [];
      if (id) {
        const parts = splitCases(scans, clients);
        parts.forEach((c, k) => {
          const cid = k === 0 ? id : "vc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          ids.push(cid);
          putPending(cid, { status: "ready", progress: "", images: c.idx.map((i) => list[i]), scans: c.scans, groups: c.groups, texts: c.texts, kinds: c.kinds, opts: { mark: "marker", background: "light", watermark: true }, checked: false });
        });
      }
      return { stage: "done", scans, clients, cases: ids };
    } catch (e) {
      if (id) putPending(id, { status: "error", error: String(e?.message || e).slice(0, 200) });
      throw e;
    }
  },

  // One picture read again with the team's note for it ("also mark the decision date"); its boxes
  // are replaced, the rest of the case stays.
  async visa_fix(job, { caseId, index, note, learnFrom }) {
    const c = getPending(String(caseId || ""));
    if (!c || !c.images) throw new Error("this case is no longer on the server; upload its pictures again");
    const i = Number(index);
    if (!c.images[i]) throw new Error("no such picture");
    const scan = await scanVisaImage(c.images[i], { note: String(note || "").slice(0, 800) });
    const scans = (c.scans || []).slice();
    scans[i] = scan;
    putPending(c.id, { scans });
    return { scan, index: i };
  },

  // The team's note on the finished stories ("shorter text", "dark background", "name first"): the
  // text and the look change as asked, never the facts; the page then draws again.
  async visa_restyle(job, { texts, note, opts }) {
    const n = String(note || "").trim().slice(0, 1000);
    if (!n) throw new Error("write the note first");
    const now = Object.fromEntries(Object.entries(texts && typeof texts === "object" ? texts : {}).slice(0, 10).map(([k, v]) => [k, String(v).slice(0, 1200)]));
    const taught = await lessonsBlock("visa", "fa");
    const raw = await openaiScript(`You edit the Persian lines of Instagram "visa approved" stories for Sugimoto Visa, a Persian immigration brand. Each story shows a client's covered approval letter or timeline, and these lines under it.

CURRENT LINES, per story (JSON): ${JSON.stringify(now)}
CURRENT LOOK: background "${String((opts && opts.background) || "light")}" (light | dark | brand), big logo ${opts && opts.watermark === false ? "off" : "on"}, layout ${JSON.stringify(cleanLayout(opts && opts.layout))}.
LAYOUT OPTIONS: "big": which picture takes most of the height ("letter" = the approval letter, "timeline", or "none" for equal); "first": which picture is on top ("letter" | "timeline"); "text": "over" = the lines laid over the big picture where they hide nothing important (dates, decision sentence, permit type), or "below" = under the pictures; "size": text size "small" | "normal" | "large".

THE TEAM'S NOTE:
"""
${n}
"""
${taught}
Change the lines, the look and the layout as the note asks (e.g. "the letter bigger" → big "letter"; "the writing on the letter" → text "over"; "smaller writing" → size "small"). Never add a fact (date, age, visa type, name) that is not in the current lines or the note; keep the «⬅️ label: value» line format unless the note asks otherwise; a line with no value is left out.

Answer with JSON only: {"texts": {same keys: new lines}, "background": "light|dark|brand", "watermark": true|false, "layout": {"big": "", "first": "", "text": "", "size": ""}, "not_done": "in Persian, what the note asked that none of these can change, or empty"}`, { maxOutputTokens: 2000 });
    const m = String(raw || "").replace(/```json/gi, "").replace(/```/g, "").match(/\{[\s\S]*\}/);
    let out = null;
    try {
      out = m ? JSON.parse(m[0]) : null;
    } catch {}
    if (!out || !out.texts) throw new Error("the answer could not be read; try again");
    const keep = Object.fromEntries(Object.keys(now).map((k) => [k, String(out.texts[k] ?? now[k]).slice(0, 1200)]));
    return {
      texts: keep,
      opts: { ...(opts || {}), background: ["light", "dark", "brand"].includes(out.background) ? out.background : (opts && opts.background) || "light", watermark: typeof out.watermark === "boolean" ? out.watermark : opts ? opts.watermark !== false : true, layout: cleanLayout({ ...cleanLayout(opts && opts.layout), ...(out.layout || {}) }) },
      not_done: String(out.not_done || "").slice(0, 300),
    };
  },

  // The checked pictures, covered for good, made into stories (one or two pictures each). A
  // picture is a fresh upload with its checked boxes (sent again, or `{ pending: true }` when the
  // server still holds the case), or a covered picture of a saved case.
  async visa_story(job, { images, stories, mark, background, watermark, layout, case: kase }) {
    const kinds = (kase && Array.isArray(kase.kinds) ? kase.kinds : []).map(String);
    const lay = cleanLayout(layout);
    const held = kase && kase.id ? getPending(String(kase.id)) : null;
    const given = (Array.isArray(images) ? images : []).slice(0, 10);
    const fresh = cleanVisaImages(given.map((im, i) => (im && im.data ? im : im && im.pending && held && held.images && held.images[i] ? held.images[i] : { data: "" })));
    let f = 0;
    const list = given.map((im, i) => {
      if (im && im.url && keptImageUrl(im.url)) return { url: im.url, marks: Array.isArray(im.marks) ? im.marks.slice(0, 80) : [], kind: kinds[i] || "" };
      if (im && (im.data || (im.pending && held && held.images && held.images[i]))) {
        const ok = fresh[f++];
        return ok ? { ...ok, boxes: Array.isArray(im.boxes) ? im.boxes.slice(0, 200) : [], kind: kinds[i] || "" } : null;
      }
      return null;
    });
    const want = (Array.isArray(stories) ? stories : []).slice(0, 10).map((st) => ({ images: (st.images || []).map(Number).filter((i) => list[i]).slice(0, 2), text: String(st.text || "").slice(0, 1200), manual: cleanManual(st.manual) }));
    if (!want.some((st) => st.images.length)) throw new Error("put at least one picture in a story");
    job.result = { stage: "drawing", done: 0, total: want.length };
    const drawn = await drawVisaStories({ images: list, stories: want.filter((st) => st.images.length), mark, background, watermark, layout: lay }, (n) => (job.result = { stage: "drawing", done: n, total: want.length }));
    // The case is saved for the team once its stories exist, with covered pictures only, and the
    // originals held in memory are let go.
    let saved = null;
    if (kase && kase.id && drawn.stories.some((x) => x.url)) {
      saved = await saveCase({
        id: String(kase.id),
        title: String(kase.title || "").slice(0, 200),
        created: Number(kase.created) || Date.now(),
        covered: drawn.covered,
        marks: drawn.marks,
        kinds: Array.isArray(kase.kinds) ? kase.kinds.slice(0, 10).map(String) : [],
        groups: Array.isArray(kase.groups) ? kase.groups.slice(0, 10).map(Number) : [],
        texts: kase.texts && typeof kase.texts === "object" ? Object.fromEntries(Object.entries(kase.texts).slice(0, 10).map(([k, v]) => [k, String(v).slice(0, 1200)])) : {},
        opts: { mark, background, watermark, layout: lay },
        stories: drawn.stories,
      }).catch((e) => {
        console.log("[visa-news] case not saved:", String(e?.message || e).slice(0, 160));
        return null;
      });
      if (saved) dropPending(String(kase.id));
    }
    return { stage: "done", stories: drawn.stories, covered: drawn.covered, marks: drawn.marks, saved: !!saved };
  },

  // An idea researched into a card, or a subject searched for several post ideas
  // (lib/idea-research.js). Every card is new in the shared workspace, like custom news.
  async research(job, { mode, query, count }) {
    const r = mode === "ideas" ? await findIdeas(query, count) : await researchIdea(query);
    for (const t of r.topics) await setStatus(t, "new").catch(() => {});
    return r;
  },

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
  async article(job, { topic, lang }) {
    await setStatus(topic, "active").catch(() => {});
    const data = await callRoute(articlePost, { topic, lang: langOf(lang) });
    await saveMaterial(materialOf("article", lang), topic, { article: data.article }).catch(() => {});
    return { article: data.article, provider: data.provider };
  },


  // The news post edited in the app: written (or rewritten with a note),
  // saved as edited, given a picture, and sent to the public channel only
  // when someone presses Send.
  async telegram_write(job, { topic, notes, revise, lang }) {
    await setStatus(topic, "active").catch(() => {});
    const saved = await savedPost(topic, lang);
    const note = String(notes || "").trim().slice(0, 1500);
    const { text, link } = await writePost(topic, { notes: note, previous: revise ? saved.text || "" : "", lang: langOf(lang) });
    const post = { ...saved, text, link, notes: note, written_at: Date.now(), lang: langOf(lang) };
    await saveMaterial(materialOf("telegram", lang), topic, post);
    return post;
  },
  async telegram_save(job, { topic, text, link, lang }) {
    const post = { ...(await savedPost(topic, lang)), text: String(text || "").slice(0, 3800), link: cleanLink(link), edited_at: Date.now(), lang: langOf(lang) };
    await saveMaterial(materialOf("telegram", lang), topic, post);
    return post;
  },
  async telegram_image(job, { topic, text, edit, notes, lang }) {
    const saved = await savedPost(topic, lang);
    const body = String(text || saved.text || "");
    if (!body.trim()) throw new Error("write the post first");
    let pic;
    if (edit && String(edit).trim()) {
      if (!saved.image_url) throw new Error("make the picture first");
      pic = await editPostPicture(topic, saved.image_url, edit, body, langOf(lang));
    } else {
      pic = await drawPicture(topic, body, notes, langOf(lang));
    }
    const post = {
      ...saved, text: body, image_url: pic.url, kept: pic.kept,
      image_edits: edit ? [...(saved.image_edits || []), String(edit).trim().slice(0, 300)].slice(-5) : [],
    };
    await saveMaterial(materialOf("telegram", lang), topic, post);
    return post;
  },
  async telegram_send(job, { topic, text, link, lang }) {
    const saved = await savedPost(topic, lang);
    const post = { ...saved, text: String(text ?? saved.text ?? "").slice(0, 3800), link: link === undefined ? saved.link : cleanLink(link) };
    const r = await sendPost(post, langOf(lang));
    const done = { ...post, sent: Date.now(), sent_to: "public" };
    await saveMaterial(materialOf("telegram", lang), topic, done).catch(() => {});
    return { ...done, messages: r.messages.length };
  },

  async publish(job, { article }) {
    return callRoute(publishPost, { article });
  },

  // Carousel: slide texts first (shown as soon as they exist), then one image
  // per slide. Saved after the texts and again when the images are in, so a
  // restart midway keeps what was done and the page offers to finish it.
  // `mode`: "text" writes the slides and stops (a draft the editor changes in the app), "save"
  // keeps the editor's text, "draw" draws from the editor's text; none writes and draws at once.
  async carousel(job, { topic, count, notes, revise, mode = "", slides: given, caption: givenCaption, template, lang: asked }) {
    const lang = langOf(asked);
    const M = materialOf("carousel", lang);
    await setStatus(topic, "active").catch(() => {});
    const note = String(notes || "").slice(0, 1500);
    const tpl = templateOf(template).id;
    if (mode === "save" || mode === "draw") {
      const slides = cleanSlides(given);
      if (!slides.length) throw new Error("write the slides first");
      const entry = await getEntry(keyOf(topic)).catch(() => null);
      const prev = (entry && entry.materials[M]) || {};
      // A slide whose words and look did not change keeps its picture: editing slide 3 redraws slide 3.
      for (const sl of slides) {
        const old = (prev.slides || []).find((x) => x.num === sl.num);
        if (old && old.image_url && old.content === sl.content && templateOf(prev.template).id === tpl) Object.assign(sl, { image_url: old.image_url, kept: old.kept });
      }
      const carousel = { slides, caption: capHashtags(String(givenCaption ?? prev.caption ?? "").slice(0, 4000)), count: slides.length, notes: note || prev.notes || "", template: tpl, sent: mode === "save" ? prev.sent || {} : {}, ...(mode === "save" && !slides.some((x) => x.image_url) ? { draft: true } : {}), lang };
      await saveMaterial(M, topic, carousel).catch(() => {});
      if (mode === "save") return { stage: "done", ...carousel };
      job.result = { stage: "drawing", ...carousel };
      await drawSlides(topic, slides, carousel.notes, () => {
        job.result = { stage: "drawing", ...carousel, slides: slides.map((x) => ({ ...x })) };
      }, tpl, lang);
      await saveMaterial(M, topic, carousel).catch(() => {});
      return { stage: "done", ...carousel };
    }
    const sourceText = await sourceTextFor(topic);
    if (!sourceText || sourceText.length < 60) throw new Error("no source text to build the carousel from");
    let previous = null;
    if (revise) {
      const entry = await getEntry(keyOf(topic)).catch(() => null);
      previous = (entry && entry.materials[M]) || null;
    }
    job.result = { stage: "writing", slides: [], caption: "" };
    const { slides, caption } = await writeSlides(topic, count, note, sourceText, { previous, lang });
    const carousel = { slides, caption, count: slides.length, notes: note, template: tpl, sent: {}, ...(mode === "text" ? { draft: true } : {}), lang };
    if (mode === "text") {
      await saveMaterial(M, topic, carousel).catch(() => {});
      return { stage: "done", ...carousel };
    }
    job.result = { stage: "drawing", ...carousel };
    await saveMaterial(M, topic, carousel).catch(() => {});
    await drawSlides(topic, slides, note, () => {
      job.result = { stage: "drawing", ...carousel, slides: slides.map((x) => ({ ...x })) };
    }, tpl, lang);
    await saveMaterial(M, topic, carousel).catch(() => {});
    return { stage: "done", ...carousel };
  },

  // Redraw one slide (num) or every slide still without an image
  // ("missing"); with `edit`, change only that slide as the editor asks.
  async carousel_slide(job, { topic, num, edit, lang: asked }) {
    const lang = langOf(asked);
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials[materialOf("carousel", lang)];
    if (!saved) throw new Error("no carousel saved for this topic");
    const carousel = { slides: saved.slides.map((x) => ({ ...x })), caption: saved.caption, count: saved.count, notes: saved.notes || "", template: templateOf(saved.template).id, sent: saved.sent || {}, lang };
    if (num === "missing") await drawSlides(topic, carousel.slides, carousel.notes, () => {}, carousel.template, lang);
    else if (edit && String(edit).trim()) await editSlide(topic, carousel.slides, num, edit, lang);
    else await redrawSlide(topic, carousel.slides, num, carousel.notes, carousel.template, lang);
    await saveMaterial(materialOf("carousel", lang), topic, carousel);
    return { stage: "done", ...carousel };
  },

  async carousel_send(job, { topic, target, lang }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials[materialOf("carousel", lang)];
    if (!saved) throw new Error("no carousel saved for this topic");
    const r = await sendCarousel(saved, target === "public" ? "public" : "review");
    const sent = { ...(saved.sent || {}), [target === "public" ? "public" : "review"]: Date.now() };
    await saveMaterial(materialOf("carousel", lang), topic, {
      slides: saved.slides, caption: saved.caption, count: saved.count, notes: saved.notes || "", sent, lang: langOf(lang),
    }).catch(() => {});
    return { sent, ...r };
  },

  // Fact story: text first, then the screenshots of the original source
  // (taken only now, for this topic), then each page is drawn. Saved after
  // every stage so a restart keeps what was done.
  async story(job, { topic, count, notes, revise, bg, template, lang: asked }) {
    const lang = langOf(asked);
    const M = materialOf("story", lang);
    if (!storyEnabled()) throw new Error("stories need HCTI_USER_ID and HCTI_API_KEY on the server");
    await setStatus(topic, "active").catch(() => {});
    const note = String(notes || "").slice(0, 1500);
    // A provincial draw is told and photographed from the province's own
    // page, not the news site that reported it.
    const official = await officialDrawSource(topic).catch(() => null);
    const shotTopic = official ? { ...topic, source_url: official.url, source_name: official.name } : topic;
    const sourceText = official ? official.text : await sourceTextFor(topic);
    if (!sourceText || sourceText.length < 60) throw new Error("no source text to build the story from");
    const entry = await getEntry(keyOf(topic)).catch(() => null);
    const saved = (entry && entry.materials[M]) || null;
    job.result = { stage: "writing", pages: [], caption: "" };
    const hint = official ? `The source text is ${official.name}'s own results page. Page 1 quotes the line for this draw exactly as written there: ${official.evidence}` : "";
    const written = await writeStory(topic, count, [hint, note].filter(Boolean).join("\n"), sourceText, revise ? saved : null, lang);
    const story = {
      pages: written.pages,
      caption: written.caption,
      count: written.pages.length,
      notes: note,
      sent: {},
      bg: String(bg || (saved && saved.bg) || "purple"),
      template: cleanTemplate(template || (saved && saved.template)),
      // «خبر فوری» would be wrong on an explainer; the template says «نکته مهم».
      evergreen: !!topic.evergreen,
      date: String(topic.date || topic.published || "").slice(0, 10),
      // The same source: its earlier screenshots are reused.
      masthead_url: (saved && saved.masthead_url) || "",
      source_label: official ? "" : (saved && saved.source_label) || "",
      lang,
    };
    job.result = { stage: "screenshots", ...story };
    if (official) story.source_url = official.url;
    await captureShots(shotTopic, story, (saved && saved.source_url || "") === (story.source_url || "") ? (saved && saved.pages) || [] : []);
    // A template with a photo: an AI picture of the subject per page.
    if (templateMeta(story.template).photo) {
      job.result = { stage: "photos", ...story };
      await fillStoryPhotos(topic, story, templateMeta(story.template));
    }
    job.result = { stage: "drawing", ...story };
    await saveMaterial(M, topic, story).catch(() => {});
    await drawStory(story, () => {
      job.result = { stage: "drawing", ...story, pages: story.pages.map((p) => ({ ...p })) };
    });
    await saveMaterial(M, topic, story).catch(() => {});
    return { stage: "done", ...story };
  },

  // Draw again the pages without an image (a page that failed to render),
  // or every page in a new background colour or template. The text stays as it is.
  async story_draw(job, { topic, bg, template, lang }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials[materialOf("story", lang)];
    if (!saved) throw new Error("no story saved for this topic");
    const story = { ...saved, pages: saved.pages.map((p) => ({ ...p })) };
    const tpl = template ? cleanTemplate(template) : cleanTemplate(saved.template);
    if ((bg && bg !== saved.bg) || tpl !== cleanTemplate(saved.template)) {
      if (bg) story.bg = String(bg);
      story.template = tpl;
      for (const p of story.pages) p.image_url = "";
    }
    if (templateMeta(story.template).photo && story.pages.some((p) => !p.photo_url)) {
      job.result = { stage: "photos", ...story };
      await fillStoryPhotos(topic, story, templateMeta(story.template));
      for (const p of story.pages) if (p.photo_url) p.image_url = "";
    }
    job.result = { stage: "drawing", ...story };
    await drawStory(story, () => {
      job.result = { stage: "drawing", ...story, pages: story.pages.map((p) => ({ ...p })) };
    });
    await saveMaterial(materialOf("story", lang), topic, story);
    return { stage: "done", ...story };
  },

  // A page's picture in a template that has one: made again by the AI
  // (with the team's note), or replaced by a picture they uploaded (`url`,
  // from /api/story/upload). Only that page is drawn again.
  async story_photo(job, { topic, num, note, url, lang }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials[materialOf("story", lang)];
    if (!saved) throw new Error("no story saved for this topic");
    const story = { ...saved, pages: saved.pages.map((p) => ({ ...p })) };
    const pg = story.pages.find((p) => p.num === Number(num));
    if (!pg) throw new Error("no such page");
    const meta = templateMeta(story.template);
    if (url) {
      if (!/^https?:\/\//.test(String(url))) throw new Error("bad picture link");
      pg.photo_url = String(url);
      pg.photo_note = "";
    } else {
      pg.photo_url = await makeStoryPhoto(topic, pg, { shape: meta.photo || "portrait", look: meta.look, note });
      pg.photo_note = String(note || "").slice(0, 300);
    }
    pg.photo_error = "";
    const keep = story.pages.map((p) => p.image_url);
    pg.image_url = "";
    try {
      await drawStory(story);
    } catch (e) {
      story.pages.forEach((p, i) => p !== pg && (p.image_url = keep[i]));
      throw e;
    }
    await saveMaterial(materialOf("story", lang), topic, story);
    return { stage: "done", ...story };
  },

  // One page changed from its pencil: typed text or an instruction; only
  // that page is drawn again.
  // `manual`: the page's hand-drawn layout (or null to go back to the automatic one); then only
  // that page is drawn again, its words unchanged.
  async story_page(job, { topic, num, headline, body, instruction, manual, lang }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials[materialOf("story", lang)];
    if (!saved) throw new Error("no story saved for this topic");
    const story = { ...saved, pages: saved.pages.map((p) => ({ ...p })) };
    if (manual !== undefined) {
      const pg = story.pages.find((p) => p.num === Number(num));
      if (!pg) throw new Error("no such page");
      const m = cleanPageManual(manual);
      if (m) pg.manual = m;
      else delete pg.manual;
      pg.image_url = "";
      await drawStory(story);
      await saveMaterial(materialOf("story", lang), topic, story);
      return { stage: "done", ...story };
    }
    await editStoryPage(topic, story, num, { headline, body, instruction });
    await saveMaterial(materialOf("story", lang), topic, story);
    return { stage: "done", ...story };
  },

  async story_send(job, { topic, target, lang }) {
    const entry = await getEntry(keyOf(topic));
    const saved = entry && entry.materials[materialOf("story", lang)];
    if (!saved) throw new Error("no story saved for this topic");
    const where = target === "public" ? "public" : "review";
    const r = await sendStory(saved, where);
    const sent = { ...(saved.sent || {}), [where]: Date.now() };
    await saveMaterial(materialOf("story", lang), topic, { ...saved, sent }).catch(() => {});
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

// The saved news post, without the record's bookkeeping fields.
async function savedPost(topic, lang) {
  const entry = await getEntry(keyOf(topic)).catch(() => null);
  const m = (entry && entry.materials[materialOf("telegram", lang)]) || {};
  const { text = "", link = null, image_url = "", kept = "", notes = "", sent = 0, sent_to = "", image_edits = [] } = m;
  return { text, link, image_url, kept, notes, sent, sent_to, image_edits };
}

// The English version of each step is its own job kind ("carousel@en"), so the Persian and the
// English one of the same topic can run side by side and the page tells them apart.
export const LANG_KINDS = ["article", "publish", "telegram_write", "telegram_save", "telegram_image", "telegram_send", "carousel", "carousel_slide", "carousel_send", "story", "story_draw", "story_photo", "story_page", "story_send"];
for (const k of LANG_KINDS) runners[k + "@en"] = (job, payload) => runners[k](job, { ...payload, lang: "en" });

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
