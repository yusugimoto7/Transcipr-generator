# Ready-made options — what already exists so we don't build from scratch

**August 2026.** Everything here falls into two camps, and the split matters more than
any feature list:

- **Free code, your audits** — open-source repos you self-host. The upload code is
  written for you, but the TikTok and YouTube app audits are still yours to pass.
- **Paid API, their audits** — hosted services with ready n8n nodes. You pay monthly,
  and your posts go out public on day one because *their* apps already passed.

## Camp 1 — free code, your audits

| Project | What it is | Fit for us |
|---|---|---|
| [**Postiz**](https://github.com/gitroomhq/postiz-app) (~30k stars) | Full open-source scheduler: web UI, scheduling, public API, video posting to X, Instagram, LinkedIn, TikTok, YouTube and ~30 more. Docker/Railway deploy. Has an [official n8n community node](https://n8n.io/workflows/6653-automate-video-content-posting-to-multiple-social-platforms-with-postiz/) | **Best of this camp.** But its [self-host docs](https://docs.postiz.com/self-host/providers/overview) are explicit: every provider needs *your own* app keys as env vars — `INSTAGRAM_APP_ID`, TikTok client, Google client for YouTube… so the audit problem is unchanged. It also duplicates what our n8n already does well (scheduling, dedup, credentials) |
| [**Mixpost**](https://github.com/inovector/mixpost) | Self-hosted Laravel scheduler | Video posting sits in the **paid Pro tier**, so it's neither fully free nor audit-free — worst of both camps for us |
| Single-platform uploaders (`tiktok-uploader`, `instagrapi`, etc.) | Scripts that fake the mobile app or drive a browser with your session cookies | **Avoid.** Unofficial, break monthly, and risk getting the brand accounts banned — not acceptable for @sugimotovisa |

## Camp 2 — paid API, their audits, ready n8n pieces

This camp fits our stack best, because the "ready-made file" isn't a repo to run —
it's an **importable n8n workflow JSON plus a verified community node**:

| Ready piece | What you import | Cost |
|---|---|---|
| [**upload-post official n8n node**](https://github.com/Upload-Post/n8n-nodes-upload-post) | `n8n-nodes-upload-post` — publish video to TikTok, Instagram, YouTube, LinkedIn, X + 5 more from a workflow | from ~$16/mo |
| [**Blotato official n8n node**](https://github.com/Blotato-Inc/n8n-nodes-blotato) + [template 3522](https://n8n.io/workflows/3522-auto-publish-social-videos-to-9-platforms-via-google-sheets-and-blotato/) | "Auto-publish social videos to 9 platforms" — a finished workflow: sheet row → upload → 9 platforms | from ~$29/mo |
| [Postiz n8n template](https://n8n.io/workflows/6653-automate-video-content-posting-to-multiple-social-platforms-with-postiz/) | Same idea against a Postiz instance (cloud ~$23/mo, or self-hosted = back to camp 1) | varies |

Any of these is a working end-to-end pipeline in **an afternoon**, not weeks.

## Recommendation — a hybrid, using ready pieces where they pay off

Building everything from a ready-made service means paying monthly for Instagram,
LinkedIn and X posting **we already have working credentials for**. Building everything
from scratch means writing five upload dances when two of them are genuinely annoying
to earn. So split it:

1. **Instagram, LinkedIn, X, Telegram — keep our own** (phases 1–2 of the design).
   Already-working credentials, no fees, and the Instagram Reel branch is two HTTP
   nodes we already know how to write because the stories branch is the same shape.
2. **TikTok + YouTube — start on the upload-post n8n node** (~$16/mo). Public posts on
   day one, no audits, one node to configure. This replaces the "TikTok draft inbox +
   wait for audits" phases entirely for now.
3. **Optionally graduate later.** File our own YouTube audit (free, easy) and TikTok
   audit in the background; when they clear, swap the node for our own branches and
   drop the subscription. The fan-out design keeps each platform as an isolated
   branch, so the swap is one branch at a time, not a rewrite.

Net effect: ~$16/mo buys away the only two hard approval problems, everything else
stays free and under our own keys, and nothing blocks the first working version.
