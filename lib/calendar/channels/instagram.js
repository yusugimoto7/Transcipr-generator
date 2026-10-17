// Instagram: a Reel (one video), a feed post (one image, or a carousel of up to 10) or Stories (each
// file its own story), through the Instagram API with Instagram Login, as the account the draws
// poster uses (IG_USER_ID, IG_ACCESS_TOKEN). Instagram fetches every file by URL, so it gets the
// app's signed media links, not the original links.

import { signedMediaUrl } from "../media";
import { mediaItems } from "../model";

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

// Instagram downloads and processes each file before it can be used.
async function ready(id) {
  for (let n = 0; n < 60; n++) {
    const s = await call("GET", `/${id}`, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error("Instagram could not process the media: " + (s.status || s.status_code));
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("Instagram took too long to process the media");
}

async function publishContainer(ig, id) {
  await ready(id);
  const done = await call("POST", `/${ig}/media_publish`, { creation_id: id });
  const info = await call("GET", `/${done.id}`, { fields: "permalink" }).catch(() => ({}));
  return { id: done.id, url: info.permalink || "" };
}

const fileParam = (m, url) => (m.kind === "video" ? { video_url: url } : { image_url: url });

export async function publish({ caption, media, format, boardId, cardId }) {
  const ig = process.env.IG_USER_ID;
  const items = mediaItems(media);
  if (!items.length) throw new Error("Instagram needs a video or an image");
  const link = (i) => signedMediaUrl(boardId, cardId, 180, i);

  if (format === "story") {
    // Stories carry no caption; each file is posted as its own story, in order.
    const ids = [];
    for (const [i, m] of items.entries()) {
      const c = await call("POST", `/${ig}/media`, { media_type: "STORIES", ...fileParam(m, link(i)) });
      ids.push((await publishContainer(ig, c.id)).id);
    }
    return { id: ids.join(","), url: "" };
  }

  if (items.length > 1) {
    const children = [];
    for (const [i, m] of items.entries()) {
      const c = await call("POST", `/${ig}/media`, { is_carousel_item: "true", ...(m.kind === "video" ? { media_type: "VIDEO" } : {}), ...fileParam(m, link(i)) });
      await ready(c.id);
      children.push(c.id);
    }
    const parent = await call("POST", `/${ig}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: caption || "" });
    return publishContainer(ig, parent.id);
  }

  const m = items[0];
  const reel = format !== "post" && m.kind === "video";
  if (!reel && m.kind !== "image") throw new Error("an Instagram feed post needs an image; a Reel needs a video");
  const container = await call("POST", `/${ig}/media`, reel
    ? { media_type: "REELS", video_url: link(0), caption: caption || "", share_to_feed: "true" }
    : { image_url: link(0), caption: caption || "" });
  return publishContainer(ig, container.id);
}
