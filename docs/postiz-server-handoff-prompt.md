# Handoff prompt: move Postiz to a server and run it for me

Copy everything below the line into a new Claude Code session that has SSH
access to a Linux server.

---

You are setting up a self-hosted **Postiz** social media publishing platform
for Sugimoto Visa, a Persian-language Canada/Europe immigration brand
(Instagram `@sugimotovisa` and `@sugimotovisa.europe`).

**Goal:** one video uploaded once, published automatically to Instagram,
Facebook, YouTube Shorts, TikTok and X. Reachable from any device by logging
in at `https://post.sugimotogroup.org`.

**Do the work yourself.** I am not technical and I do not want to run commands.
Use SSH to do everything on the server. Ask me for information only when it is
genuinely impossible for you to obtain it, and ask for all of it at once rather
than one item at a time.

## Hard constraints

- **Zero recurring cost.** No paid hosting, no paid SaaS. The one exception
  already accepted: X's API is pay-per-use (~$0.015/post, $0.20 if the post
  contains a link) and that project is already on that plan.
- **Do not run anything on my Windows PC.** A previous attempt installed Postiz
  there and it was painful. The server replaces it entirely.
- **Do not touch my live services.** `sugimotogroup.org` DNS is hosted at
  **IONOS** (nameservers `ns10xx.ui-dns.*`) and carries production records:
  `n8n.sugimotogroup.org` (Heroku), `odoo.sugimotogroup.org` (78.47.96.58,
  Hetzner), and email MX records. Breaking mail or Odoo is unacceptable.
  Prefer adding a single A record over migrating the zone.

## What already exists

- A working Postiz install on a Windows PC at `localhost:4007`, with Instagram,
  Facebook and X connected. Treat it as disposable — it is easier to set up
  fresh on the server than to migrate. Nothing of value is stored in it yet.
- A Hetzner server already runs my Odoo at **78.47.96.58**. Check whether it has
  capacity before using it (Postiz's full stack wants ~4 GB RAM and ~10 GB disk
  on top of Odoo). If it is too small, tell me and recommend an alternative.
- Repo `yusugimoto7/Transcipr-generator`, branch
  `claude/video-multiplatform-upload-bozs3x`, contains prior work:
  - `deploy/postiz/docker-compose.override.yaml` — hardening overrides, reusable
  - `docs/` — research on every platform's video API
  - `workflows/` — n8n workflows (leave alone)
- Platform developer apps already created, reuse them rather than making new ones:
  - **Meta app** "Sugimoto Visa Publisher", App ID `2133564544263694`, in
    Development mode, Business type. Facebook Login for Business configured.
  - **Google Cloud project** "Sugimoto Visa Publisher", project number
    `1000816569742`, YouTube Data API v3 enabled, OAuth consent screen in
    Testing with test users added.
  - **X app** "Sugimoto Postiz" inside an existing pay-per-use project.
  - **LinkedIn app** "Sugimoto Master Poster", Client ID `86br4teoi65d2p` —
    see the LinkedIn note below before touching it.

## Landmines already hit — do not rediscover these

1. **Postiz cannot set its login cookie on a public-suffix domain.**
   `getCookieUrlFromDomain` reduces the hostname to its registrable domain, so
   `*.ts.net`, `*.ngrok.io`, `*.duckdns.org` all silently fail: login returns
   200, no cookie is stored, the browser bounces back to the login form.
   Upstream issue gitroomhq/postiz-app#1143, still open. Use a hostname under
   `sugimotogroup.org`.

2. **nginx inside the Postiz image proxies to `localhost`**, which resolves to
   `::1` first, while the Next.js frontend (4200) and Nest backend (3000) listen
   on IPv4 only. Every request 502s. Fix: patch `proxy_pass` to `127.0.0.1` and
   mount the patched `nginx.conf` over the baked-in one.

3. **The Temporal stack in the upstream compose file has no restart policy and
   no readiness gating.** On a cold boot `temporal` (auto-setup) races
   `temporal-postgresql`, fails schema setup, exits 1, and never retries. The
   Postiz backend then throws
   `Name resolution failed for target dns:temporal:7233` in
   `TemporalRegister.onModuleInit`, never reaches `NestApplication.listen()`,
   and never binds port 3000 — while PM2 still reports it `online`. Fix:
   `restart: always` on every temporal service, a healthcheck on
   `temporal-postgresql` (`pg_isready -U temporal`) and on `temporal`
   (`tctl --address temporal:7233 cluster health`), and `depends_on` with
   `condition: service_healthy` from `postiz` to `temporal`.
   The override file in the repo already encodes all of this.

4. **LinkedIn is blocked and should be left out.** Community Management API and
   "Sign In with LinkedIn using OpenID Connect" are mutually exclusive on one
   LinkedIn app. My app has Community Management (my n8n uses it to post as the
   company page). Postiz requests the `openid` scope, which a Community
   Management app cannot grant, so the OAuth flow fails with
   `unauthorized_scope_error`. Upstream issue #1582. LinkedIn stays on n8n.
   Do not modify that LinkedIn app.

5. **YouTube**: the Google project is in Testing, which expires refresh tokens
   after 7 days. Publishing the app is blocked while a custom logo is uploaded
   (Google then demands verification). Either remove the logo and publish, or
   fill in App domain / privacy policy / terms and publish. Also note that until
   the project passes Google's audit, API uploads are forced to **private**.
   Tell me plainly what the state is rather than leaving it to surprise me.

## What to do

1. Assess the Hetzner server over SSH. Report RAM, disk, Docker presence, and
   what else is running, before changing anything.
2. Install Postiz with Docker Compose, applying the hardening from item 3 above.
3. Put it on `https://post.sugimotogroup.org` with a valid certificate. Prefer a
   reverse proxy with automatic Let's Encrypt (Caddy or Traefik). I will add the
   IONOS DNS record myself if you cannot — tell me the exact record to create.
4. Set `MAIN_URL`, `FRONTEND_URL` and `NEXT_PUBLIC_BACKEND_URL` to that
   hostname, generate a strong `JWT_SECRET`, and set
   `DISABLE_REGISTRATION: 'true'` once my account exists.
5. Make it survive reboots unattended. Verify by actually rebooting the server
   and confirming the site comes back without intervention.
6. Give me a checklist of the OAuth callback URLs to register at each platform,
   then walk me through connecting each channel — that part needs my browser.
7. Test one real video end to end, roughly 300 MB, and tell me what actually
   published versus what failed.

## What I need from you at the end

- The URL and how to log in.
- A plain-language list of anything that still needs me periodically (YouTube
  reconnection, token refreshes, anything else).
- An honest statement of what does not work and why.

## Things you must ask me for

Ask for all of these in your first reply, together:

- SSH access to the server (host, user, and how you should authenticate).
- Whether to reuse the Hetzner box at 78.47.96.58 or provision something else.
- The App Secrets for the Meta, Google and X apps — I will paste them directly
  into a file on the server rather than into chat if you prefer.
- Whether I have IONOS API credentials, if you want to manage DNS yourself.

Do not ask me to run commands on my own computer.
