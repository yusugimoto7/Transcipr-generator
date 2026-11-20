// Remakes of the page's own best posts (Hamed, Nov 19 2026, option 3 of "how can we have better
// ideas": «گزینه سوم رو فعلا فعال کن»). The voice study already keeps every carousel and the last
// hundred videos of @sugimotovisa on editing-data (voice/carousels, voice/videos, lib/voice-study.js)
// with their words and counts; the posts that did best are offered again, and one tap makes a
// topic card that tells the same subject from the same angle for today.
//
// Grounding: the old post is our own words, so its subject, angle and examples may be reused, but
// a rule, number or date in it may be out of date. When the post rests on rules or figures, current
// pages from the trusted sites are found and read here, and the card (and every later step, through
// the editor's note) takes such facts from them only. A post about the migrant's mind (fear, regret,
// money) needs no current page.

import { list, get, put } from "./editing/store.js";
import { openaiEnabled, openaiScript, openaiSearch, openaiJson } from "./openai.js";
import { buildCustomTopic, parseLinks } from "./custom-news.js";
import { trustedHosts } from "./supplement.js";
import { loadSources } from "./sources.js";

const MADE = "remakes/made.json";
const JUDGED = "remakes/judged.json";
const TTL = 6 * 3600e3;
let cached = null; // { at, posts }

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const engagement = (p) => (Number(p.likes) || 0) + 3 * (Number(p.comments) || 0);

function textOf(p) {
  // what the video says first: its caption is often only the call to comment or the contact line
  if (p.kind === "video") return [p.transcript, p.caption ? `Caption: ${p.caption}` : ""].filter(Boolean).join("\n\n");
  return [...(p.slides || []).map((s, i) => `[${i + 1}] ${s.text || ""}`), p.caption ? `Caption: ${p.caption}` : ""].filter(Boolean).join("\n");
}

