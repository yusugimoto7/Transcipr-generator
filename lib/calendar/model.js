// Content calendar: Trello-style boards (one per market), lists, labels and cards, shared by the
// whole team. Stored on the same editing-data branch as Video Editing (lib/editing/store.js), one
// file per board, so a move is one small write and two people moving cards at once are merged by
// the store's read-change-write retry.
//
//   calendar/boards/<board id>.json     { id, name, lists, labels, cards, created_at }
//   calendar/comments/<card id>.json    { items: [{ id, type, by, text, at }] }
//   calendar/archive/<board id>.json    { cards } archived cards, out of the way of the board
//
// Everyone signed in may add, edit and move cards. Only the admin (Hamed) approves a card for
// publishing, publishes it, and edits lists and labels: nothing reaches Instagram, TikTok or any
// other channel without his approval of that exact content.

import crypto from "crypto";
import { IG_ACCOUNTS } from "./igAccounts";
import { publishStateOf } from "./publishState";
import { get, put, update, list, newId } from "../editing/store";
import { TRELLO_LABELS, COVER_COLORS, FILLED_LIST_COLORS } from "./palette";
import { notifyLater, adminIds } from "../push";

// Where a tap on a post's notification opens (lib/push).
const cardUrl = (boardId, cardId) => `/calendar?board=${boardId}&card=${cardId}`;
const cardName = (c) => String((c && c.title) || "").slice(0, 120);

export const CHANNELS = {
  instagram: { name: "Instagram", needs: "video or image", caption: 2200 },
  tiktok: { name: "TikTok", needs: "video", caption: 2200 },
  youtube: { name: "YouTube", needs: "video", caption: 5000 },
  linkedin: { name: "LinkedIn page", needs: "text, image or video", caption: 3000 },
  x: { name: "X", needs: "text, image or video", caption: 280 },
};

// Instagram: a Reel (one video), a feed post (one image or a carousel of up to 10) or Stories
// (each image or video becomes its own story). X takes up to 4 images.
export const IG_FORMATS = ["reel", "post", "story"];
export { IG_ACCOUNTS };
export const MAX_MEDIA = 10;
export const X_MAX_IMAGES = 4;

export const LABEL_COLORS = {
  sky: "#5aa9e6", orange: "#f28c28", yellow: "#e9c46a", purple: "#9b7fd4", green: "#4caf7a",
  red: "#e5484d", pink: "#e86fa8", lime: "#94c94b", gray: "#8b95a3", navy: "#2f5d9b",
  ...TRELLO_LABELS,
};

const DEFAULT_LISTS = [
  ["Ideas", ""], ["Copywriting", ""], ["Hamed: to record", ""], ["Design / video edit", ""],
  ["Final check", ""], ["Hamed check", ""], ["Approved & scheduled", "scheduled"], ["Published", "published"],
];
const DEFAULT_LABELS = [
  ["Reel", "sky"], ["Carousel", "orange"], ["Story", "yellow"], ["General", "purple"],
  ["Testimonial", "pink"], ["Campaign", "red"], ["Video Hamed", "navy"], ["Reusable", "lime"],
  // The market is a label, not a board: one board holds everything (the team's decision).
  ["Canada", "red"], ["EU", "green"],
];
const BOARD_NAME = "Content calendar";
const MARKET_LABELS = [["Canada", "red"], ["EU", "green"]];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isAdmin = (u) => u && u.role === "admin";
const boardPath = (id) => `calendar/boards/${id}.json`;
const ID = /^[a-z]-[a-f0-9]{12}$/;
export function checkId(v) {
  if (!ID.test(String(v || ""))) throw new HttpError(404, "not found");
  return v;
}

function newBoard(name, by) {
  return {
    id: newId("b"),
    name: String(name).trim().slice(0, 60),
    lists: DEFAULT_LISTS.map(([n, role], i) => ({ id: newId("l"), name: n, role, pos: (i + 1) * 1000 })),
    labels: DEFAULT_LABELS.map(([n, color]) => ({ id: newId("t"), name: n, color })),
    cards: [],
    created_at: Date.now(),
    created_by: by,
  };
}

