// Posting to the four channels. Every function returns
// { ok, skipped?, reason?, id?, error? } and never throws, so one dead channel
// never blocks the others.
import crypto from "node:crypto";
import { buildStorySvg, renderStoryPng, renderEnabled } from "./story";

const TELEGRAM_LIMIT = 4000; // hard cap is 4096
const X_LIMIT = 280;

function ok(extra = {}) {
  return { ok: true, ...extra };
}
function skip(reason) {
  return { ok: false, skipped: true, reason };
}
function fail(error) {
  return { ok: false, error: String(error?.message || error) };
}

/* ------------------------------- Telegram ------------------------------- */

export async function postTelegram(item) {
  // The draws poster can run on its OWN bot (fully independent of the Topic
  // Engine's bot). Set DRAWS_TELEGRAM_BOT_TOKEN for a separate bot; otherwise it
  // reuses the shared TELEGRAM_BOT_TOKEN.
  const token = process.env.DRAWS_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  // Draws post ONLY to a dedicated channel that is set explicitly. We do NOT
  // fall back to TELEGRAM_CHANNEL_ID — that silently flooded the main channel.
  const chatId = process.env.DRAWS_TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) return skip("DRAWS_TELEGRAM_CHANNEL_ID not set (draws Telegram posting disabled)");

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(item.telegram).slice(0, TELEGRAM_LIMIT),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data?.ok) return fail(data?.description || `HTTP ${res.status}`);
    return ok({ id: data.result?.message_id });
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- X ------------------------------------ */
// OAuth 1.0a user-context signing. Unlike OAuth 2.0 these credentials do not
// expire, which is what we want for an unattended poster.

function pctEncode(str) {
  return encodeURIComponent(String(str)).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function oauthHeader(method, url, consumerKey, consumerSecret, token, tokenSecret) {
  const params = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };
  // JSON bodies are not part of the OAuth 1.0a signature base string.
  const normalized = Object.keys(params)
    .sort()
    .map((k) => `${pctEncode(k)}=${pctEncode(params[k])}`)
    .join("&");
  const base = [
    method.toUpperCase(),
    pctEncode(url),
    pctEncode(normalized),
  ].join("&");
  const signingKey = `${pctEncode(consumerSecret)}&${pctEncode(tokenSecret)}`;
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(base)
    .digest("base64");

  const all = { ...params, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(all)
      .sort()
      .map((k) => `${pctEncode(k)}="${pctEncode(all[k])}"`)
      .join(", ")
  );
}

export async function postX(item) {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const token = process.env.X_ACCESS_TOKEN;
  const tokenSecret = process.env.X_ACCESS_SECRET;
  if (!consumerKey || !consumerSecret || !token || !tokenSecret) {
    return skip("X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET not set");
  }

  const url = "https://api.twitter.com/2/tweets";
  let text = String(item.x || "");
  if (text.length > X_LIMIT) text = text.slice(0, X_LIMIT - 1).trimEnd() + "…";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: oauthHeader(
          "POST",
          url,
          consumerKey,
          consumerSecret,
          token,
          tokenSecret
        ),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return fail(data?.detail || data?.title || `HTTP ${res.status}`);
    return ok({ id: data?.data?.id });
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- LinkedIn ------------------------------- */

export async function postLinkedIn(item) {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgId = process.env.LINKEDIN_ORG_ID;
  if (!token || !orgId) return skip("LINKEDIN_ACCESS_TOKEN / LINKEDIN_ORG_ID not set");

  try {
    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        author: `urn:li:organization:${orgId}`,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: String(item.linkedin || "") },
            shareMediaCategory: "NONE",
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return fail(`HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    return ok({ id: res.headers.get("x-restli-id") || undefined });
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- Instagram ------------------------------ */
// Story publishing is a two-step container flow and needs a public image URL,
// so the SVG card is rendered to a hosted PNG first.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function postInstagramStory(item) {
  const igId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!igId || !token) return skip("IG_USER_ID / IG_ACCESS_TOKEN not set");
  if (item.skipInstagram || !item.card) return skip("no story card for this item");
  if (!renderEnabled()) return skip("HCTI_USER_ID / HCTI_API_KEY not set");

  try {
    const imageUrl = await renderStoryPng(buildStorySvg(item.card));

    const createRes = await fetch(
      `https://graph.instagram.com/v21.0/${igId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: imageUrl,
          media_type: "STORIES",
          access_token: token,
        }),
      }
    );
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created?.id) {
      return fail(created?.error?.message || `container HTTP ${createRes.status}`);
    }

    // Give Instagram a moment to fetch and process the image.
    await sleep(Number(process.env.IG_PUBLISH_DELAY_MS || 10000));

    const pubRes = await fetch(
      `https://graph.instagram.com/v21.0/${igId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: created.id, access_token: token }),
      }
    );
    const published = await pubRes.json().catch(() => ({}));
    if (!pubRes.ok) {
      return fail(published?.error?.message || `publish HTTP ${pubRes.status}`);
    }
    return ok({ id: published?.id, imageUrl });
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- all ---------------------------------- */

// Post one item everywhere. Telegram first (primary channel), then the rest in
// parallel — a failure in one is reported, never thrown.
export async function publishItem(item) {
  const telegram = await postTelegram(item);
  const [x, linkedin, instagram] = await Promise.all([
    postX(item),
    postLinkedIn(item),
    postInstagramStory(item),
  ]);
  return { telegram, x, linkedin, instagram };
}
