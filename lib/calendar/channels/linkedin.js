// LinkedIn company page: text, image or video post through the Posts API, as the organization the
// draws poster uses (LINKEDIN_ACCESS_TOKEN with w_organization_social, LINKEDIN_ORG_ID).

import { downloadMedia, readChunk } from "../media";

const API = "https://api.linkedin.com/rest";

export function status() {
  const ok = !!(process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_ID);
  return { connected: ok, detail: ok ? "posts as the company page the draws poster uses" : "set LINKEDIN_ACCESS_TOKEN and LINKEDIN_ORG_ID" };
}

// LinkedIn retires API versions after a year; use a recent month unless one is set.
function version() {
  if (process.env.LINKEDIN_VERSION) return process.env.LINKEDIN_VERSION;
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 2);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function headers(json = true) {
  return {
    Authorization: "Bearer " + process.env.LINKEDIN_ACCESS_TOKEN,
    "LinkedIn-Version": version(),
    "X-Restli-Protocol-Version": "2.0.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function call(url, body) {
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`LinkedIn ${res.status}: ${text.slice(0, 300)}`);
  return { data: text ? JSON.parse(text) : {}, res };
}

async function uploadImage(owner, url) {
  const m = await downloadMedia(url);
  try {
    const { data } = await call(`${API}/images?action=initializeUpload`, { initializeUploadRequest: { owner } });
    const put = await fetch(data.value.uploadUrl, { method: "PUT", headers: { Authorization: headers().Authorization }, body: readChunk(m.file, 0, m.size) });
    if (!put.ok) throw new Error("LinkedIn image upload " + put.status);
    return data.value.image;
  } finally {
    m.cleanup();
  }
}

async function uploadVideo(owner, url) {
  const m = await downloadMedia(url);
  try {
    const { data } = await call(`${API}/videos?action=initializeUpload`, {
      initializeUploadRequest: { owner, fileSizeBytes: m.size, uploadCaptions: false, uploadThumbnail: false },
    });
    const etags = [];
    for (const part of data.value.uploadInstructions) {
      const res = await fetch(part.uploadUrl, { method: "PUT", body: readChunk(m.file, part.firstByte, part.lastByte - part.firstByte + 1) });
      if (!res.ok) throw new Error("LinkedIn video upload " + res.status);
      etags.push(res.headers.get("etag"));
    }
    await call(`${API}/videos?action=finalizeUpload`, {
      finalizeUploadRequest: { video: data.value.video, uploadToken: data.value.uploadToken || "", uploadedPartIds: etags },
    });
    return data.value.video;
  } finally {
    m.cleanup();
  }
}

export async function publish({ caption, media, title }) {
  const owner = `urn:li:organization:${process.env.LINKEDIN_ORG_ID}`;
  const body = {
    author: owner,
    commentary: String(caption || "").replace(/[(){}\[\]<>@|~_*#\\]/g, (c) => "\\" + c),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (media.kind === "image") body.content = { media: { id: await uploadImage(owner, media.url) } };
  if (media.kind === "video") body.content = { media: { id: await uploadVideo(owner, media.url), title: String(title || "").slice(0, 200) } };
  const { res } = await call(`${API}/posts`, body);
  const id = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id") || "";
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}` : "" };
}