// One board for everything. Boards made before that decision (Canada, EU, Mocko…) are folded
// into the oldest one: their cards move over keeping every field, each gets a label with its old
// board's name, and the old board is only hidden (removed_at), never deleted. Safe to run twice.
async function consolidate(user, live) {
  const sorted = live.slice().sort((a, b) => a.created_at - b.created_at || a.name.localeCompare(b.name));
  const main = sorted[0];
  const others = sorted.slice(1);
  const wasMarket = /^(canada|eu|europe|mocko|mako)$/i.test(main.name);
  await update(boardPath(main.id), (m) => {
    const labels = m.labels.slice();
    const need = (name, color) => {
      let l = labels.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!l) {
        l = { id: newId("t"), name, color };
        labels.push(l);
      }
      return l;
    };
    for (const [n, c] of MARKET_LABELS) need(n, c);
    let cards = m.cards;
    // The oldest board was itself a market: its own cards get that market's label.
    if (wasMarket && others.length) {
      const own = need(main.name, "gray");
      cards = cards.map((c) => ((c.labels || []).includes(own.id) ? c : { ...c, labels: [...(c.labels || []), own.id] }));
    }
    const have = new Set(cards.map((c) => c.id));
    const moved = [];
    for (const src of others) {
      const market = need(src.name, src.name.toLowerCase() === "eu" ? "green" : "gray");
      for (const c of src.cards) {
        if (have.has(c.id)) continue;
        const from = src.lists.find((l) => l.id === c.list_id);
        const into = (from && m.lists.find((l) => l.name === from.name)) || m.lists[0];
        const ids = (c.labels || []).map((id) => {
          const old = src.labels.find((l) => l.id === id);
          return old ? need(old.name, old.color).id : null;
        });
        moved.push({ ...c, board_id: m.id, list_id: into.id, labels: [...new Set([...ids.filter(Boolean), market.id])] });
      }
    }
    return { ...m, name: wasMarket || others.length ? BOARD_NAME : m.name, labels, cards: [...cards, ...moved] };
  }, "calendar: one board for everything");
  for (const src of others) {
    await update(boardPath(src.id), (b) => ({ ...b, removed_at: Date.now(), removed_by: user.id }), `calendar: folded board ${src.name} into the main board`);
  }
}

export async function listBoards(user) {
  let all = (await list("calendar/boards/")).map((x) => x.data);
  // The first visit of anyone creates the board, so nobody waits for the admin.
  if (!all.length) {
    const b = newBoard(BOARD_NAME, user.id);
    await put(boardPath(b.id), b, null, `calendar: board ${b.name}`);
    all = [b];
  }
  // Removed boards stay stored (their cards and history), out of every view.
  let boards = all.filter((b) => !b.removed_at);
  if (boards.length > 1) {
    await consolidate(user, boards);
    boards = (await list("calendar/boards/")).map((x) => x.data).filter((b) => !b.removed_at);
  }
  boards = boards.slice(0, 1);
  return boards
    .sort((a, b) => a.created_at - b.created_at || a.name.localeCompare(b.name))
    .map((b) => ({ id: b.id, name: b.name, cards: b.cards.length, scheduled: b.cards.filter((c) => c.publish_at).length }));
}

// There is one board for everything (the team's decision); markets and kinds are labels.
export async function createBoard() {
  throw new HttpError(409, "There is one board for everything. Use labels (Canada, EU, Reel…) to tell posts apart.");
}

// Removing a board hides it for everyone; nothing is deleted (the store keeps the file, so a
// mistake can be undone by clearing removed_at). A board with an approved post still to go out
// cannot be removed: that post would silently never be published.
export async function removeBoard(user, id) {
  if (!isAdmin(user)) throw new HttpError(403, "only the admin removes boards");
  let removed;
  await update(boardPath(checkId(id)), (b) => {
    const waiting = b.cards.filter((c) => {
      const on = Object.keys(CHANNELS).filter((k) => c.channels && c.channels[k] && c.channels[k].on);
      const left = on.filter((k) => !((c.publish || {})[k] && c.publish[k].status === "published"));
      return approvalValid(c) && c.publish_at && left.length;
    });
    if (waiting.length) throw new HttpError(409, `“${b.name}” has ${waiting.length} approved post${waiting.length > 1 ? "s" : ""} still to be published; move or unapprove ${waiting.length > 1 ? "them" : "it"} first`);
    removed = { ...b, removed_at: Date.now(), removed_by: user.id };
    return removed;
  }, `calendar: remove board ${id}`);
  return removed;
}

