# Teleprompter Studio

Paste a **TikTok / Instagram / YouTube** link → it pulls the audio, transcribes it
automatically, and writes a tight, teleprompter-ready script in **English and Persian**
in your RCIC voice — with a built-in scrolling teleprompter.

## What happens under the hood
1. `yt-dlp` downloads the video's audio (works for all three platforms).
2. **OpenAI Whisper** turns that audio into a transcript (auto-detects language).
3. **Claude** rewrites it into EN + FA teleprompter scripts, tuned to your voice and
   kept compliant (no outcome promises).

Your API keys stay on the server — never in the browser.

## What you need
Two keys (paste them at deploy time, nothing in code):
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `OPENAI_API_KEY` — from platform.openai.com (powers Whisper transcription)

---

## Deploy in ~10 minutes (Render, Docker — no terminal needed)
1. Put this folder in a GitHub repo (drag-and-drop upload works).
2. Go to **render.com → New → Web Service** and pick that repo.
3. Render auto-detects the **Dockerfile**. Leave defaults.
4. Under **Environment**, add the two keys above.
5. Click **Create Web Service**. When it's live, open the URL on your phone.

Railway and Fly.io work the same way — they read the Dockerfile and just need the two env vars.

## Run it on your own computer (optional)
Requires Node 18+, plus `ffmpeg` and `yt-dlp` installed.
```bash
npm install
ANTHROPIC_API_KEY=...  OPENAI_API_KEY=...  npm start
# open http://localhost:3000
```

## Files
- `server.js` — backend: `/api/transcript` (link → text) and `/api/scripts` (text → EN/FA)
- `public/index.html` — the full studio + teleprompter UI
- `Dockerfile` — installs ffmpeg + yt-dlp so any host works
- `.env.example` — the two keys it expects

## Notes
- Built for short-form clips. Very long videos may exceed Whisper's 25 MB single-pass
  limit — split them or use a shorter section.
- Only works on public links.
- Whisper transcription and Claude generation each cost a small amount per use, billed to
  your own OpenAI / Anthropic accounts.
