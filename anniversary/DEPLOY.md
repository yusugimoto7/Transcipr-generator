# Putting the site on Render

The site is plain static files — `index.html`, `images/`, `audio/`. Nothing to
compile. Render's Static Site plan hosts it free, with HTTPS included.

## Before you deploy: repository visibility

This site lives inside the `Transcipr-generator` repository, which is currently
**public**. That means the family photos in `anniversary/images/` — including
photos of the children — are visible to anyone who finds the repo.

Deploying to Render does not change that either way, but it is worth fixing
first. To make the repository private:

    GitHub → the repo → Settings → General → Danger Zone →
    Change repository visibility → Make private

Render deploys from private repositories on the free plan, so nothing about
the steps below changes.

## Option A — the dashboard (simplest)

1. Sign in at <https://dashboard.render.com> with your GitHub account.
2. **New +** → **Static Site**.
3. Pick the `Transcipr-generator` repository. Grant access if prompted.
4. Fill in:
   - **Name**: `hamed-and-yasi` (this becomes `hamed-and-yasi.onrender.com`)
   - **Branch**: `claude/anniversary-website-samples-tnktph`
   - **Root Directory**: leave blank
   - **Build Command**: leave blank
   - **Publish Directory**: `anniversary`
5. **Create Static Site**. First deploy takes a couple of minutes.

## Option B — the blueprint

`render.yaml` at the repository root already describes the service.

1. Dashboard → **New +** → **Blueprint**.
2. Choose the repository and the branch above.
3. Render reads `render.yaml` and creates the site with the caching headers
   already configured.

## A custom domain

Free `.onrender.com` subdomains work immediately. For your own domain
(say `hamedandyasi.com`), buy it anywhere, then in Render:

    the service → Settings → Custom Domains → Add Custom Domain

Render shows the DNS records to create at your registrar. HTTPS is issued
automatically once DNS resolves, usually within the hour.

## Adding the music

Drop your purchased MP3 in as `anniversary/audio/our-song.mp3`, commit, and
push — Render redeploys automatically. See `audio/README.md` for the details
and for why the file is not committed here.

If the repository is public, do not commit purchased audio to it: that
publishes the recording. Make the repository private first, or keep using the
SoundCloud fallback the page already ships with.

## Updating the site later

Every push to the deployment branch redeploys automatically. The `buildFilter`
in `render.yaml` limits that to commits that actually touch `anniversary/`.