export async function getBoard(id) {
  checkId(id);
  const rec = await get(boardPath(id));
  if (!rec) throw new HttpError(404, "board not found");
  return rec.data;
}

// Lists and labels: the admin renames, adds, reorders and removes them. A list that still holds
// cards cannot be removed.
export async function editBoard(user, id, body) {
  if (!isAdmin(user)) throw new HttpError(403, "only the admin changes lists and labels");
  return update(boardPath(checkId(id)), (b) => {
    const next = { ...b };
    if (body.name) next.name = String(body.name).trim().slice(0, 60);
    if (Array.isArray(body.lists)) {
      const keep = body.lists.map((l, i) => ({
        ...(b.lists.find((x) => x.id === l.id) || {}),
        id: l.id && b.lists.some((x) => x.id === l.id) ? l.id : newId("l"),
        name: String(l.name || "List").trim().slice(0, 60),
        role: ["scheduled", "published"].includes(l.role) ? l.role : "",
        pos: (i + 1) * 1000,
        // the colour is set from the list's own menu; this form only passes it through
        color: LIST_COLORS[l.color] ? l.color : (b.lists.find((x) => x.id === l.id) || {}).color || "",
      }));
      for (const old of b.lists) {
        if (!keep.some((l) => l.id === old.id) && b.cards.some((c) => c.list_id === old.id)) {
          throw new HttpError(409, `move the cards out of “${old.name}” before removing it`);
        }
      }
      next.lists = keep;
    }
    if (Array.isArray(body.labels)) {
      next.labels = body.labels.map((l) => ({
        id: l.id && b.labels.some((x) => x.id === l.id) ? l.id : newId("t"),
        name: String(l.name || "").trim().slice(0, 40),
        color: LABEL_COLORS[l.color] ? l.color : "gray",
      }));
      const ids = new Set(next.labels.map((l) => l.id));
      next.cards = b.cards.map((c) => ({ ...c, labels: (c.labels || []).filter((x) => ids.has(x)) }));
    }
    return next;
  }, `calendar: edit board ${id}`);
}

// ---- cards ------------------------------------------------------------------------------------

// One main caption for every network; a network can be customised with its own text. Cards made
// before the main caption existed keep their per-network text.
export function effectiveCaption(c, k) {
  const x = (c.channels || {})[k] || {};
  const custom = x.custom === undefined ? !!x.caption : x.custom;
  return custom ? x.caption || "" : c.caption || "";
}

// Where a post stands, for the publishing views (Zoho Social's tabs).
export function postStatus(c) {
  const on = Object.keys(CHANNELS).filter((k) => c.channels && c.channels[k] && c.channels[k].on);
  const pub = c.publish || {};
  const st = (k) => publishStateOf(pub[k]);
  if (on.some((k) => ["failed", "unknown", "missed"].includes(st(k)))) return "failed";
  if (on.some((k) => st(k) === "publishing")) return "publishing";
  if (on.length && on.every((k) => st(k) === "published")) return "published";
  if (approvalValid(c)) return c.publish_at ? "scheduled" : "approved";
  if (c.review) return "pending";
  return "draft";
}

// What the approval covers: the words and the media of every channel that is switched on. A
// change to any of them after approval needs a new approval; moving the card or its date does not.
export function contentHash(c) {
  const ch = {};
  for (const k of Object.keys(CHANNELS)) {
    const x = (c.channels || {})[k];
    // The Instagram page is part of what was approved; left on "by market" it adds nothing, so
    // approvals given before the choice existed stay valid.
    if (x && x.on) ch[k] = { caption: effectiveCaption(c, k), title: x.title || "", format: x.format || "", ...(k === "instagram" && x.account ? { account: x.account } : {}) };
  }
  const urls = mediaItems(c.media).map((m) => m.url);
  // A single file hashes as before, so approvals given before albums existed stay valid.
  const media = urls.length > 1 ? urls : urls[0] || "";
  return crypto.createHash("sha256").update(JSON.stringify({ ch, media })).digest("hex").slice(0, 16);
}

