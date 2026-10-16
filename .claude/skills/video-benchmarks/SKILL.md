---
name: video-benchmarks
description: Where English-video benchmark videos come from and how the picker works. Use before changing lib/benchmarks.js, app/api/video/benchmarks, the BenchmarkPicker / section 4 of the English video sheet in app/page.jsx, or when asked about benchmark videos.
---

# Benchmark videos for the English video

- **Always** use the team's Drive folder "Benchmarks": https://drive.google.com/drive/folders/13zzIgmAPzHdv2Ah_8XlL0DGJ8L_rE9J1 (override with env `BENCHMARK_FOLDER_ID`).
- Read through Drive's public folder view (`embeddedfolderview`) — no Google key. The folder must stay shared as **"Anyone with the link"**; if listing fails, check that first.
- Each video's shape comes from its Drive thumbnail's proportions: **vertical (9:16) → Reels · TikTok · Shorts; horizontal (16:9) → YouTube; square → Feed.**
- The sheet (section 4) shows thumbnails; tapping one selects it **and switches the format to match**; videos not fitting the chosen format are dimmed. A pasted link to a new benchmark still works.
- `GET /api/video/benchmarks` lists (10-minute cache, `?fresh=1` re-reads); `?thumb=<id>` serves a thumbnail, only for ids in the folder.
- The chosen video goes to the n8n workflow as `benchmark: { url, kind }` (see the contract at the top of `lib/video.js`).
