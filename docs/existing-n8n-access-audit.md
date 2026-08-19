# What your n8n already has — access audit for the video pipeline

Read from the live n8n instance (workflow **“Canada Draws — all programs”**, active,
hourly at :07) and the committed `workflows/unified-draw-notifier.workflow.json`.

**Headline: three of the five platforms are already authorised.** The two that are
missing — YouTube and TikTok — are exactly the two that need a platform audit anyway.
Nothing you already have needs to be re-approved.

n8n's API redacts credential values, so what follows is credential *types* and node
configuration. No secrets were read or written.

---

## The four channels you post to today

| Channel | How it's wired now | Credential type | Carries over to video? |
|---|---|---|---|
| **Instagram** | raw HTTP → `graph.instagram.com/v21.0/{ig-id}/media` then `/media_publish`, `media_type=STORIES`, `image_url=` a hosted PNG | generic query auth (IG user token) | **Yes, completely.** A Reel is the same two calls with `media_type=REELS` and `video_url=` |
| **LinkedIn** | `linkedIn` node, `postAs: organization`, org `90406990`, `shareMediaCategory: IMAGE` | `linkedInCommunityManagementOAuth2Api` | **Access yes, node no.** See below |
| **X** | `twitter` node v2, text only, no attachments | `twitterOAuth2Api` | **Partly.** See below |
| **Telegram** | `telegram` node → channel `@testchannel_draws` | `telegramApi` (bot token) | **Yes** — for the report. Not for carrying the file |

Supporting pieces that also carry over: the `posted_draws` **data table** dedup pattern,
and specifically the *“Record the draw FIRST, then post”* ordering — that is already the
right idempotency design and the video jobs should use it unchanged.

### Instagram — nothing new needed

You are on **Instagram API with Instagram Login** (`graph.instagram.com`, token as a
query parameter). Publishing a Reel is the identical container → publish pair you
already run for stories:

```
POST graph.instagram.com/v21.0/{ig-id}/media
     media_type=REELS   video_url=https://<your-domain>/videos/<id>/master.mp4
POST graph.instagram.com/v21.0/{ig-id}/media_publish
     creation_id=<container id>
```

The only extra step is polling `GET /{container-id}?fields=status_code` until
`FINISHED` — video containers take longer than image ones, so the existing fixed `Wait`
node should become a poll loop.

One consequence of being on Instagram Login rather than Facebook Login: the resumable
upload host (`rupload.facebook.com`) is not available to you, so **the video must be at a
public URL.** That is not a limitation in practice — it is exactly what you already do
with the HCTI-hosted PNG.

### LinkedIn — you have the hard part already

`linkedInCommunityManagementOAuth2Api` means your app holds the **Community Management
API** product. That is LinkedIn's approval-gated product, and you already posting to
organization `90406990` proves it works. Video uses the same `w_organization_social`
permission — **no new LinkedIn approval to chase.**

What does *not* carry over is the node. n8n's LinkedIn node only offers
`shareMediaCategory` of `IMAGE`, `ARTICLE` or `NONE` — there is no video option. So the
LinkedIn video branch has to be built from HTTP Request nodes:

```
POST /rest/videos?action=initializeUpload   → video URN + upload part URLs
PUT  each 4 MB part                          → keep every ETag
POST /rest/videos?action=finalizeUpload      → uploadToken + the ETags in order
GET  the video until status = AVAILABLE
POST /rest/posts                             → referencing the video URN
```

### X — the one credential that genuinely does not carry over

Your n8n X credential is `twitterOAuth2Api`. n8n's predefined X OAuth2 credential
requests a fixed scope list that **does not include `media.write`**, so that token can
post text but cannot upload a video. The `twitter` node has no media-upload operation
either.

You are not stuck, because **the Next.js app already holds OAuth 1.0a X credentials**
(`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET` in `.env.example`), and
OAuth 1.0a is fully accepted by the chunked media upload endpoints. Two ways forward:

1. **Use the OAuth 1.0a keys** for the X branch — signed inside a Code node, or by
   calling the Next.js app's X adapter. Recommended: those tokens never expire.
2. Re-authorise the n8n credential with `media.write` appended manually to the scope
   list during the OAuth consent step. Workable, but fragile.

Separately: X moved to pay-per-use pricing in February 2026. Worth checking which plan
this app sits on before the first video goes out.

---

## What is missing entirely

| Piece | Status | What it needs |
|---|---|---|
| **YouTube** | No credential, no workflow | A Google OAuth2 credential. **n8n has a native YouTube node with `video: upload`** — this is the easiest of the five to add. Uploads post as *private* until the API project passes Google's audit |
| **TikTok** | No credential, no node | HTTP Request nodes against the Content Posting API, plus either the audit (2–4 weeks) or the no-audit draft path |
| **Object storage** | No S3/R2 credential found | An R2 bucket on a domain you own. n8n's **AWS S3 node** drives R2 directly — R2 is S3-compatible. Instagram fetches from this URL; TikTok requires the domain be verified |
| **ffmpeg** | Not available in n8n | Probably not needed — see below |

---

## Revised recommendation: build it in n8n, not in the Next.js app

My earlier design put this in the Next.js app. Seeing the n8n instance changes that.
Build it in n8n:

- **Three of five credentials already live there**, in production, working.
- **The upload page comes free.** n8n's Form Trigger accepts file uploads —
  `N8N_FORMDATA_FILE_SIZE_MAX` defaults to 200 MiB, comfortably above a 3-minute
  vertical video. No signed-upload endpoint to write, no new page to build.
- **YouTube is a single native node.**
- **The dedup data table and the record-first ordering already exist** and are proven.
- It is where you already work every day.

The Next.js app keeps its role for the pieces n8n cannot do: **ffmpeg**, and the X
OAuth 1.0a signing if you would rather not hand-roll it in a Code node.

### About ffmpeg

n8n cannot transcode. Two of the platform limits are the reason you might want it:
X refuses video over **140 seconds** without Premium on the account, and every platform
wants MP4 / H.264 / AAC with the `moov` atom at the front.

Start without it. Modern editors already export exactly that, and if a clip runs past
140 seconds the X branch can simply be skipped for that post rather than blocking
everything else. Add a transcode step only when a real file fails.

---

## What I need from you

1. **X** — do you still have the OAuth 1.0a keys (`X_API_KEY` / `X_API_SECRET` /
   `X_ACCESS_TOKEN` / `X_ACCESS_SECRET`), and which plan is that X app on? Does the
   posting account have X Premium? *(Without Premium, X caps video at 140 seconds.)*
2. **Instagram** — who refreshes the IG token today, and is it the long-lived one?
   Same account as the stories, or a different one for video?
3. **Storage** — do you have Cloudflare R2 or an AWS/S3 bucket already? If not I will
   spec one. Google Drive links will not work: Instagram must be able to cURL the file
   directly.
4. **Channels** — the live draws workflow posts to Telegram `@testchannel_draws`. Is
   that intentional, and should video posts go to the same channels as the draws or
   different ones?
5. **YouTube** — which Google account owns the channel, and do you want me to prepare
   the API audit submission?
6. **TikTok** — draft-to-inbox first (works immediately, you tap publish), or go
   straight for the audit?

Answers to 1 and 3 unblock the first working version. The rest can follow.
