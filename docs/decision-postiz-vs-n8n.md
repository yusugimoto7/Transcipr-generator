# Decision: Postiz instead of the n8n video workflow

**Date:** August 2026. **Status:** proposed, pending one fact (see "What gates this").

## What changed

Two objections to the n8n build, both fair:

1. **Daily use.** An n8n form is a thin front door. There is no calendar, no
   per-platform caption editing, no preview, no "see what's scheduled".
2. **sugimotovisa.com should not be in the media path.** Staging 300 MB videos
   through the live business site was always the weakest part of the design —
   it was chosen only because it was free and already owned.

[Postiz](https://github.com/gitroomhq/postiz-app) (AGPL-3.0, ~35k stars, active)
answers both. It is a real scheduling product with a UI, and it hosts its own
media, so WordPress leaves the picture entirely.

## What Postiz actually solves

| Problem | n8n build | Postiz |
|---|---|---|
| Daily UX | one form, no calendar or preview | full UI: calendar, per-platform captions, preview, scheduling |
| Media hosting | staged via sugimotovisa.com, deleted after 2 h | `STORAGE_PROVIDER=local` — its own disk, no WordPress, no R2, no card |
| Instagram polling | hand-built 30 s loop | production-tested |
| TikTok `client_key` handshake | hand-built token refresher | handled, plus rotation and status polling |
| Facebook, YouTube | hand-built | handled |
| Failure isolation, retries | `onError: continue` per branch | built in |

## What Postiz does NOT solve

**Every API key is still yours to register, and every audit is still yours to
pass.** Postiz ships zero credentials. You still need:

- a Meta app for Instagram + Facebook
- a Google Cloud project for YouTube, plus the API audit before uploads go public
- a TikTok developer app with the Content Posting API

This was confirmed independently by the open-source research: *"Every repo answer
to 'needs my own API keys' is YES. No open-source code changes this."* Switching
tools moves none of that work.

## The real cost: the stack is heavier than it looks

The official `docker-compose.yaml` does not bring up one container. It brings up:

- Postiz app (port 4007 → 5000)
- PostgreSQL 17 + Redis 7.2
- **Temporal** workflow engine, its own **PostgreSQL 16**, and **Elasticsearch 7.17**
- Temporal admin tools + UI, and Spotlight

Elasticsearch alone typically wants 1–2 GB. The docs say a 2 GB / 2 vCPU VM has
been tested; the honest floor for this stack is **4 GB RAM**, and 6 GB if it
shares a box with anything else.

It also needs a **public HTTPS domain** — `MAIN_URL` is the OAuth redirect base,
so the callbacks from Meta, Google and TikTok land there. Something like
`post.sugimotogroup.org` behind a reverse proxy to port 4007.

And it becomes a service to run: updates, backups, and security — it holds the
access tokens for every connected social account.

## Recommendation

**Go with Postiz if a host with 4 GB+ free is available.** The daily UX is worth
it for something used every day, and it removes sugimotovisa.com from the media
path, which was the right instinct.

**If no such host exists,** the n8n build stays the pragmatic option — but the
WordPress staging step should be replaced with Cloudflare R2's free tier rather
than kept.

## What gates this

Where n8n runs, and how much headroom that machine has. If `n8n.sugimotogroup.org`
is a VPS with 4 GB+ free, Postiz goes alongside it on a subdomain. If n8n is on a
small box, or is n8n Cloud, a server is needed first.

## What happens to the existing work

- **The draws poster is untouched.** Different workflow, different job, still
  works. Postiz replaces nothing there.
- **The video fan-out workflow becomes redundant** if Postiz ships. It stays in
  the repo and stays inactive in n8n — a working fallback that costs nothing to
  keep.
- **The research does not go to waste.** The platform limits, the audit rules,
  the TikTok token behaviour and the traffic maths all still apply — they are
  properties of the platforms, not of the tool.

## Where Postiz can actually run (checked, August 2026)

| Host | Verdict |
|---|---|
| **Existing VPS with 4 GB+ free** | Best option. Costs nothing extra. |
| Small VPS (Hetzner/Contabo, ~EUR 4-8/mo) | Works well. One host runs all seven containers. |
| **Oracle Cloud Always Free** | **Does not work.** See below. |
| Render | Free tier sleeps after 15 min and its Postgres expires at 30 days. Paid is ~USD 105-125/mo because Render bills per service and Postiz is seven of them — roughly 15-20x a small VPS. |
| Vercel | Architecturally impossible: serverless, no persistent processes or disk, cannot host Temporal or Elasticsearch. |

### Oracle Always Free is ruled out — no ARM image

Oracle's free allowance is Ampere **ARM64** (2 OCPU / 12 GB since June 2026).
Postiz publishes **no arm64 Docker image**: the request to add multi-arch builds
([issue #995](https://github.com/gitroomhq/postiz-app/issues/995)) was **closed as
not planned**. The only routes would be building from source on ARM or running
under emulation, neither of which is sane for a stack that includes Elasticsearch.

Oracle's free x86 shapes are 1 GB micro instances — far below the 4 GB floor.

**Net: there is no free host that runs Postiz.** It needs either an existing
server with headroom, or a cheap paid VPS.

## Migrating later is easy, if the domain is set up right

Postiz state is only three things: the PostgreSQL database (accounts, connected
channels, tokens, scheduled posts), the uploads directory, and `.env`. Moving
hosts is `pg_dump` + restore, copy the uploads volume, copy `.env`, repoint DNS.
About an hour.

**The one decision that makes or breaks this: use your own subdomain from day
one** (e.g. `post.sugimotogroup.org`), never a host-provided URL. `MAIN_URL` is
the OAuth redirect base registered with Meta, Google and TikTok. Keep the domain
and a host move is invisible to every platform — no re-approval, no reconnecting
accounts. Change the domain and every platform app needs its callback updated.

Architecture is not a lock-in either way: x86 VPS to x86 VPS is a lift-and-shift.