export function approvalValid(c) {
  return !!(c.approval && c.approval.hash === contentHash(c));
}

function cleanIso(v) {
  if (v === null || v === "") return null;
  const t = new Date(v);
  if (isNaN(t)) throw new HttpError(400, "a date is not valid");
  return t.toISOString();
}

function cleanChannels(input, prev = {}) {
  const out = {};
  for (const k of Object.keys(CHANNELS)) {
    const x = (input || {})[k] || prev[k] || {};
    out[k] = {
      on: !!x.on,
      custom: x.custom === undefined ? !!x.caption : !!x.custom,
      caption: String(x.caption || "").slice(0, CHANNELS[k].caption + 500),
      ...(k === "youtube" ? { title: String(x.title || "").slice(0, 100) } : {}),
      ...(k === "instagram" ? { format: IG_FORMATS.includes(x.format) ? x.format : "reel", account: IG_ACCOUNTS[x.account] ? x.account : "" } : {}),
    };
  }
  return out;
}

// Every file of a card, in order: one for a video or an image, several for a carousel or stories.
export function mediaItems(m) {
  if (!m) return [];
  if (Array.isArray(m.items) && m.items.length) return m.items;
  return m.url ? [{ kind: m.kind === "image" ? "image" : "video", url: m.url }] : [];
}

function cleanMedia(m) {
  const raw = m && Array.isArray(m.items) && m.items.length ? m.items : m && m.url ? [m] : [];
  if (!raw.length) return { kind: "none", url: "" };
  if (raw.length > MAX_MEDIA) throw new HttpError(400, `a post holds at most ${MAX_MEDIA} files`);
  const items = raw.map((x) => {
    const url = String(x.url || "").trim();
    if (!/^https:\/\/\S+$/i.test(url)) throw new HttpError(400, "every media link must be a full https:// link");
    // alt: what the picture says, for screen readers and Instagram (carousel slides carry their text).
    const alt = x.kind === "image" && x.alt ? String(x.alt).replace(/\s+/g, " ").trim().slice(0, 1000) : "";
    return { kind: x.kind === "image" ? "image" : "video", url, ...(alt ? { alt } : {}) };
  });
  // kind and url stay the first file's, so every place that reads one file keeps working.
  return { kind: items[0].kind, url: items[0].url, ...(items.length > 1 ? { items } : {}), project_id: (m && m.project_id) || "" };
}

const LINK_KEYS = ["docs", "canva", "final", "other"];

function applyFields(card, body, board) {
  const c = { ...card };
  if (body.title !== undefined) {
    c.title = String(body.title).trim().slice(0, 200);
    if (!c.title) throw new HttpError(400, "the card needs a title");
  }
  if (body.description !== undefined) c.description = String(body.description).slice(0, 10000);
  if (body.caption !== undefined) c.caption = String(body.caption).slice(0, 5500);
  if (body.labels !== undefined) c.labels = (body.labels || []).filter((id) => board.labels.some((l) => l.id === id));
  if (body.members !== undefined) c.members = (body.members || []).map(String).slice(0, 10);
  for (const k of ["start_at", "due_at", "publish_at"]) if (body[k] !== undefined) c[k] = cleanIso(body[k]);
  if (body.channels !== undefined) c.channels = cleanChannels(body.channels, c.channels);
  if (body.media !== undefined) c.media = cleanMedia(body.media);
  if (body.links !== undefined) {
    c.links = {};
    for (const k of LINK_KEYS) if (body.links[k]) c.links[k] = String(body.links[k]).trim().slice(0, 500);
  }
  // A cover is a colour band on the card face; the Trello import fills it, the card window sets it.
  if (body.cover !== undefined) c.cover = body.cover && COVER_COLORS[body.cover.color] ? { color: body.cover.color } : null;
  if (body.due_complete !== undefined) c.due_complete = !!body.due_complete;
  if (body.checklist !== undefined) {
    c.checklist = (body.checklist || []).slice(0, 50).map((i) => ({ id: i.id || newId("i"), text: String(i.text || "").slice(0, 200), done: !!i.done }));
  }
  if (body.list_id !== undefined) {
    if (!board.lists.some((l) => l.id === body.list_id)) throw new HttpError(400, "that list does not exist");
    c.list_id = body.list_id;
  }
  if (body.pos !== undefined) c.pos = Number(body.pos) || 0;
  return c;
}

