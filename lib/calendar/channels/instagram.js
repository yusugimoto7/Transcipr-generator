// Instagram: a Reel (one video), a feed post (one image, or a carousel of up to 10) or Stories (each
// file its own story), through the Instagram API with Instagram Login. Three pages, chosen by the
// post's own choice of page, else by the card: English content (an English carousel, story or
// article, or the English video) to @sugimoto.visa, the English page for Canada and Europe
// (IG_USER_ID_ALT, IG_ACCESS_TOKEN_ALT); Persian EU cards to the Europe account (IG_USER_ID_EU,
// IG_ACCESS_TOKEN_EU); everything else to @sugimotovisa (IG_USER_ID, IG_ACCESS_TOKEN). Instagram fetches every file by
// URL, so it gets the app's signed media links, not the original links.

import crypto from "crypto";
import { signedMediaUrl } from "../media";
import { mediaItems } from "../model";
import { loadConnection, saveConnection } from "../connections";

const API = "https://graph.instagram.com/v21.0";
const ACCOUNTS = {
  canada: { name: "Canada", id: "IG_USER_ID", token: "IG_ACCESS_TOKEN" },
  eu: { name: "EU", id: "IG_USER_ID_EU", token: "IG_ACCESS_TOKEN_EU" },
  // A third page, chosen per post in the composer; never picked by a market label.
  alt: { name: "sugimoto.visa", id: "IG_USER_ID_ALT", token: "IG_ACCESS_TOKEN_ALT" },
};
const REFRESH_EVERY = 7 * 24 * 3600 * 1000;
const checked = globalThis.__igTokenChecked || (globalThis.__igTokenChecked = {});

const hash = (t) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 16);

// A long-lived token dies after 60 days unless refreshed, and the app cannot rewrite its own Render
// settings, so the refreshed token is kept encrypted with the calendar's other connections. A new
// token pasted into Render (a different hash) always wins over the stored one.
async function tokenOf(market) {
  const a = ACCOUNTS[market];
  const env = (process.env[a.token] || "").trim();
  if (!env) return "";
  const c = await loadConnection("instagram_" + market);
  return c && c.from === hash(env) && c.token ? c.token : env;
}

export async function refreshTokens() {
  for (const market of Object.keys(ACCOUNTS)) {
    const env = (process.env[ACCOUNTS[market].token] || "").trim();
    if (!env || Date.now() - (checked[market] || 0) < 12 * 3600 * 1000) continue;
    checked[market] = Date.now();
    const c = await loadConnection("instagram_" + market);
    const current = c && c.from === hash(env) && c.token ? c : null;
    if (current && Date.now() - (current.refreshed_at || 0) < REFRESH_EVERY) continue;
    const res = await fetch("https://graph.instagram.com/refresh_access_token?" + new URLSearchParams({ grant_type: "ig_refresh_token", access_token: current ? current.token : env }));
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d.access_token) {
      console.error(`[calendar] Instagram ${market} token refresh failed:`, (d.error && d.error.message) || res.status);
      continue;
    }
    await saveConnection("instagram_" + market, { token: d.access_token, from: hash(env), refreshed_at: Date.now() }, c ? c._label : "");
  }
}

// The page's own posts (newest first), for the voice studies (lib/voice-study.js): caption, date,
// the file's address and the counts Instagram shows. `types` picks the kinds (VIDEO, IMAGE,
// CAROUSEL_ALBUM); up to `count` posts, read page by page.
export async function ownMedia(market = "canada", { types = ["VIDEO"], count = 100, maxPages = 30 } = {}) {
  const a = ACCOUNTS[market];
  const token = await tokenOf(market);
  const id = (process.env[a.id] || "").trim();
  if (!token || !id) throw new Error(`${a.id} / ${a.token} not set`);
  const fields = "id,caption,media_type,media_product_type,media_url,permalink,timestamp,like_count,comments_count";
  let url = `${API}/${id}/media?` + new URLSearchParams({ fields, limit: "50", access_token: token });
  const out = [];
  for (let page = 0; url && page < maxPages && out.length < count; page++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) throw new Error((d.error && d.error.message) || "Instagram " + res.status);
    for (const m of d.data || []) if (types.includes(m.media_type) && out.length < count) out.push(m);
    url = (d.paging && d.paging.next) || "";
  }
  return out;
}

export function ownVideos(market = "canada", { count = 100, maxPages = 30 } = {}) {
  return ownMedia(market, { types: ["VIDEO"], count, maxPages });
}

