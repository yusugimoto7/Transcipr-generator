// X: a post with optional image or video, as the account whose keys the draws poster uses
// (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET: OAuth 1.0a, which does not expire).
// Media goes through the v2 chunked upload: initialize, append, finalize, wait for processing.

import crypto from "crypto";
import { downloadMedia, readChunk } from "../media";

const API = "https://api.x.com/2";
const CHUNK = 4 * 1024 * 1024;

export function status() {
  const ok = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"].every((k) => process.env[k]);
  return { connected: ok, detail: ok ? "posts as the draws poster's X account" : "set X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET" };
}

const enc = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// OAuth 1.0a header. Query parameters are part of the signature; JSON and multipart bodies are not.
function auth(method, url) {
  const u = new URL(url);
  const o = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const all = { ...o };
  for (const [k, v] of u.searchParams) all[k] = v;
  const norm = Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join("&");
  const base = [method, enc(u.origin + u.pathname), enc(norm)].join("&");
  const key = `${enc(process.env.X_API_SECRET)}&${enc(process.env.X_ACCESS_SECRET)}`;
  o.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(o).sort().map((k) => `${enc(k)}="${enc(o[k])}"`).join(", ");
}

async function call(method, url, body, json = true) {
  const headers = { Authorization: auth(method, url) };
  if (body && json) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method, headers, body: body ? (json ? JSON.stringify(body) : body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`X ${res.status}: ${data.detail || data.title || JSON.stringify(data.errors || data).slice(0, 200)}`);
  return data;
}

async function uploadMedia(url, kind) {
  const m = await downloadMedia(url);
  try {
    const init = await call("POST", `${API}/media/upload/initialize`, {
      media_type: m.mime, total_bytes: m.size, media_category: kind === "image" ? "tweet_image" : "tweet_video",
    });
    const id = init.data.id;
    for (let i = 0, off = 0; off < m.size; i++, off += CHUNK) {
      const form = new FormData();
      form.append("segment_index", String(i));
      form.append("media", new Blob([readChunk(m.file, off, CHUNK)]));
      await call("POST", `${API}/media/upload/${id}/append`, form, false);
    }
    let info = (await call("POST", `${API}/media/upload/${id}/finalize`)).data.processing_info;
    for (let n = 0; info && ["pending", "in_progress"].includes(info.state) && n < 60; n++) {
      await new Promise((r) => setTimeout(r, Math.max(2, info.check_after_secs || 5) * 1000));
      info = (await call("GET", `${API}/media/upload?command=STATUS&media_id=${id}`)).data.processing_info;
    }
    if (info && info.state === "failed") throw new Error("X could not process the video: " + JSON.stringify(info.error || {}));
    return id;
  } finally {
    m.cleanup();
  }
}

export async function publish({ caption, media }) {
  const text = String(caption || "").trim();
  if (!text && media.kind === "none") throw new Error("nothing to post on X");
  const body = { text };
  if (media.kind !== "none") body.media = { media_ids: [await uploadMedia(media.url, media.kind)] };
  const data = await call("POST", `${API}/tweets`, body);
  return { id: data.data.id, url: `https://x.com/i/web/status/${data.data.id}` };
}
