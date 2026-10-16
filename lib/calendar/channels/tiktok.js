// TikTok: video upload through the Content Posting API (direct post). Connected from the calendar
// with the admin's TikTok sign-in (TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET of a TikTok developer
// app with video.publish). Until TikTok has audited that app, every post is private (SELF_ONLY):
// TikTok's rule, not this app's.

import { downloadMedia, readChunk } from "../media";
import { loadConnection, saveConnection } from "../connections";

const API = "https://open.tiktokapis.com/v2";
const CHUNK = 10 * 1024 * 1024;

export async function status() {
  if (!process.env.TIKTOK_CLIENT_KEY || !process.env.TIKTOK_CLIENT_SECRET) return { connected: false, detail: "set TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET, then connect" };
  const c = await loadConnection("tiktok");
  return c ? { connected: true, detail: `connected as ${c._label || "TikTok account"}`, connect: true } : { connected: false, detail: "not connected yet", connect: true };
}

export function authUrl(redirect, state) {
  return "https://www.tiktok.com/v2/auth/authorize/?" + new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY, scope: "user.info.basic,video.publish", response_type: "code", redirect_uri: redirect, state,
  });
}

async function token(params) {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: process.env.TIKTOK_CLIENT_KEY, client_secret: process.env.TIKTOK_CLIENT_SECRET, ...params }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.error) throw new Error("TikTok sign-in: " + (d.error_description || d.error || res.status));
  return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in - 120) * 1000, open_id: d.open_id };
}

export async function finishConnect(code, redirect) {
  const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirect });
  const me = await fetch(`${API}/user/info/?fields=display_name`, { headers: { Authorization: "Bearer " + t.access_token } }).then((r) => r.json()).catch(() => ({}));
  await saveConnection("tiktok", t, (me.data && me.data.user && me.data.user.display_name) || "TikTok account");
}

async function access() {
  let c = await loadConnection("tiktok");
  if (!c) throw new Error("TikTok is not connected");
  if (Date.now() > c.expires_at) {
    c = await token({ grant_type: "refresh_token", refresh_token: c.refresh_token });
    await saveConnection("tiktok", c);
  }
  return c.access_token;
}

async function call(tok, path, body) {
  const res = await fetch(API + path, { method: "POST", headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(body || {}) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || (d.error && d.error.code && d.error.code !== "ok")) throw new Error(`TikTok ${res.status}: ${(d.error && d.error.message) || ""}`);
  return d.data || {};
}

export async function publish({ caption, media }) {
  if (media.kind !== "video") throw new Error("TikTok needs a video");
  const tok = await access();
  const creator = await call(tok, "/post/publish/creator_info/query/");
  const levels = creator.privacy_level_options || [];
  const privacy = levels.includes("PUBLIC_TO_EVERYONE") ? "PUBLIC_TO_EVERYONE" : levels[0] || "SELF_ONLY";
  const m = await downloadMedia(media.url);
  try {
    const chunk = m.size <= 64 * 1024 * 1024 ? m.size : CHUNK;
    const count = Math.floor(m.size / chunk) || 1;
    const init = await call(tok, "/post/publish/video/init/", {
      post_info: { title: String(caption || "").slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: "FILE_UPLOAD", video_size: m.size, chunk_size: chunk, total_chunk_count: count },
    });
    for (let i = 0; i < count; i++) {
      const start = i * chunk;
      const end = i === count - 1 ? m.size - 1 : start + chunk - 1; // the last chunk takes the remainder
      const res = await fetch(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": m.mime, "Content-Range": `bytes ${start}-${end}/${m.size}` },
        body: readChunk(m.file, start, end - start + 1),
      });
      if (!res.ok) throw new Error("TikTok upload " + res.status);
    }
    for (let n = 0; n < 60; n++) {
      const s = await call(tok, "/post/publish/status/fetch/", { publish_id: init.publish_id });
      if (s.status === "PUBLISH_COMPLETE") {
        const id = (s.publicaly_available_post_id || [])[0] || init.publish_id;
        return { id: String(id), url: "", note: privacy === "PUBLIC_TO_EVERYONE" ? "" : "posted as private: TikTok has not audited the app yet" };
      }
      if (s.status === "FAILED") throw new Error("TikTok rejected the video: " + (s.fail_reason || ""));
      await new Promise((r) => setTimeout(r, 10000));
    }
    return { id: init.publish_id, url: "", note: "TikTok is still processing; check the app" };
  } finally {
    m.cleanup();
  }
}
