---
name: instagram-story
description: How the Story tile (Instagram fact stories with real source screenshots) works and the team's decisions about it. Use before changing anything in lib/story/**, app/api/story/**, the StoryPanel in app/page.jsx, or the story/story_draw/story_send jobs in lib/jobs.js, or when asked to change a story's design, text, colours, screenshots or saving.
---

# Instagram fact stories

A topic's **Story** tile makes 1–4 pages (default **1**). Each page is a short Persian fact over a **real screenshot** of the original source with the proving sentence highlighted. Server jobs `story`, `story_draw` (redraw/recolour), `story_send` in `lib/jobs.js`; saved with the topic as material `story`.

## Files
| What | Where |
|---|---|
| Writing prompt, grounding check, layout HTML/CSS, colours, drawing, Telegram | `lib/story/index.js` |
| Lexbase PDF screenshot (pdf.js + @napi-rs/canvas, no system packages) | `lib/story/pdfshot.js` |
| Web page screenshot (page HTML, scripts removed, quote marked, HCTI `selector`) | `lib/story/webshot.js` |
| Quote matching (ignores case/spaces/punctuation) | `lib/story/match.js` |
| HCTI client | `lib/story/hcti.js` |
| Save-image proxy (HCTI images only) | `app/api/story/image/route.js` |
| UI: tile, form (pages 1–4, colour swatches, notes), preview, save button | `StoryPanel`, `BgSwatches`, `saveStoryImage` in `app/page.jsx` |

## Rules that must not be broken
- **Grounding:** every page returns a `quote` copied from the source text; the page is rejected unless `quoteInSource` finds it. A `ref` (case name) is shown only if the source text contains it. Never let a story state a fact the source does not.
- **Screenshots are photographs of the original** (PDF page or web page), never an image model's drawing.
- **Screenshots are taken only when a story is made**, never for every topic.
- Nothing is sent to Telegram automatically.

## Design decisions (from Hamed's feedback — keep them)
- Raw Instagram look: **one flat background colour**, no logo, no frames, no pill labels, no page numbers.
- Colours (`STORY_BACKGROUNDS`, mirrored in `STORY_BGS` in page.jsx): **purple `#8a3893` is the default** (taken from the team's reference story), then black, blue, red, green, white. To add a colour, change both lists.
- Font: **Vazirmatn ExtraBold (800)** for Persian, Inter for Latin — the closest public match to Instagram's bold story text. Loaded through HCTI `google_fonts: "Vazirmatn|Inter"`.
- Layout top to bottom: headline as plain bold text → screenshot → body in **white rounded text boxes (Instagram text-background style) BELOW the screenshot, never over it** → optional case name (`ref`) in English. Content stays inside 260px top / 280px bottom (Instagram's own controls cover those).
- Screenshot = **the whole paragraph** that holds the quote, full column width, cut at the paragraph's own edges, never trimmed on the page (`object-fit: contain`). Long paragraphs keep at most 16 lines around the quote. If the crop logic changes, bump `SHOT_VERSION` so rewrites don't reuse old crops.
- **No masthead / site header on any story** (Oct 17 2026, Hamed: "it should not put header of the news website! It's weird"). `webQuoteShot` no longer takes a header shot and `storyPageHtml` never draws one, even for stories saved with `masthead_url`.
- **Provincial draws**: the story is written and photographed from the province's official results page when `lib/provinces.js` confirms it holds that draw. A quote that is a table line (`header: value | …`) is photographed as the table with its header row and that row highlighted (`rowShotHtml` in `lib/story/webshot.js`).
- Each page has a **✏️** button (`StoryPageSheet`, job `story_page`, `lib/story-page.js`): the team types a new headline/body, or writes an instruction and the model rewrites that page's text from the source text only. The quote and screenshot never change and no image model touches the page; only that page is drawn again.
- Under the story: **Schedule / Post right away** to the content calendar (`app/CalendarButtons.jsx`), not Telegram buttons.
- Each page in the app has a small **«⬇ ذخیره»** button: share sheet (Save Image) on phones, download elsewhere, through `/api/story/image`.

## Voice (from the team's reference stories, Drive folder "Story templates instagram")
Spoken everyday Persian (میتونه، نشون میده، ایشون), short lines, the striking number/decision first, openers like «یه آمار تکان‌دهنده», «یه سؤال جالب از اداره مهاجرت کانادا», an exclamation mark when surprising, the English term after the Persian one. Naming what the screenshot is («این رأی», «این ایمیل داخلی») is fine; «طبق منبع» and conclusions the source doesn't state are not. No CTA.

## Setup
Needs `HCTI_USER_ID` and `HCTI_API_KEY` on Render (htmlcsstoimage.com; API key permissions: Images → Read, Create, Store only). Without them the tile shows "HCTI not set". Lexbase stories also need `GMAIL_USER`/`GMAIL_APP_PASSWORD` (the PDF is fetched again from Gmail).

## Checking a change locally
No HCTI locally: render the page HTML with Playwright/Chromium instead (`/opt/pw-browsers/chromium-*/chrome-linux/chrome` in cloud sessions) — `storyPageHtml(page, total, story)` + `STORY_CSS`, viewport 1080×1920, with Vazirmatn/Inter loaded from Google Fonts. Test `pdfQuoteShot` against a two-column justified PDF (reportlab makes one). Look at the image before pushing.
