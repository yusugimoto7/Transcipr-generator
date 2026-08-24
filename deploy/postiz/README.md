# Postiz on the Windows PC — one script

`Setup-Postiz.ps1` replaces the hand-editing steps: it checks the machine,
downloads Postiz, writes the config with the right domain and a freshly
generated secret, trims three unnecessary containers, and starts everything.

## Before running it

Two installers, both point-and-click, both required first:

1. **WSL2** — open PowerShell **as administrator**, run `wsl --install`, reboot.
2. **Docker Desktop** (AMD64, keep the WSL2 option ticked) and **Git for
   Windows**, both with default options. Start Docker Desktop and wait for the
   whale icon to settle.

## Running it

Download `Setup-Postiz.ps1` to the Downloads folder, then in a **normal**
PowerShell window:

```powershell
cd $env:USERPROFILE\Downloads
.\Setup-Postiz.ps1
```

If Windows blocks the script, allow it for this session only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

The first run downloads several GB and can take 15–20 minutes. It finishes by
printing whether Postiz answered on `http://localhost:4007`.

**Re-running is safe.** It detects an existing configuration and leaves your
JWT secret and platform keys alone.

## What it configures

| Setting | Value |
|---|---|
| `MAIN_URL` / `FRONTEND_URL` | `https://post.sugimotogroup.org` |
| `NEXT_PUBLIC_BACKEND_URL` | `https://post.sugimotogroup.org/api` |
| `JWT_SECRET` | generated on the PC, never leaves it |
| `STORAGE_PROVIDER` | `local` — Postiz's own disk, no WordPress, no R2 |

The domain is set **before** first launch on purpose: `MAIN_URL` is the OAuth
redirect base registered with Meta, Google and TikTok. Getting it right up
front means a later move to another machine is invisible to those platforms.

## Containers it removes

The stock compose file ships nine containers. Three are optional extras that
Postiz never calls, so the script deletes them:

- `spotlight` — Sentry error-debugging UI
- `temporal-admin-tools` — Temporal command-line image
- `temporal-ui` — Temporal's web dashboard

Six remain: the app, its PostgreSQL and Redis, and Temporal with its own
PostgreSQL and Elasticsearch. Saves roughly 250–400 MB, which matters on 8 GB.

## Facts confirmed by reading the real compose file

- Elasticsearch is pinned to a **256 MB heap** (`ES_JAVA_OPTS=-Xms256m -Xmx256m`),
  so the stack is lighter than a generic Elasticsearch deployment implies.
- All storage uses **named Docker volumes**, not bind mounts — no Windows path
  translation problems.
- Ports published: **4007** (Postiz). The tunnel points at this one.

## After the script

1. Cloudflare Tunnel → `post.sugimotogroup.org` → `localhost:4007`
2. Create your admin account **on the real domain**, then set
   `DISABLE_REGISTRATION: "true"` and run `docker compose down` + `up -d`
3. Windows power settings, Docker auto-start, and automatic sign-in
4. Platform keys for Meta / Google / TikTok

Full walkthrough: `docs/postiz-home-install.md`.