// The cover line a person recognises the post by: a carousel's first slide with words, a video's
// caption. Lines that only carry the office's phone numbers, links, handles or hashtags are skipped
// (Hamed, Nov 19 2026: a video was listed as «📞 0017789244581 تماس دفتر ایران…», a carousel whose
// first slide is a photo as an empty row); with nothing left, what the video says.
function usefulLine(text) {
  return String(text || "")
    .split(/\n+/)
    .map(clean)
    .find((l) => {
      const words = l.replace(/https?:\S+|www\.\S+|[@#]\S+|[+\d][\d\s().-]{6,}\d/g, "").replace(/[^\p{L}\s]/gu, "").trim();
      return words.length >= 12 && !/تماس|واتس[‌ ]?اپ|whatsapp|call us|☎|📞/i.test(l);
    }) || "";
}
function coverOf(p) {
  const pick =
    p.kind === "video"
      ? usefulLine(p.caption) || usefulLine(p.transcript)
      : (p.slides || []).map((s) => usefulLine(s.text)).find(Boolean) || usefulLine(p.caption);
  return pick.slice(0, 160);
}

async function loadPosts() {
  if (cached && Date.now() - cached.at < TTL) return cached.posts;
  const [cs, vs] = await Promise.all([list("voice/carousels/").catch(() => []), list("voice/videos/").catch(() => [])]);
  const posts = [
    ...cs.map((x) => ({ ...x.data, kind: "carousel" })),
    ...vs.map((x) => ({ ...x.data, kind: "video" })),
  ]
    .filter((p) => p && p.id)
    .map((p) => ({
      id: String(p.id),
      kind: p.kind,
      permalink: p.permalink || "",
      date: String(p.timestamp || "").slice(0, 10),
      likes: p.likes ?? null,
      comments: p.comments ?? null,
      views: p.views ?? null,
      slides: p.kind === "carousel" ? (p.slides || []).length : 0,
      cover: coverOf(p),
      text: textOf(p).slice(0, 6000),
      score: engagement(p),
    }))
    // a post with almost no words (a photo, a greeting) has nothing to remake
    .filter((p) => p.text.replace(/\[\d+\]/g, "").trim().length >= 80)
    .sort((a, b) => b.score - a.score);
  cached = { at: Date.now(), posts };
  return posts;
}

async function madeMap() {
  const r = await get(MADE).catch(() => null);
  return (r && r.data) || {};
}

async function markMade(id, info) {
  for (let i = 0; i < 3; i++) {
    const cur = await get(MADE).catch(() => null);
    try {
      await put(MADE, { ...((cur && cur.data) || {}), [id]: info }, cur ? cur.sha : null, "remake: " + id);
      return;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
}

// Which posts are worth making again (Hamed, Nov 20 2026, on the first list: «یه سریاش بسیار بیربطن»:
// it led with the page's own "comment مشاوره" calls, its contact details and a client's story). A model
// reads each post once and keeps only those that teach something about immigration that can be told
// again today, naming each by its subject in one Persian line (the list's title, instead of whatever the
// caption opened with). Verdicts are kept on editing-data (remakes/judged.json), so a post is read once.
let judging = null;
async function judgedMap() {
  const r = await get(JUDGED).catch(() => null);
  return { data: (r && r.data) || {}, sha: r ? r.sha : null };
}
async function judge(posts) {
  const cur = await judgedMap();
  const todo = posts.filter((p) => !cur.data[p.id]).slice(0, 80);
  if (!todo.length || !openaiEnabled()) return cur.data;
  const batches = [];
  for (let i = 0; i < todo.length; i += 20) batches.push(todo.slice(i, i + 20));
  const got = {};
  await Promise.all(
    batches.map(async (b) => {
      const prompt = `These are posts from @sugimotovisa, a Persian-language Canadian / European immigration consultancy's Instagram page. We want to make the GOOD ones again for today. For each post decide "keep":
- true: it teaches or explains something about immigration a viewer can use: a rule, programme, process, deadline, document, common mistake, a court decision or refusal reason, numbers, a choice a migrant faces, or a real problem of living as a migrant (money, work, family, study) with substance.
- false: a call to comment or DM / book a consultation, contact details or office hours, a client's success or testimonial, a greeting or holiday post, a team or event announcement, a draw result, pure motivation with no immigration substance, or too little text to tell what it says.
"title_fa": what the post teaches, in one short Persian line (at most 12 words), naming its subject, not its call to action. "" when keep is false.

Return JSON only: {"posts":[{"id":"","keep":true,"title_fa":""}]}

POSTS:
${b.map((p) => `### id ${p.id} (${p.kind}, ${p.date})\n${p.text.replace(/\s+/g, " ").slice(0, 900)}`).join("\n\n")}`;
      const r = await openaiJson(prompt).catch(() => null);
      for (const x of (r && Array.isArray(r.posts) ? r.posts : [])) {
        const id = String((x && x.id) || "");
        if (!b.some((p) => p.id === id)) continue;
        got[id] = { keep: !!x.keep, title_fa: clean(x.title_fa).slice(0, 120), at: Date.now() };
      }
    })
  );
  if (!Object.keys(got).length) return cur.data;
  for (let i = 0; i < 3; i++) {
    const now = i ? await judgedMap() : cur;
    try {
      await put(JUDGED, { ...now.data, ...got }, now.sha, "remakes: judged " + Object.keys(got).length);
      return { ...now.data, ...got };
    } catch (_) {
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  return { ...cur.data, ...got };
}

// The best posts not remade yet, and the ones that were.
export async function bestOwnPosts({ limit = 40 } = {}) {
  const [posts, made] = await Promise.all([loadPosts(), madeMap()]);
  const fresh = posts.filter((p) => !made[p.id]);
  // the best 120 are judged (once each); a list read while a judgement runs waits for it
  const pool = fresh.slice(0, 120);
  if (!judging) judging = judge(pool).finally(() => (judging = null));
  const verdicts = await judging.catch(() => ({}));
  const anyJudged = pool.some((p) => verdicts[p.id]);
  const kept = anyJudged ? pool.filter((p) => verdicts[p.id] && verdicts[p.id].keep).map((p) => ({ ...p, cover: verdicts[p.id].title_fa || p.cover })) : pool;
  const strip = ({ text, ...p }) => p;
  return {
    judged: anyJudged,
    posts: kept.slice(0, limit).map(strip),
    made: posts.filter((p) => made[p.id]).slice(0, 20).map((p) => ({ ...strip(p), made: made[p.id] })),
    total: posts.length,
    carousels: posts.filter((p) => p.kind === "carousel").length,
    videos: posts.filter((p) => p.kind === "video").length,
  };
}

function parseJson(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  try {
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

// One of the page's own posts -> today's topic card on the same subject and angle.
export async function remakePost(id) {
  if (!openaiEnabled()) throw new Error("remakes need the writing model (USE_OPENAI + OPENAI_API_KEY)");
  await loadSources();
  const post = (await loadPosts()).find((p) => p.id === String(id));
  if (!post) throw new Error("this post is not in the voice study");
  const what = parseJson(
    await openaiScript(`This is one of our own Instagram posts (a Persian-language Canadian / European immigration brand) that did very well. We want to make it again for today.

POST (${post.kind}, ${post.date}):
"""
${post.text}
"""

Return JSON only:
{"subject_fa": "its subject in one short Persian line",
 "angle_fa": "its angle or point of view in one Persian line (what made it land)",
 "rests_on_rules": true if it states immigration rules, programmes, fees, figures, dates or deadlines that may have changed since; false if it is about the migrant's mind, choices or experience,
 "search_en": "if rests_on_rules: one English web search query for today's official facts on exactly this subject; else empty"}`)
  );
  if (!what || !what.subject_fa) throw new Error("the post could not be read; try again");
  let links = [];
  if (what.rests_on_rules && what.search_en) {
    const { text, citations } = await openaiSearch(`Find 2 to 4 current web pages with today's facts for this, for a licensed Canadian / European immigration firm's post. Use only these sites: ${trustedHosts().join(", ")}; official government pages first.

SUBJECT: ${what.subject_fa}
SEARCH FOR: ${what.search_en}

Answer with a JSON array only: [{"url": "...", "why": "one line"}]. Real URLs you actually found, no others.`).catch(() => ({ text: "", citations: [] }));
    const fromJson = (() => {
      const m = String(text || "").match(/\[[\s\S]*\]/);
      try {
        return m ? JSON.parse(m[0]).map((x) => x && x.url) : [];
      } catch {
        return [];
      }
    })();
    links = parseLinks([...fromJson, ...(citations || []).map((c) => c.url)].filter(Boolean).join("\n"), 4);
    if (!links.length) throw new Error("no current page was found to bring this post's rules and figures up to date, so no card was made");
  }
  const when = post.date || "an earlier year";
  const counts = [post.likes != null ? `${post.likes} likes` : "", post.comments != null ? `${post.comments} comments` : "", post.views ? `${post.views} views` : ""].filter(Boolean).join(", ");
  const note = `A remake of our own ${post.kind} from ${when} that did very well (${counts}). Same subject (${clean(what.subject_fa)}) and the same angle (${clean(what.angle_fa)}), told for today in our voice.${
    what.rests_on_rules
      ? " The old post's rules, numbers and dates may be out of date: every rule, number and date must come from the current pages; anything only the old post says is left out."
      : ""
  }`;
  const { topic, skipped } = await buildCustomTopic({
    links: links.join("\n"),
    videos: [{ name: `Our own ${post.kind} from ${when}`, text: post.text }],
    note,
    whole: true,
  });
  const card = {
    ...topic,
    researched: true,
    idea: clean(what.subject_fa),
    remake: { id: post.id, kind: post.kind, permalink: post.permalink, date: post.date, likes: post.likes, comments: post.comments, views: post.views, cover: post.cover },
  };
  // the post's words went in like an uploaded video's (buildCustomTopic): only a video is one
  if (post.kind !== "video") {
    delete card.video;
    delete card.videos_count;
  }
  await markMade(post.id, { at: new Date().toISOString(), title_fa: card.title_fa }).catch(() => {});
  return { topics: [card], skipped };
}