export async function addCard(user, boardId, body) {
  let created;
  await update(boardPath(checkId(boardId)), (b) => {
    const listId = body.list_id && b.lists.some((l) => l.id === body.list_id) ? body.list_id : b.lists[0].id;
    const inList = b.cards.filter((c) => c.list_id === listId);
    const last = inList.reduce((m, c) => Math.max(m, c.pos || 0), 0);
    const first = inList.reduce((m, c) => Math.min(m, c.pos || 0), Infinity);
    const base = {
      id: newId("k"), board_id: b.id, list_id: listId, pos: body.top && inList.length ? first - 1000 : last + 1000, title: "", description: "", caption: "", review: null,
      labels: [], members: [], start_at: null, due_at: null, publish_at: null,
      channels: cleanChannels({}), media: { kind: "none", url: "" }, links: {}, checklist: [],
      source: body.source && body.source.type ? {
        type: body.source.type === "project" ? "project" : "topic",
        key: String(body.source.key || "").slice(0, 300), title: String(body.source.title || "").slice(0, 300),
        url: String(body.source.url || "").slice(0, 500),
        // which thing made from the topic this card carries (carousel, story, article, script, video)
        ...(body.source.made ? { made: String(body.source.made).slice(0, 20) } : {}),
      } : null,
      approval: null, publish: {}, created_by: user.id, created_at: Date.now(), updated_at: Date.now(), updated_by: user.id,
    };
    created = applyFields(base, { ...body, list_id: undefined, pos: undefined }, b);
    return { ...b, cards: [...b.cards, created] };
  }, `calendar: add card`);
  return created;
}

function findCard(b, cardId) {
  const c = b.cards.find((x) => x.id === cardId);
  if (!c) throw new HttpError(404, "this card was moved to the archive or removed");
  return c;
}

export async function editCard(user, boardId, cardId, body) {
  checkId(cardId);
  let out;
  await update(boardPath(checkId(boardId)), (b) => {
    const c = findCard(b, cardId);
    const anyPublished = Object.values(c.publish || {}).some((p) => p.status === "published" || p.status === "publishing");
    if (anyPublished && (body.channels !== undefined || body.media !== undefined || body.caption !== undefined)) {
      throw new HttpError(409, "this card is already (being) published; make a new card for changes");
    }
    out = { ...applyFields(c, body, b), updated_at: Date.now(), updated_by: user.id };
    return { ...b, cards: b.cards.map((x) => (x.id === cardId ? out : x)) };
  }, `calendar: edit card ${cardId}`);
  return out;
}

