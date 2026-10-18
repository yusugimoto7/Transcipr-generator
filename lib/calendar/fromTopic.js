// Turning what was made from a Topic Engine topic into a calendar card: the carousel, the story,
// the English video, the blog article or the scripts. The card starts as a draft in the market's
// board, with the caption and the files filled in from what was made; it is posted only after
// Hamed approves it there, like every other card.

import { list } from "../editing/store";
import { getEntry, keyOf } from "../workspace";
import { listBoards, getBoard, addCard, postStatus, HttpError, MAX_MEDIA } from "./model";

export const MADE = {
  carousel: { name: "Carousel", label: "Carousel", list: "Hamed check" },
  story: { name: "Story", label: "Story", list: "Hamed check" },
  video: { name: "English video", label: "Reel", list: "Hamed check" },
  article: { name: "Blog article", label: "General", list: "Hamed check" },
  script: { name: "Script to record", label: "Video Hamed", list: "Hamed: to record" },
};

// Instagram takes JPEG only; the story renderer gives the same picture as JPEG when asked.
function jpeg(url) {
  return /^https:\/\/hcti\.io\/v1\/image\/[A-Za-z0-9-]+$/.test(url) ? url + ".jpg" : url;
}

const https = (u) => /^https:\/\/\S+$/i.test(String(u || ""));

// What of the topic exists, and whether it can become a card (and why not).
export function madeFrom(entry) {
  const m = (entry && entry.materials) || {};
  const out = {};
  const slides = ((m.carousel && m.carousel.slides) || []).filter((s) => https(s.image_url));
  if (m.carousel) out.carousel = slides.length ? { ok: true, count: slides.length } : { ok: false, why: "the slides have no pictures yet" };
  const pages = ((m.story && m.story.pages) || []).filter((p) => https(p.image_url));
  if (m.story) out.story = pages.length ? { ok: true, count: pages.length } : { ok: false, why: "the pages are not drawn yet" };
  if (m.video) out.video = https(m.video.video_url) ? { ok: true } : { ok: false, why: m.video.status === "failed" ? "the video failed" : "the video is not ready yet" };
  if (m.article && m.article.article) out.article = { ok: true };
  if (m.script && (m.script.script_fa || m.script.script_en)) out.script = { ok: true };
  return out;
}

function cardBody(entry, made) {
  const t = entry.topic;
  const m = entry.materials;
  const title = t.title_fa || t.title_en;
  const src = t.source_url ? `\n\nSource: ${t.source_url}` : "";
  const base = { title: `${MADE[made].name}: ${title}`.slice(0, 200), caption: "", description: "", media: { kind: "none", url: "" }, channels: {} };
  if (made === "carousel") {
    const slides = m.carousel.slides.filter((s) => https(s.image_url)).slice(0, MAX_MEDIA);
    return {
      ...base, caption: m.carousel.caption || "",
      media: { items: slides.map((s) => ({ kind: "image", url: s.image_url })) },
      channels: { instagram: { on: true, format: "post" } },
      description: `Carousel of ${slides.length} slides made in the Topic Engine.${src}`,
    };
  }
  if (made === "story") {
    const pages = m.story.pages.filter((p) => https(p.image_url)).slice(0, MAX_MEDIA);
    return {
      ...base, caption: m.story.caption || "",
      media: { items: pages.map((p) => ({ kind: "image", url: jpeg(p.image_url) })) },
      channels: { instagram: { on: true, format: "story" } },
      description: `Story of ${pages.length} page${pages.length > 1 ? "s" : ""} made in the Topic Engine. Stories carry no caption on Instagram.${src}`,
    };
  }
  if (made === "video") {
    return {
      ...base,
      media: { kind: "video", url: m.video.video_url },
      channels: { instagram: { on: true, format: "reel" } },
      description: `English video made in the Topic Engine. The video service's links can expire: post it within a few days, or put the file on Drive and use that link.${src}`,
    };
  }
  if (made === "article") {
    const a = m.article.article;
    return {
      ...base,
      caption: [a.title_fa, a.excerpt || a.meta_description].filter(Boolean).join("\n\n"),
      description: `Blog article written in the Topic Engine${a.focus_keyword ? ` (keyword: ${a.focus_keyword})` : ""}. Add the article's link to the caption once it is published on the site.${src}`,
    };
  }
  // script: a planning card for Hamed to record from
  const s = m.script;
  return {
    ...base,
    description: [s.script_fa && `Farsi script:\n${s.script_fa}`, s.script_en && `English script:\n${s.script_en}`].filter(Boolean).join("\n\n") + src,
  };
}

export async function cardsForTopic(key) {
  const out = [];
  for (const { data: b } of await list("calendar/boards/")) {
    if (b.removed_at) continue;
    for (const c of b.cards) {
      if (c.source && c.source.type === "topic" && c.source.key === key) {
        out.push({ board_id: b.id, board: b.name, id: c.id, title: c.title, made: c.source.made || "", publish_at: c.publish_at, status: postStatus(c) });
      }
    }
  }
  return out;
}

export async function topicCalendar(user, key) {
  const entry = await getEntry(key);
  if (!entry) throw new HttpError(404, "this topic has nothing saved yet");
  const boards = await listBoards(user);
  const suggested = boards.find((b) => b.name.toLowerCase() === (entry.topic.page === "EU" ? "eu" : "canada")) || boards[0];
  return { made: madeFrom(entry), cards: await cardsForTopic(key), boards: boards.map((b) => ({ id: b.id, name: b.name })), suggested_board: suggested ? suggested.id : "" };
}

export async function addFromTopic(user, { key, made, board_id, publish_at, again = false }) {
  if (!MADE[made]) throw new HttpError(400, "unknown kind");
  const entry = await getEntry(String(key || ""));
  if (!entry) throw new HttpError(404, "this topic has nothing saved yet");
  const can = madeFrom(entry)[made];
  if (!can) throw new HttpError(400, `this topic has no ${MADE[made].name.toLowerCase()} yet`);
  if (!can.ok) throw new HttpError(400, can.why);
  if (!again) {
    const dup = (await cardsForTopic(entry.key)).find((c) => c.made === made);
    if (dup) throw new HttpError(409, `already in the calendar (${dup.board})`);
  }
  const { suggested_board } = await topicCalendar(user, entry.key);
  const board = await getBoard(board_id || suggested_board);
  const body = cardBody(entry, made);
  const target = board.lists.find((l) => l.name === MADE[made].list) || board.lists[0];
  const label = board.labels.find((l) => l.name === MADE[made].label);
  // One board for everything: the market is a label too.
  const market = board.labels.find((l) => l.name.toLowerCase() === (entry.topic.page === "EU" ? "eu" : "canada"));
  const channels = {};
  for (const [k, v] of Object.entries(body.channels)) channels[k] = { custom: false, caption: "", ...v };
  return addCard(user, board.id, {
    ...body,
    channels,
    list_id: target.id,
    labels: [label, market].filter(Boolean).map((l) => l.id),
    publish_at: publish_at || null,
    source: { type: "topic", key: entry.key, title: entry.topic.title_fa || entry.topic.title_en, url: entry.topic.source_url || "", made },
  });
}

export { keyOf };
