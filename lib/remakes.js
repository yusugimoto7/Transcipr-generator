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
import { openaiEnabled, openaiScript, openaiSearch } from "./openai.js";
import { buildCustomTopic, parseLinks } from "./custom-news.js";
import { trustedHosts } from "./supplement.js";
import { loadSources } from "./sources.js";

const MADE = "remakes/made.json";
const TTL = 6 * 3600e3;
let cached = null; // { at, posts }

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const engagement = (p) => (Number(p.likes) || 0) + 3 * (Number(p.comments) || 0);

function textOf(p) {
  if (p.kind === "video") return [p.caption, p.transcript].filter(Boolean).join("\n\n");
  return [...(p.slides || []).map((s, i) => `[${i + 1}] ${s.text || ""}`), p.caption ? `Caption: ${p.caption}` : ""].filter(Boolean).join("\n");
}

// The cover line a person recognises the post by: a carousel's first slide, a video's caption.
function coverOf(p) {
  const first = p.kind === "video" ? p.caption : ((p.slides || [])[0] || {}).text || p.caption;
  return clean(first).slice(0, 140);
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

// The best posts not remade yet, and the ones that were.
export async function bestOwnPosts({ limit = 40 } = {}) {
  const [posts, made] = await Promise.all([loadPosts(), madeMap()]);
  const fresh = posts.filter((p) => !made[p.id]);
  const strip = ({ text, ...p }) => p;
  return {
    posts: fresh.slice(0, limit).map(strip),
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