// Approve the content as it is now, for the channels switched on. Moves the card to the board's
// "scheduled" list when it has one.
export async function approveCard(user, boardId, cardId, on) {
  if (!isAdmin(user)) throw new HttpError(403, "only Hamed approves cards for publishing");
  let out, before;
  await update(boardPath(checkId(boardId)), (b) => {
    const c = findCard(b, checkId(cardId));
    before = c;
    if (on) {
      const chosen = Object.keys(CHANNELS).filter((k) => c.channels[k] && c.channels[k].on);
      if (!chosen.length) throw new HttpError(400, "switch on at least one channel first");
      const items = mediaItems(c.media);
      const oneVideo = items.length === 1 && items[0].kind === "video";
      const needVideo = chosen.filter((k) => ["tiktok", "youtube"].includes(k) || (k === "instagram" && c.channels.instagram.format === "reel"));
      // A post with no media yet can be approved as a plan (many cards start as an idea); what is
      // attached has to fit the networks, and publishing refuses a network that still has no file.
      if (items.length && needVideo.length && !oneVideo) throw new HttpError(400, `${needVideo.map((k) => CHANNELS[k].name).join(", ")} ${needVideo.length > 1 ? "need" : "needs"} one video`);
      if (chosen.includes("x") && items.length > 1 && (items.length > X_MAX_IMAGES || items.some((x) => x.kind !== "image"))) {
        throw new HttpError(400, `X takes one video or up to ${X_MAX_IMAGES} images; switch X off or use fewer images`);
      }
      if (chosen.includes("linkedin") && items.length > 1 && items.some((x) => x.kind !== "image")) {
        throw new HttpError(400, "LinkedIn takes one video or several images, not a mix");
      }
      const sched = b.lists.find((l) => l.role === "scheduled");
      out = { ...c, review: null, approval: { by: user.id, at: Date.now(), hash: contentHash(c) }, list_id: sched && c.list_id !== sched.id ? sched.id : c.list_id };
    } else {
      out = { ...c, approval: null };
    }
    return { ...b, cards: b.cards.map((x) => (x.id === cardId ? out : x)) };
  }, `calendar: ${on ? "approve" : "unapprove"} ${cardId}`);
  await addEvent(cardId, user.id, on ? "approved the card for publishing" : "withdrew the approval");
  // whoever made the post or asked for the approval hears that it is approved
  if (on) notifyLater([out.created_by, before && before.review && before.review.by], { title: ["پست تأیید شد", "Post approved"], body: cardName(out), url: cardUrl(boardId, cardId), tag: "card-" + cardId }, { team: false, except: user.id });
  return out;
}

// "Send for approval": anyone asks Hamed to approve the post as it is now.
export async function requestReview(user, boardId, cardId, note) {
  let out;
  await update(boardPath(checkId(boardId)), (b) => {
    const c = findCard(b, checkId(cardId));
    if (!Object.keys(CHANNELS).some((k) => c.channels[k] && c.channels[k].on)) throw new HttpError(400, "choose at least one channel first");
    out = { ...c, review: { by: user.id, at: Date.now(), note: String(note || "").slice(0, 500) } };
    return { ...b, cards: b.cards.map((x) => (x.id === cardId ? out : x)) };
  }, `calendar: review requested ${cardId}`);
  await addEvent(cardId, user.id, "sent the post for approval" + (note ? `: ${String(note).slice(0, 200)}` : ""));
  notifyLater(await adminIds(), { title: [`${user.name} پستی برای تأیید فرستاد`, `${user.name} sent a post for approval`], body: [cardName(out) + (note ? "\n" + note : ""), cardName(out) + (note ? "\n" + note : "")], url: cardUrl(boardId, cardId), tag: "card-" + cardId }, { team: false, except: user.id });
  return out;
}

// Hamed sends a post back with a note; it becomes a draft again.
export async function rejectCard(user, boardId, cardId, note) {
  if (!isAdmin(user)) throw new HttpError(403, "only Hamed approves or sends back posts");
  let out, asked = "";
  await update(boardPath(checkId(boardId)), (b) => {
    const c = findCard(b, checkId(cardId));
    asked = (c.review && c.review.by) || "";
    out = { ...c, review: null, approval: null };
    return { ...b, cards: b.cards.map((x) => (x.id === cardId ? out : x)) };
  }, `calendar: sent back ${cardId}`);
  await addEvent(cardId, user.id, "sent the post back" + (note ? `: ${String(note).slice(0, 300)}` : ""));
  notifyLater([out.created_by, asked], { title: ["پست برگشت خورد", "Post sent back"], body: cardName(out) + (note ? "\n" + String(note).slice(0, 200) : ""), url: cardUrl(boardId, cardId), tag: "card-" + cardId }, { team: false, except: user.id });
  return out;
}

