# One video → Instagram, TikTok, YouTube Shorts, X and LinkedIn

**Feasibility research — August 2026**

You upload one short video (under three minutes). The system posts it to Instagram
Reels, TikTok, YouTube Shorts, X and LinkedIn, unattended.

**Verdict: yes, this is buildable, and every platform has an official public API for
it.** No scraping, no browser automation, no unofficial endpoints. What makes it a
multi-week project rather than a weekend one is not the code — it is **platform
approval**. Two of the five platforms (TikTok and YouTube) will silently make your
posts *private* until a human at the platform reviews your app.

That is exactly the value Social Champ, Ayrshare, Blotato and the rest sell: they
already passed those audits, so you rent their approval instead of earning your own.

---

## 1. Platform-by-platform reality

| Platform | Official API | Approval needed to post *publicly* | Realistic time to first public post | Hard constraint to watch |
|---|---|---|---|---|
| **Instagram Reels** | Instagram Platform — Content Publishing | **No** (own account, Standard Access) | ~1 day | Must be a Professional (Business/Creator) account; video must sit on a public URL |
| **LinkedIn** | Videos API + Posts API | **No** for personal profile (self-serve product); **yes** for a Company Page | ~1–2 days | Chunked 4 MB part upload with ETags; async publish |
| **X** | v2 chunked media upload + POST /2/tweets | **No** | ~1 day | **140-second video cap unless the account has X Premium**; API is now paid per request |
| **YouTube Shorts** | Data API v3 `videos.insert` | **Yes — audit.** Unaudited projects have every upload forced to *private* | 1 day of code + audit wait | 100 uploads/day; ≤3 min + vertical = Short |
| **TikTok** | Content Posting API (Direct Post) | **Yes — audit.** Unaudited apps can only post `SELF_ONLY` (private) | 2–4 weeks of audit rounds | Strict UX rules your app must implement to pass |

### 1.1 Instagram Reels — the easy one

Three calls, all documented on
[Meta's Content Publishing page](https://developers.facebook.com/docs/instagram-platform/content-publishing):

1. `POST /<IG_ID>/media` with `media_type=REELS` and `video_url=<public URL>` → returns a container ID
2. Poll `GET /<IG_CONTAINER_ID>?fields=status_code` until `FINISHED` (Meta recommends once a minute, max 5 minutes)
3. `POST /<IG_ID>/media_publish` with `creation_id=<container ID>`

Facts that matter:

- **Media must be publicly reachable.** Meta's docs are explicit: *"We cURL media used
  in publishing attempts, so the media must be hosted on a publicly accessible server
  at the time of the attempt."* So you need object storage with public URLs (R2, S3,
  Supabase Storage). Alternatively, apps using Facebook Login can use the **resumable
  upload session** (`upload_type=resumable` → `POST https://rupload.facebook.com/ig-api-upload/...`)
  and push the bytes directly, no public URL required.
- **Rate limit: 100 API-published posts per rolling 24 hours**, enforced at
  `media_publish`. You can check current usage at `GET /<IG_ID>/content_publishing_limit`.
- **No App Review needed for your own accounts.** Standard Access covers Instagram
  accounts that have a role on your app. Advanced Access (which needs App Review +
  business verification) is only required to publish for *other people's* accounts.
  Since this posts to `@sugimotovisa` / `@sugimotovisa.europe`, you stay in Standard Access.
- Permissions: `instagram_business_basic` + `instagram_business_content_publish`
  (Instagram Login) or `instagram_basic` + `instagram_content_publish` + `pages_read_engagement`
  (Facebook Login).
- **Page Publishing Authorization (PPA)** on the linked Facebook Page will block
  publishing until completed. Do it preemptively.
- There is an `is_ai_generated=true` flag for self-disclosure of AI content, and
  `trial_params` if you ever want the reel shown to non-followers first.
- Specs: MP4/MOV, H.264 or HEVC, AAC audio, 9:16 at 1080×1920 for the Reels tab.
  A 3-minute reel is well inside limits.

**This repo already posts Instagram stories** (`lib/draws/story.js`, `IG_USER_ID` /
`IG_ACCESS_TOKEN` in `.env.example`), so the account, the app and the token plumbing
already exist. Reels is the same endpoint with a different `media_type`.

