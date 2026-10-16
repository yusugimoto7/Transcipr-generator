// YouTube: video upload (resumable) with the YouTube Data API, connected from the calendar with
// the admin's Google sign-in (YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET of a Google Cloud OAuth
// client, redirect URI <app>/api/calendar/connect/youtube/callback). Vertical videos under three
// minutes become Shorts. Until Google audits the project, uploads stay private: Google's rule.

import fs from "fs";
import { downloadMedia } from "../media";
import { loadConnection, saveConnection } from "../connections";

export async function status() {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) return { connected: false, detail: "set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET, then connect" };
  const c = await loadConnection("youtube");
  return c ? { connected: true, detail: `connected to ${c._label || "the YouTube channel"}`, connect: true } : { connected: false, detail: "not connected yet", connect: true };
}

export function authUrl(redirect, state) {
  return "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID, redirect_uri: redirect, response_type: "code", access_type: "offline", prompt: "consent", state,
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  });
}

async function token(params) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, ...params }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Google sign-in: " + (d.error_description || d.error || res.status));
  return d;
}

export async function finishConnect(code, redirect) {
  const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirect });
  if (!t.refresh_token) throw new Error("Google did not return a refresh token; remove the app's access in your Google account and connect again");
  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: "Bearer " + t.access_token } }).then((r) => r.json()).catch(() => ({}));
  await saveConnection("youtube", { refresh_token: t.refresh_token }, (ch.items && ch.items[0] && ch.items[0].snippet.title) || "YouTube channel");
}

export async function publish({ caption, title, media }) {
  if (media.kind !== "video") throw new Error("YouTube needs a video");
  const c = await loadConnection("youtube");
  if (!c) throw new Error("YouTube is not connected");
  const { access_token } = await token({ grant_type: "refresh_token", refresh_token: c.refresh_token });
  const m = await downloadMedia(media.url);
  try {
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: "Bearer " + access_token, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(m.size), "X-Upload-Content-Type": m.mime },
      body: JSON.stringify({
        snippet: { title: String(title || caption || "Video").slice(0, 100), description: String(caption || "").slice(0, 5000), categoryId: "27" },
        status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      }),
    });
    if (!start.ok) throw new Error("YouTube " + start.status + ": " + (await start.text()).slice(0, 300));
    const up = await fetch(start.headers.get("location"), {
      method: "PUT",
      headers: { "Content-Type": m.mime, "Content-Length": String(m.size) },
      body: fs.createReadStream(m.file),
      duplex: "half",
    });
    const d = await up.json().catch(() => ({}));
    if (!up.ok) throw new Error("YouTube upload " + up.status + ": " + JSON.stringify(d.error || d).slice(0, 300));
    return { id: d.id, url: `https://youtu.be/${d.id}`, note: d.status && d.status.privacyStatus !== "public" ? "uploaded as " + d.status.privacyStatus : "" };
  } finally {
    m.cleanup();
  }
}
