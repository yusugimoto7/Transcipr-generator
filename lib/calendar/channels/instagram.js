// Instagram: a Reel (one video), a feed post (one image, or a carousel of up to 10) or Stories (each
// file its own story), through the Instagram API with Instagram Login. Two accounts, chosen by the
// card's market label: EU cards post as the Europe account (IG_USER_ID_EU, IG_ACCESS_TOKEN_EU),
// everything else as @sugimotovisa (IG_USER_ID, IG_ACCESS_TOKEN). Instagram fetches every file by
// URL, so it gets the app's signed media links, not the original links.

import crypto from "crypto";
import { signedMediaUrl } from "../media";
import { mediaItems } from "../model";
import { loadConnection, saveConnection } from "../connections";

const API = "https://graph.instagram.com/v21.0";
const ACCOUNTS = {
  canada: { name: "Canada", id: "IG_USER_ID", token: "IG_ACCESS_TOKEN" },
  eu: { name: "EU", id: "IG_USER_ID_EU", token: "IG_ACCESS_TOKEN_EU" },
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
      const c = await call("POST", `/${ig}/media`, { is_carousel_item: "true", ...(m.kind === "video" ? { media_type: "VIDEO" } : {}), ...fileParam(m, link(i)) });
      await ready(c.id, call);
      children.push(c.id);
    }
    const parent = await call("POST", `/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: caption || "" });
    return publishContainer(ig, parent.id, call);
  }

  const m = items[0];
  const reel = format !== "post" && m.kind === "video";
  if (!reel && m.kind !== "image") throw new Error("an Instagram feed post needs an image; a Reel needs a video");
  const container = await call("POST", `/${ig}/media`, reel
    ? { media_type: "REELS", video_url: link(0), caption: caption || "", share_to_feed: "true" }
    : { image_url: link(0), caption: caption || "" });
  return publishContainer(ig, container.id, call);
}