### 1.2 LinkedIn — mechanical but fiddly

Per the [Videos API reference](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api):

1. `POST https://api.linkedin.com/rest/videos?action=initializeUpload` with
   `{"initializeUploadRequest": {"owner": "urn:li:person:…", "fileSizeBytes": N}}`
   → returns a `urn:li:video:…`, an `uploadToken`, and an array of `uploadInstructions`
   (each with `firstByte`, `lastByte`, `uploadUrl`)
2. Split the file into **4 MB parts** (`split -b 4194303`) and `PUT` each part to its
   upload URL. **Keep the `ETag` response header of every part.**
3. `POST …/rest/videos?action=finalizeUpload` with the `uploadToken` and
   `uploadedPartIds` = the ETags **in part order**
4. Poll the video until `status` is `AVAILABLE` (it passes through `WAITING_UPLOAD` →
   `PROCESSING`; `PROCESSING_FAILED` carries a `processingFailureReason`)
5. `POST /rest/posts` referencing the video URN

Facts:

- Required headers on every call: `LinkedIn-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`.
- Video specs: **3 seconds to 30 minutes, 75 KB to 500 MB, MP4.** Max video size 5 GB
  at the upload layer, but the feed spec is the binding one.
- **Personal profile** posting uses the self-serve *Share on LinkedIn* product and the
  `w_member_social` scope — no approval queue. **Company Page** posting needs
  `w_organization_social` and access to the Community Management API, which is an
  approval process.
- Video posts publish **asynchronously**. Read the post back and check
  `lifecycleState`: `PUBLISH_REQUESTED` = still processing, `PUBLISH_FAILED` = must be retried by editing the post.
- Access tokens last ~60 days. This is the single most common cause of a silently dead
  channel — the repo's README already flags it for the draws poster.
- LinkedIn versions sunset: the 202508 version dies 2026-08-17, so pin a current
  `LinkedIn-Version` and plan to bump it roughly annually.

### 1.3 X — trivial code, two real gotchas

Flow: chunked upload `INIT` → `APPEND` (≤5 MB per chunk, `segment_index` 0,1,2…) →
`FINALIZE` → if the response carries `processing_info`, poll `STATUS` until succeeded →
`POST /2/tweets` with `media_ids`.

Gotchas:

1. **The 140-second cap.** Non-premium accounts can only upload videos of up to
   **140 seconds (2:20)** via the API. Your stated ceiling is three minutes. Either the
   posting account holds **X Premium**, or the pipeline must produce a trimmed X-specific
   cut. This is the one constraint that breaks the "one file everywhere" assumption.
2. **The API is no longer free.** On 6 February 2026 X
   [replaced tiered pricing with pay-per-use](https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476)
   as the default for new developers — reported at ~$0.015 per post created, rising to
   ~$0.20 if the post contains a link, with no free tier and no new Basic/Pro signups.
   Legacy Basic ($200/mo) and Pro ($5,000/mo) subscriptions continue for existing
   customers. At one video a day this is cents per month — but confirm current numbers
   in the developer portal before committing, since this is the fastest-moving item in
   this document.

**This repo already has working X credentials and OAuth 1.0a signing**
(`lib/draws/publish.js:oauthHeader`), and OAuth 1.0a tokens never expire — the media
upload endpoints accept the same signing. This is the least new work of the five.

### 1.4 YouTube Shorts — one approval gate, then easy

`POST https://www.googleapis.com/upload/youtube/v3/videos` (resumable upload),
scope `https://www.googleapis.com/auth/youtube.upload`.

A video becomes a **Short** automatically when it is vertical and ≤3 minutes — there
is no "Shorts" flag to set. Your 3-minute ceiling is exactly the Shorts boundary, so
encode to ≤179s to be safe.

