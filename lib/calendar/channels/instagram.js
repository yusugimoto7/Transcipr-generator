// Instagram: a Reel (video) or a feed post (image), through the Instagram API with Instagram Login,
// as the account the draws poster uses (IG_USER_ID, IG_ACCESS_TOKEN). Instagram fetches the media
// by URL, so it gets the app's signed media link, not the Drive link.

import { signedMediaUrl } from "../media";

const API = "https://graph.instagram.com/v21.0";

export function status() {
  const ok = !!(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);
  return { connected: ok, detail: ok ? "posts as the draws poster's Instagram account" : "set IG_USER_ID and IG_ACCESS_TOKEN" };
}

async function call(method, path, params = {}) {
  const u = new URL(API + path);
  const body = new URLSearchParams({ ...params, access_token: process.env.IG_ACCESS_TOKEN });
  const res = method === "GET" ? await fetch(u + "?" + body) : await fetch(u, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Instagram ${res.status}: ${(data.error && data.error.message) || JSON.stringify(data).slice(0, 200)}`);
  return data;
}

export async function publish({ caption, media, format, boardId, cardId }) {
  const ig = process.env.IG_USER_ID;
  const url = signedMediaUrl(boardId, cardId, 180);
  const reel = format !== "post" && media.kind === "video";
  if (!reel && media.kind !== "image") throw new Error("an Instagram feed post needs an image; a Reel needs a video");
  const container = await call("POST", `/${ig}/media`, reel
    ? { media_type: "REELS", video_url: url, caption: caption || "", share_to_feed: "true" }
    : { image_url: url, caption: caption || "" });
  // Instagram downloads and processes the file before it can be published.
  for (let n = 0; n < 60; n++) {
    const s = await call("GET", `/${container.id}`, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram could not process the media: " + (s.status || s.status_code));
    await new Promise((r) => setTimeout(r, 10000));
  }
  const done = await call("POST", `/${ig}/media_publish`, { creation_id: container.id });
  const info = await call("GET", `/${done.id}`, { fields: "permalink" }).catch(() => ({}));
  return { id: done.id, url: info.permalink || "" };
}
