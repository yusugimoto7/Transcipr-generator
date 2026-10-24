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
- **A sample is not a look** (Oct 24 2026: a grey-suit sample came back in the white shirt). The workflow renders one of Hamed's HeyGen digital-twin looks; the sample only guides pacing and framing. The look is chosen in section 5 of the sheet (`LOOKS` in `lib/video-looks.js`) and sent as `look_id`; picking a sample that has its own look (`BENCHMARK_LOOKS`, by Drive file id) selects it, and a sample whose outfit has no look says so on the sheet. A new outfit needs a look trained in HeyGen (avatar "Hamed Sugimoto") from the camera original, not a preview, then added to `LOOKS` and `BENCHMARK_LOOKS`. The n8n workflow's "Prepare Render" node must use `b.look_id` (it used a fixed `look_id`).