The blocker, quoted verbatim from
[the `videos.insert` reference](https://developers.google.com/youtube/v3/docs/videos/insert):

> All videos uploaded via the `videos.insert` endpoint from unverified API projects
> created after 28 July 2020 will be restricted to private viewing mode. To lift this
> restriction, each API project must undergo an audit to verify compliance with the
> Terms of Service.

So uploads will *work* on day one — they will just be private. You submit the
[YouTube API audit form](https://support.google.com/youtube/contact/yt_api_form) and
wait. For a legitimate first-party "post my own videos to my own channel" use case
this is normally granted, but the wait is real and not under your control.

Other facts:
- **Quota: 100 uploads per day**, in a dedicated Video Uploads bucket costing 1 unit per
  call (this is a change from the old 1,600-units-against-10,000 model — uploads no
  longer eat your whole daily quota).
- Max file size 256 GB; accepts `video/*`.
- Settable fields include `snippet.title` (100 chars), `snippet.description`,
  `snippet.tags[]`, `status.privacyStatus`, `status.publishAt` (native scheduling!),
  `status.selfDeclaredMadeForKids`, and `status.containsSyntheticMedia` for AI disclosure.
- `notifySubscribers` defaults to true.
- Watch the OAuth side too: refresh tokens for an app still in **Testing** publishing
  status expire after 7 days. Push the Cloud Console app to **Production** or the
  automation dies weekly.

### 1.5 TikTok — the hard one

Content Posting API, `video.publish` scope for **Direct Post** (there is also a
lower-privilege "Upload" mode that drops the video into the creator's inbox as a draft
they finish manually — `video.upload` scope, no audit needed for the draft path).

Direct Post flow: `POST /v2/post/publish/creator_info/query/` (mandatory — returns the
creator's nickname, avatar and current posting limits) → `POST /v2/post/publish/video/init/`
→ upload → poll status.

Two source modes:
- `PULL_FROM_URL` — TikTok fetches the file. **The URL must live under a domain you have
  verified** through *Manage URL properties* on the TT4D app page. HTTPS, no redirects,
  reachable for the whole download (times out one hour after the task starts).
- `FILE_UPLOAD` — you push bytes. Chunks must be **≥5 MB and ≤64 MB** (final chunk may
  run to 128 MB); files under 5 MB go in one piece. The `upload_url` is valid for one hour.

The gate:

- **Unaudited clients can only post `SELF_ONLY`** — visible to the creator alone.
  During that period the app is capped at ~5 users posting per 24 hours and the posting
  accounts must be set to private.
- Getting audited takes **2–4 weeks and usually several rounds**, and the reviewers
  check specific UX behaviour in your app: you must display the creator's username and
  avatar before each post, let the creator choose the privacy level (public / friends /
  private), and disclose commercial content correctly. Get any of it wrong and you go
  back in the queue.
- It is a **two-stage** process: first getting the Content Posting API added to the app
  at all, then the audit that makes posts visible to anyone but you.

For a single-brand automation, TikTok is where "build it yourself" stops being cheap.

---

## 2. The cross-cutting engineering problems

These bite regardless of which platforms you ship.

**Every upload is asynchronous.** All five platforms return a job handle, not a result.
Instagram polls a container `status_code`; X polls `processing_info`; LinkedIn polls
video `status` *and then* post `lifecycleState`; TikTok polls a publish status; YouTube
processes after the resumable upload completes. This forces a **job queue with a
per-target state machine**, not a request/response handler. Serverless function
timeouts (Vercel's included) will cut you off mid-poll — you want the long-running host
and the self-scheduler pattern this repo already uses for draws
(`lib/draws/scheduler.js` + `instrumentation.js`).

**One file does not fit five platforms.**
- Duration: X caps at 140s without Premium; YouTube Shorts caps at 180s (3 min); Instagram
  Reels and TikTok comfortably exceed both. Your three-minute ceiling straddles the X limit.
- Aspect: 9:16 is native for Reels/TikTok/Shorts and acceptable on X and LinkedIn, but
  it wastes LinkedIn feed real estate — 1:1 or 4:5 performs better there.
- Codec: normalise to MP4 / H.264 / AAC, `moov` atom at the front, closed GOP. Anything
  exotic will pass one platform's validator and fail another's.

  The pragmatic answer is an **ffmpeg normalisation step** that emits one master 9:16
  H.264 file plus, when the source exceeds 140s, a trimmed X cut — rather than five
  separate renditions.

**Media hosting is a hard requirement, not an optimisation.** Instagram cURLs a public
URL. TikTok's `PULL_FROM_URL` needs a *verified* domain. So you need object storage
(Cloudflare R2 or S3) with public objects on a domain you control, plus a retention
policy so it does not grow forever.

**Token lifecycle is the #1 source of silent failure.**

| Platform | Credential | Expiry |
|---|---|---|
| X | OAuth 1.0a consumer + access token | never |
| Instagram | long-lived user/page token | ~60 days, refreshable |
| LinkedIn | access token | ~60 days |
| TikTok | access token / refresh token | ~24 hours / ~365 days |
| YouTube | OAuth refresh token | long-lived in Production; **7 days in Testing** |

You need a scheduled refresh job and an alert when one lapses. The repo's existing
pattern — per-channel result objects that never throw, plus a Telegram ping via
`DRAWS_ALERT_CHAT_ID` — is exactly right and should be reused.

**Per-platform copy, not one caption.** Character limits differ sharply (X 280 vs
Instagram 2,200 vs LinkedIn 3,000 vs YouTube title 100 / description 5,000), and
hashtag conventions differ more. This is a natural fit for the Claude script generator
already in this repo: generate one narrative, then five platform-shaped captions.

**Compliance.** All five now have AI-disclosure mechanisms (Instagram `is_ai_generated`,
YouTube `status.containsSyntheticMedia`, TikTok's AIGC label). Use them where relevant —
mislabelled AI content is a fast route to a strike.

---

## 3. Build it, or rent an aggregator?

You were right that services like **Social Champ** already do this. They are real
options, not competitors to route around.

| Option | Cost | TikTok/YouTube approval | Control | Notes |
|---|---|---|---|---|
| **Direct integration** (this repo) | API fees only (~cents/mo on X; everything else free) | **You do the audits** | Total | 3–6 weeks of work incl. approval waits |
| **Social Champ** | REST API is on the **Agency plan, ~$149/mo**; cheaper tiers have no API | Inherited | Low | API key or OAuth2, `Authorization: Bearer`, 12+ platforms, 120 req/min, has an MCP server |
| **Ayrshare** | **$149/mo** (1 profile) → $299 (10) → $599 (30) | Inherited | Low | The most developer-oriented; 13+ networks; billed per profile |
| **Blotato** | from ~$29/mo | Inherited | Low | Aimed at AI/automation builders |
| **upload-post** | from ~$16/mo (annual) | Inherited | Low | Cheapest credible hosted option; unlimited uploads on paid plans |
| **Postiz** (open source) | free self-hosted; ~$29/mo cloud | **You still do the audits when self-hosting** | High | Docker; includes API + MCP server |
| **Buffer API** | — | — | — | **Rule it out: no media upload endpoint.** URL-only, public beta, no third-party OAuth |

The decisive point is the approval column. An aggregator's single biggest deliverable is
that **its TikTok and YouTube audits are already passed**, so your videos go out public
on day one instead of after a 2–4 week TikTok review. If you self-host Postiz, you get
the code for free and keep the audit problem — which is the expensive half.

Counterweights: an aggregator is a monthly bill for something you post to once a day,
it sits between you and your accounts, your media passes through it, and you inherit
its outages and its rate limits.

---

## 4. Recommendation

**Hybrid, in this order.** Ship the platforms you already have credentials for, and do
not let the two audit-gated platforms hold the other three hostage.

**Phase 1 — Instagram + X + LinkedIn, direct (≈1 week).**
No approvals needed for any of the three. This repo already holds working credentials
for all three, already has OAuth 1.0a signing for X, already posts to Instagram, and
already has the failure-isolation and alerting patterns. Add object storage and the job
queue and you are live.

**Phase 2 — YouTube, direct + audit (≈2 days of code, then wait).**
Write the uploader, ship it posting `private`, and submit the audit form the same day.
When the audit clears, flip the default `privacyStatus` to `public`. Nothing else changes.
Also push the Google Cloud app from Testing to Production so refresh tokens stop expiring weekly.

**Phase 3 — TikTok: rent it, or earn it.**
Either (a) submit for the Content Posting API audit and budget 2–4 weeks plus UX
rework, or (b) route only TikTok through an aggregator, or (c) use the no-audit
`video.upload` draft path — the video lands in your TikTok inbox and you tap publish.
Option (c) is genuinely reasonable for one video a day and costs nothing.

**Build it so the choice stays reversible.** Every target should be an adapter behind
one interface — the same contract `lib/draws/publish.js` already uses:

```
publish(job) → { ok, skipped?, reason?, id?, error? }   // never throws
```

Then `lib/video/targets/aggregator.js` is just one more adapter. Renting TikTok today
and bringing it in-house after your own audit clears becomes a one-file change, not a
rewrite.

### Proposed shape inside this repo

```
lib/video/
  store.js            job records (reuse the Google Sheet Library pattern)
  normalize.js        ffmpeg → master 9:16 H.264/AAC + trimmed X cut if >140s
  media.js            upload to R2/S3, return public URLs
  captions.js         one script → five platform-shaped captions (Claude)
  targets/
    instagram.js      container → poll status_code → media_publish
    x.js              INIT/APPEND/FINALIZE → poll → POST /2/tweets
    linkedin.js       initializeUpload → 4MB PUTs + ETags → finalizeUpload → /rest/posts
    youtube.js        resumable videos.insert
    tiktok.js         creator_info → init → upload → poll
    aggregator.js     optional escape hatch
  run.js              orchestrator: per-target state machine, retries, idempotency

app/api/video/upload/route.js     accept a file, create the job
app/api/video/run/route.js        one cycle (scheduler + cron target)
app/api/video/status/route.js     setup self-check, mirroring /api/draws/status
```

This mirrors the draws poster one-for-one, so the scheduler, the "already posted"
memory, the per-channel isolation and the Telegram alerting all carry over unchanged.

### Effort estimate

| Phase | Work | Waiting |
|---|---|---|
| 0 — storage, job model, upload UI | 1–2 days | — |
| 1 — Instagram + X + LinkedIn | 3–4 days | — |
| 2 — YouTube | 2 days | audit review |
| 3 — TikTok (direct) | 3 days | 2–4 weeks audit |
| 3′ — TikTok (aggregator or draft path) | 0.5–1 day | — |

---

## 5. Decisions needed before building

1. **Does the X account have X Premium?** If not, anything over 140 seconds needs a
   trimmed X-specific cut — which decides whether ffmpeg is in scope for Phase 1.
2. **Personal LinkedIn profile or Company Page?** Profile is self-serve; a Page needs
   Community Management API approval.
3. **TikTok: audit, aggregator, or the draft-inbox path?** This is the single biggest
   cost/effort fork in the project.
4. **Which accounts exactly** — is this the existing `@sugimotovisa` /
   `@sugimotovisa.europe` brand, or new channels?
5. **Fully unattended, or approve-then-post?** The repo has both patterns already (draws
   auto-post; topics use a swipe-to-approve deck).

---

## Sources

- [Meta — Instagram Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing)
- [Meta — Instagram Platform overview](https://developers.facebook.com/docs/instagram-platform/overview/)
- [LinkedIn — Videos API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api)
- [Google — YouTube Data API `videos.insert`](https://developers.google.com/youtube/v3/docs/videos/insert)
- [Google — YouTube API quota and compliance audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)
- [X — chunked media upload](https://docs.x.com/x-api/media/quickstart/media-upload-chunked)
- [X — announcing pay-per-use pricing](https://devcommunity.x.com/t/announcing-the-launch-of-x-api-pay-per-use-pricing/256476)
- [TikTok — Content Posting API get started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [TikTok — content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines)
- [TikTok — media transfer guide](https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide)
- [Social Champ — developer docs](https://developers.socialchamp.com/) · [authentication](https://developers.socialchamp.com/docs/authentication) · [rate limits](https://developers.socialchamp.com/docs/rate-limits)
- [Buffer — hosting media (no upload endpoint)](https://developers.buffer.com/guides/hosting-media.html)
- Pricing/approval context: [Ayrshare pricing](https://www.blotato.com/blog/ayrshare-pricing) · [Social Champ pricing](https://www.socialchamp.com/pricing/) · [TikTok API approval](https://bundle.social/blog/tiktok-api-approval) · [X API pricing 2026](https://postproxy.dev/blog/x-api-pricing-2026/) · [upload-post alternatives](https://www.blotato.com/blog/upload-post-alternatives)