async function stashArchived(boardId, cards, userId) {
  if (!cards.length) return;
  const path = `calendar/archive/${boardId}.json`;
  const entries = cards.map((card) => ({ ...card, archived_at: Date.now(), archived_by: userId }));
  const rec = await get(path);
  if (rec) await update(path, (a) => ({ cards: [...a.cards, ...entries] }));
  else await put(path, { cards: entries }, null);
}

export const LIST_COLORS = {
  slate: "#32515d", blue: "#2563eb", green: "#16a34a", amber: "#d97706",
  red: "#dc2626", purple: "#7c3aed", pink: "#db2777", gray: "#6b7280",
  ...FILLED_LIST_COLORS,
};
const SORTS = {
  newest: (a, b) => (b.created_at || 0) - (a.created_at || 0),
  oldest: (a, b) => (a.created_at || 0) - (b.created_at || 0),
  title: (a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true, sensitivity: "base" }),
  date: (a, b) => (a.publish_at ? new Date(a.publish_at).getTime() : Infinity) - (b.publish_at ? new Date(b.publish_at).getTime() : Infinity),
};

// The menu on a list's header (as in Trello). Changing the lists themselves (name, copy, order,
// colour, archive) is the admin's, like the lists and labels form; sorting and moving cards is
// everyone's, like moving a card by hand. Archiving cards in bulk is the admin's, because a card
// can otherwise be archived only by its creator.
export async function listAction(user, boardId, body) {
  const act = String(body.action || "");
  const lid = checkId(body.list_id);
  if (["rename", "copy", "move", "color", "archive_list", "archive_all", "archive_published"].includes(act) && !isAdmin(user)) {
    throw new HttpError(403, "only the admin changes or archives lists");
  }
  let archived = [];
  const board = await update(boardPath(checkId(boardId)), (b) => {
    archived = [];
    const list = b.lists.find((l) => l.id === lid);
    if (!list) throw new HttpError(404, "this list no longer exists");
    const inList = () => b.cards.filter((c) => c.list_id === lid).sort((x, y) => (x.pos || 0) - (y.pos || 0));
    const next = { ...b };
    switch (act) {
      case "rename": {
        const name = String(body.name || "").trim().slice(0, 60);
        if (!name) throw new HttpError(400, "give the list a name");
        next.lists = b.lists.map((l) => (l.id === lid ? { ...l, name } : l));
        break;
      }
      case "color": {
        const color = body.color && LIST_COLORS[body.color] ? body.color : "";
        next.lists = b.lists.map((l) => (l.id === lid ? { ...l, color } : l));
        break;
      }
      case "move": {
        const ordered = [...b.lists].sort((x, y) => x.pos - y.pos);
        const from = ordered.findIndex((l) => l.id === lid);
        const to = Math.min(ordered.length, Math.max(1, Math.floor(Number(body.to)) || 1)) - 1;
        ordered.splice(to, 0, ordered.splice(from, 1)[0]);
        next.lists = ordered.map((l, i) => ({ ...l, pos: (i + 1) * 1000 }));
        break;
      }
      case "copy": {
        const copy = { id: newId("l"), name: String(body.name || `${list.name} (copy)`).trim().slice(0, 60), role: "", pos: list.pos + 1, color: list.color || "" };
        const ordered = [...b.lists, copy].sort((x, y) => x.pos - y.pos).map((l, i) => ({ ...l, pos: (i + 1) * 1000 }));
        // Copied cards are fresh drafts: no approval, no publishing history, no link to the topic.
        const cards = inList().map((c, i) => ({
          ...c, id: newId("k"), list_id: copy.id, pos: (i + 1) * 1000, review: null, approval: null, publish: {}, source: null,
          publish_at: null, created_by: user.id, created_at: Date.now(), updated_at: Date.now(), updated_by: user.id,
        }));
        next.lists = ordered;
        next.cards = [...b.cards, ...cards];
        break;
      }
      case "sort": {
        const by = SORTS[body.by];
        if (!by) throw new HttpError(400, "unknown sort");
        const order = new Map(inList().sort(by).map((c, i) => [c.id, (i + 1) * 1000]));
        next.cards = b.cards.map((c) => (order.has(c.id) ? { ...c, pos: order.get(c.id) } : c));
        break;
      }
      case "move_all": {
        const to = b.lists.find((l) => l.id === body.to_list_id);
        if (!to || to.id === lid) throw new HttpError(400, "choose another list");
        let at = b.cards.filter((c) => c.list_id === to.id).reduce((m, c) => Math.max(m, c.pos || 0), 0);
        const moving = new Map(inList().map((c) => [c.id, (at += 1000)]));
        next.cards = b.cards.map((c) => (moving.has(c.id) ? { ...c, list_id: to.id, pos: moving.get(c.id) } : c));
        break;
      }
      case "archive_published":
      case "archive_all":
      case "archive_list": {
        if (act === "archive_list") {
          if (list.role) throw new HttpError(409, "publishing uses this list, so it cannot be archived");
          if (b.lists.length < 2) throw new HttpError(409, "the board needs at least one list");
          if (inList().length && !body.with_cards) throw new HttpError(409, "this list still has cards");
        }
        archived = inList().filter((c) => act !== "archive_published" || postStatus(c) === "published");
        const gone = new Set(archived.map((c) => c.id));
        next.cards = b.cards.filter((c) => !gone.has(c.id));
        if (act === "archive_list") next.lists = b.lists.filter((l) => l.id !== lid);
        break;
      }
      default:
        throw new HttpError(400, "unknown list action");
    }
    return next;
  }, `calendar: list ${act} ${lid}`);
  await stashArchived(boardId, archived, user.id);
  return { board, archived: archived.length };
}

