# Postiz at home (Windows) — zero-cost install on a PC you already own

The chosen path (Aug 2026): run Postiz on an owned x86 PC, exposed as
`https://post.sugimotogroup.org` through a free Cloudflare Tunnel. Total cost £0.
This is the video tutorial's local install **plus the three things it skips**:
a public HTTPS address for OAuth, always-on behaviour, and the platform keys.

**The machine is Windows** — the Linux commands in the video tutorial do not
work in PowerShell. This is the Windows path.

## 0 — The machine must qualify

- `echo $env:PROCESSOR_ARCHITECTURE` → must be `AMD64`. Postiz publishes **no
  ARM image** (issue #995 closed as not planned) — same reason Oracle's free
  tier was ruled out.
- Settings → System → About → **8 GB RAM minimum on Windows** (4 GB would do on
  Linux, but Windows takes 2–3 GB before Postiz starts). Windows 10 v2004+ or 11.
- Less than that → fall back to the n8n workflow + R2.

## 1 — WSL2 + Docker Desktop + Git

- Admin PowerShell: `wsl --install`, then **reboot**. (Needs virtualization
  enabled in BIOS.)
- Docker Desktop for Windows AMD64, keep the WSL2 backend option ticked.
  Free under 250 employees / $10M revenue — the one licence in this plan.
- Git for Windows, default options.
- Verify in a normal PowerShell: `docker --version`, `docker compose version`,
  `git --version`. **No `sudo`** — that is a Linux command and Docker Desktop
  does not need it.
- Give WSL2 headroom: `notepad $env:USERPROFILE\.wslconfig` →
  `[wsl2]` / `memory=6GB` / `processors=4`, then `wsl --shutdown`.

## 2 — Postiz

```powershell
mkdir $env:USERPROFILE\projects
cd $env:USERPROFILE\projects
git clone https://github.com/gitroomhq/postiz-app.git
cd postiz-app
```

Generate the secret with `docker run --rm alpine sh -c "head -c 32 /dev/urandom | base64"`
(no `openssl` on Windows), and edit the file with `notepad docker-compose.yaml`.

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
platforms. `docker compose up -d`, first boot takes minutes; verify at
`http://localhost:4007` but **create no account until the tunnel is up**.

## 3 — Cloudflare Tunnel (free)

1. Add `sugimotogroup.org` to Cloudflare Free. **Before switching nameservers,
   confirm the imported `n8n` DNS record matches today's and set it to DNS-only
   (grey cloud)** so n8n never blips. Switch NS at the registrar, wait for
   Active.
2. Zero Trust → Networks → Tunnels → create `postiz`, choose the **Windows
   64-bit** connector and run the shown command in an **admin** PowerShell. It
   installs cloudflared as a Windows service, so it starts before login —
   independent of Docker Desktop.
3. Public hostname: `post.sugimotogroup.org` → HTTP → `localhost:4007`.
   Verify from a phone on mobile data.

## 4 — First login, then lock

Register the admin account at the real domain, then set
`DISABLE_REGISTRATION: "true"` and `docker compose down` + `docker compose up -d`.
Any config change needs that down/up pair — saving the file alone does nothing.

## 5 — Making Windows behave like a server

Three settings, and the third is the one that bites:

1. Settings → System → Power → **Sleep: Never** on AC (lid-close: do nothing).
2. Docker Desktop → Settings → General → **Start Docker Desktop when you sign in**.
3. **Docker Desktop only starts when a user signs in.** Windows Update reboots
   on its own schedule; if the PC sits at the login screen, Postiz is silently
   down. Enable automatic sign-in via `netplwiz` (untick "Users must enter a
   user name and password"). Trade-off: physical access reaches the desktop —
   fine at home, not in a shared office.

Then reboot, touch nothing, and confirm the site returns on its own.

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
fails: upload from home Wi-Fi at `http://<LAN-IP>:4007` (skips Cloudflare; find
the IP with `ipconfig`); scheduling, OAuth and platform fetches keep using the
tunnel.

## Migration later

State = Postgres dump + uploads volume + `.env`/compose. Keep the domain and a
move to any x86 host — including off Windows onto a Linux VPS later — is
invisible to every platform.

The n8n fan-out workflow (FY3r8ASXztS6NB5t) stays inactive as the free fallback.

Interactive checklist version of this guide:
https://claude.ai/code/artifact/bdcd85be-82ba-45eb-9a64-7adfe9fba439
