# Postiz at home — zero-cost install on a computer you already own

The chosen path (Aug 2026): run Postiz on an owned x86 PC, exposed as
`https://post.sugimotogroup.org` through a free Cloudflare Tunnel. Total cost £0.
This is the video tutorial's local install **plus the three things it skips**:
a public HTTPS address for OAuth, always-on behaviour, and the platform keys.

## 0 — The machine must qualify

- `uname -m` → must be `x86_64`. Postiz publishes **no ARM image** (issue #995
  closed as not planned) — same reason Oracle's free tier was ruled out.
- `free -h` → ~4 GB RAM minimum (app + 2× PostgreSQL + Redis + Temporal +
  Elasticsearch). Less than that → fall back to the n8n workflow + R2.
- Guide assumes Ubuntu/Mint. Windows = Docker Desktop + WSL2, Part 1 differs.

## 1 — Docker Engine + Compose + git

Standard Docker apt-repository install (docs.docker.com/engine/install/ubuntu);
the `UBUNTU_CODENAME` fallback makes the same block work on Mint. Verify with
`docker --version`, `docker compose version`, `git --version`.

## 2 — Postiz

```
git clone https://github.com/gitroomhq/postiz-app.git && cd postiz-app
```

In `docker-compose.yaml`, on the postiz service:

```
MAIN_URL:                https://post.sugimotogroup.org
FRONTEND_URL:            https://post.sugimotogroup.org
NEXT_PUBLIC_BACKEND_URL: https://post.sugimotogroup.org/api
BACKEND_INTERNAL_URL:    http://localhost:3000
JWT_SECRET:              (openssl rand -base64 32)
STORAGE_PROVIDER:        local
```

`MAIN_URL` is the OAuth redirect base registered with Meta/Google/TikTok — own
subdomain from day one is what makes a later host migration invisible to the
platforms. `sudo docker compose up -d`, first boot takes minutes; verify at
`http://localhost:4007` but **create no account until the tunnel is up**.

## 3 — Cloudflare Tunnel (free)

1. Add `sugimotogroup.org` to Cloudflare Free. **Before switching nameservers,
   confirm the imported `n8n` DNS record matches today's and set it to DNS-only
   (grey cloud)** so n8n never blips. Switch NS at the registrar, wait for
   Active.
2. Zero Trust → Networks → Tunnels → create `postiz`, run the shown
   Debian/Ubuntu connector install on the PC (installs cloudflared as a
   boot-time service).
3. Public hostname: `post.sugimotogroup.org` → HTTP → `localhost:4007`.
   Verify from a phone on mobile data.

## 4 — First login, then lock

Register the admin account at the real domain, then set
`DISABLE_REGISTRATION: "true"` and `docker compose down && docker compose up -d`.

## 5 — Server behaviour

Disable suspend (incl. lid-close on laptops); `sudo systemctl enable docker`;
reboot once and confirm the site comes back on its own.

## 6 — Platform keys (unchanged by any tool)

- Meta app → `FACEBOOK_APP_ID/SECRET` (Facebook Pages + IG Business; own
  accounts = Standard Access, no App Review)
- Google OAuth client → `YOUTUBE_CLIENT_ID/SECRET`; publish the app out of
  Testing; free API audit before uploads can be public
- TikTok dev app → `TIKTOK_CLIENT_ID/SECRET`; Postiz handles the `client_key`
  OAuth quirk and token rotation internally; TikTok's audit still gates public
  auto-posting

Exact callback URLs per provider: docs.postiz.com/providers.

## Known caveat — test early

Cloudflare Free caps a single HTTP upload at ~100 MB. Postiz's streamed uploads
should chunk under it — verify with a real 300 MB video in the first hour. If it
fails: upload from home Wi-Fi at `http://<LAN-IP>:4007` (skips Cloudflare);
scheduling, OAuth and platform fetches keep using the tunnel.

## Migration later

State = Postgres dump + uploads volume + `.env`/compose. Keep the domain and a
move to any x86 host is invisible to every platform.

The n8n fan-out workflow (FY3r8ASXztS6NB5t) stays inactive as the free fallback.

Interactive checklist version of this guide:
https://claude.ai/code/artifact/bdcd85be-82ba-45eb-9a64-7adfe9fba439