export async function archiveCard(user, boardId, cardId) {
  let card;
  await update(boardPath(checkId(boardId)), (b) => {
    card = findCard(b, checkId(cardId));
    if (!isAdmin(user) && card.created_by !== user.id) throw new HttpError(403, "only the admin or the card's creator can archive it");
    return { ...b, cards: b.cards.filter((x) => x.id !== cardId) };
  }, `calendar: archive ${cardId}`);
  const path = `calendar/archive/${boardId}.json`;
  const rec = await get(path);
  if (rec) await update(path, (a) => ({ cards: [...a.cards, { ...card, archived_at: Date.now(), archived_by: user.id }] }));
  else await put(path, { cards: [{ ...card, archived_at: Date.now(), archived_by: user.id }] }, null);
  await addEvent(cardId, user.id, "archived the card");
}

export async function setPublish(boardId, cardId, channel, state) {
  let out;
  await update(boardPath(boardId), (b) => {
    const c = b.cards.find((x) => x.id === cardId);
    if (!c) return b;
    const publish = { ...(c.publish || {}), [channel]: { ...state, at: Date.now() } };
    out = { ...c, publish };
    const on = Object.keys(CHANNELS).filter((k) => c.channels[k] && c.channels[k].on);
    if (on.length && on.every((k) => publishStateOf(publish[k]) === "published")) {
      const done = b.lists.find((l) => l.role === "published");
      if (done) out.list_id = done.id;
    }
    return { ...b, cards: b.cards.map((x) => (x.id === cardId ? out : x)) };
  }, `calendar: ${channel} ${state.status} ${cardId}`);
  return out;
}

// ---- comments and history -------------------------------------------------------------------

export async function comments(cardId) {
  const rec = await get(`calendar/comments/${checkId(cardId)}.json`);
  return rec ? rec.data.items : [];
}

async function appendItem(cardId, item) {
  const path = `calendar/comments/${cardId}.json`;
  const rec = await get(path);
  if (rec) await update(path, (d) => ({ items: [...d.items, item].slice(-300) }));
  else await put(path, { items: [item] }, null);
  return item;
}

export function addComment(user, cardId, text) {
  const t = String(text || "").trim().slice(0, 3000);
  if (!t) throw new HttpError(400, "write something first");
  return appendItem(checkId(cardId), { id: newId("m"), type: "comment", by: user.id, text: t, at: Date.now() });
}

export function addEvent(cardId, by, text) {
  return appendItem(cardId, { id: newId("m"), type: "event", by, text, at: Date.now() }).catch(() => null);
}