// The pictures of one of the page's carousels, in order: [{ id, media_type, media_url }].
export async function ownChildren(market, mediaId) {
  const token = await tokenOf(market);
  const res = await fetch(`${API}/${mediaId}/children?` + new URLSearchParams({ fields: "id,media_type,media_url,thumbnail_url", access_token: token }), { signal: AbortSignal.timeout(30000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw new Error((d.error && d.error.message) || "Instagram " + res.status);
  return d.data || [];
}

// Views of one of the page's own videos, or null when the token cannot read insights.
export async function ownVideoViews(market, mediaId) {
  const token = await tokenOf(market);
  const res = await fetch(`${API}/${mediaId}/insights?` + new URLSearchParams({ metric: "views", access_token: token }), { signal: AbortSignal.timeout(20000) }).catch(() => null);
  const d = res ? await res.json().catch(() => ({})) : {};
  const v = d && d.data && d.data[0] && d.data[0].values && d.data[0].values[0];
  return v && Number.isFinite(Number(v.value)) ? Number(v.value) : null;
}

async function whoAmI(market) {
  const token = await tokenOf(market);
  const res = await fetch(`${API}/me?` + new URLSearchParams({ fields: "username", access_token: token }));
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw new Error((d.error && d.error.message) || String(res.status));
  return d.username;
}

export async function status() {
  const parts = [];
  let any = false;
  for (const [market, a] of Object.entries(ACCOUNTS)) {
    if (!process.env[a.id] || !process.env[a.token]) {
      parts.push(`${a.name}: set ${a.id} and ${a.token}`);
      continue;
    }
    try {
      parts.push(`${a.name}: @${await whoAmI(market)}`);
      any = true;
    } catch (e) {
      parts.push(`${a.name}: token rejected (${String(e.message || e).slice(0, 80)})`);
    }
  }
  return { connected: any, detail: parts.join(" · ") };
}

export function marketOf(board, card) {
  const names = (card.labels || []).map((id) => ((board.labels || []).find((l) => l.id === id) || {}).name || "");
  return names.some((n) => n.toLowerCase() === "eu") ? "eu" : "canada";
}

async function callWith(method, path, params = {}, token) {
  const u = new URL(API + path);
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === "GET" ? await fetch(u + "?" + body) : await fetch(u, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Instagram ${res.status}: ${(data.error && data.error.message) || JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// Instagram downloads and processes each file before it can be used.
async function ready(id, call) {
  for (let n = 0; n < 60; n++) {
    const s = await call("GET", `/${id}`, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram could not process the media: " + (s.status || s.status_code));
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("Instagram took too long to process the media");
}

async function publishContainer(ig, id, call) {
  await ready(id, call);
  const done = await call("POST", `/${ig}/media_publish`, { creation_id: id });
  const info = await call("GET", `/${done.id}`, { fields: "permalink" }).catch(() => ({}));
  return { id: done.id, url: info.permalink || "" };
}

const fileParam = (m, url) => (m.kind === "video" ? { video_url: url } : { image_url: url });

// A picture's description goes along as alt text. Instagram added the field for feed images
// lately; if this account's API version refuses it, the post goes out without it rather than fail.
async function container(call, ig, params, m) {
  if (!(m && m.kind === "image" && m.alt)) return call("POST", `/${ig}/media`, params);
  try {
    return await call("POST", `/${ig}/media`, { ...params, alt_text: m.alt });
  } catch (e) {
    if (!/alt_text|param/i.test(String(e.message || e))) throw e;
    return call("POST", `/${ig}/media`, params);
  }
}

export async function publish({ caption, media, format, boardId, cardId, market: asked }) {
  const market = ACCOUNTS[asked] ? asked : "canada";
  const a = ACCOUNTS[market];
  const ig = process.env[a.id];
  const token = await tokenOf(market);
  if (!ig || !token) throw new Error(`the ${a.name} Instagram account is not connected: set ${a.id} and ${a.token}`);
  const call = (method, path, params) => callWith(method, path, params, token);
  const items = mediaItems(media);
  if (!items.length) throw new Error("Instagram needs a video or an image");
  const link = (i) => signedMediaUrl(boardId, cardId, 180, i);

  if (format === "story") {
    // Stories carry no caption; each file is posted as its own story, in order.
    const ids = [];
    for (const [i, m] of items.entries()) {
      const c = await call("POST", `/${ig}/media`, { media_type: "STORIES", ...fileParam(m, link(i)) });
      ids.push((await publishContainer(ig, c.id, call)).id);
    }
    return { id: ids.join(","), url: "" };
  }

  if (items.length > 1) {
    const children = [];
    for (const [i, m] of items.entries()) {
      const c = await container(call, ig, { is_carousel_item: "true", ...(m.kind === "video" ? { media_type: "VIDEO" } : {}), ...fileParam(m, link(i)) }, m);
      await ready(c.id, call);
      children.push(c.id);
    }
    const parent = await call("POST", `/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: caption || "" });
    return publishContainer(ig, parent.id, call);
  }

  const m = items[0];
  const reel = format !== "post" && m.kind === "video";
  if (!reel && m.kind !== "image") throw new Error("an Instagram feed post needs an image; a Reel needs a video");
  const made = await container(call, ig, reel
    ? { media_type: "REELS", video_url: link(0), caption: caption || "", share_to_feed: "true" }
    : { image_url: link(0), caption: caption || "" }, m);
  return publishContainer(ig, made.id, call);
}
