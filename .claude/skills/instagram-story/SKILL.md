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

## The story's text is the script (Hamed, Nov 11 2026)
"The script is very good but the story's text is unrelated; I want exactly the script." When the topic has a script in the story's language, the story's text IS that script, word for word: `scriptPages` cuts it by rule (paragraphs joined or split at sentence ends to the number of pages asked for; each page's first sentence is its headline, the rest its body) and leaves out the spoken comment-word close (a story has no comments). No model rewrites it; a model only picks each page's `quote` / `also` from the source for the screenshot (`quotesForPages`, checked by `quoteInSource` like always). The type steps down for long pages. A story revised with a note, a provincial draw told from its own page, or a topic with no script yet is written by `writeStory` as before.

## Court stories: only that decision, with its citation (Hamed, Nov 12 2026)
Taught through "learn from this note" (rule stored Nov 12 2026) and built into the code, because a stored rule only reaches the writing prompts and the screenshot is cut by code:
- **The screenshot shows only the item the story is about.** A page of the Lexbase issue holds several court decisions; `pdfQuoteShot` gets the item (`{ title, text }`) and `itemExtent` finds where it starts (its heading) and ends on the page, and the shot never reaches into the item above or below (`within` in `pageWindow`). `SHOT_VERSION` 4.
- **Every page of a court story carries the case line with its neutral citation**, e.g. «Kuldeep Kaur v. Canada (Immigration), 2026 FC 1216» (`caseRef` / `applyCaseRef` in `lib/story/index.js`): for a Lexbase item the applicant's name and the citation are read by rule from the item's first line ("KULDEEP KAUR IMM-19440-25 2026 FC 1216"; an IMM file is against the Minister of Immigration, «Public Safety» when the text names it); for a news report the writer's case name gets the citation only when the source holds exactly one.
- **The ✏️ page box** (`editStoryPage`): what is typed in the headline / body boxes is kept word for word, whatever the request under them says (he typed a headline, wrote a request about the screenshot, and got a different headline back). The request may change the words or which sentences are highlighted (`quote` / `also`, checked against the source), which takes the screenshot again; a screenshot cut the old way is also retaken on any edit. What the box cannot do (design, the citation line) is said in `story.notice`, shown under the pages.

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
- Screenshot = **the article itself, not one or two sentences** (Hamed, Nov 11 2026: "I need the full screenshot of the related news with highlights on the important sentences"). Web source: the page photographed at phone width (540 px, `webArticleShot`, our own Chromium) from its headline down, floating bars and cookie banners hidden, as tall as the story has room for (`SHOT_RATIO` 0.95 of the width); when the highlights sit too far below the headline, the shot is the headline piece (with byline and date) and the highlights' piece one above the other, a dotted band between them (`lib/story/window.js`). PDF (Lexbase): the page's full text width, the highlights a third of the way down (`pageWindow` in `pdfshot.js`). No cut goes through a line of text. Each page's `quote` plus up to two `also` sentences (other key numbers or dates near it, checked against the source like the quote) are highlighted. Without our own Chromium the old one-paragraph shot (HCTI) is the fallback. If the crop logic changes, bump `SHOT_VERSION` (3 since this change) so rewrites don't reuse old crops.
- **No masthead / site header on any story** (Oct 17 2026, Hamed: "it should not put header of the news website! It's weird"). `webQuoteShot` no longer takes a header shot and `storyPageHtml` never draws one, even for stories saved with `masthead_url`.
- **Provincial draws**: the story is written and photographed from the province's official results page when `lib/provinces.js` confirms it holds that draw. A quote that is a table line (`header: value | …`) is photographed as the table with its header row and that row highlighted (`rowShotHtml` in `lib/story/webshot.js`).
- Each page has a **✏️** button (`StoryPageSheet`, job `story_page`, `lib/story-page.js`): the team types a new headline/body, or writes an instruction and the model rewrites that page's text from the source text only. The quote and screenshot never change and no image model touches the page; only that page is drawn again.
- Under the story: **Schedule / Post right away** to the content calendar (`app/CalendarButtons.jsx`), not Telegram buttons.
- Each page in the app has a small **«⬇ ذخیره»** button: share sheet (Save Image) on phones, download elsewhere, through `/api/story/image`.

## Voice (from the team's reference stories, Drive folder "Story templates instagram")
Spoken everyday Persian (میتونه، نشون میده، ایشون), short lines, the striking number/decision first, openers like «یه آمار تکان‌دهنده», «یه سؤال جالب از اداره مهاجرت کانادا», an exclamation mark when surprising, the English term after the Persian one. Naming what the screenshot is («این رأی», «این ایمیل داخلی») is fine; «طبق منبع» and conclusions the source doesn't state are not. No CTA.

## Setup
**Drawing (Oct 23 2026):** HCTI's free plan (50 images a month) ran out and the team won't pay, so every
browser drawing (story pages, source-page photographs, visa-result stories, the draws card) now runs in
the server's own Chromium: installed in the Dockerfile, path `CHROMIUM_PATH`, driven by playwright-core
in `lib/story/hcti.js` (`hctiImage` keeps HCTI's request shape; one page at a time, the browser closes
after a quiet minute because the server has little memory; the PNG is kept with `keepImage`). HCTI is
used only when there is no Chromium and its keys are set, or with `STORY_RENDERER=hcti`.
Google Fonts are linked one family per link: a weight a family lacks (Lalezar has only 400) makes
Google refuse the whole request.
Needs `HCTI_USER_ID` and `HCTI_API_KEY` on Render (htmlcsstoimage.com; API key permissions: Images → Read, Create, Store only). Without them the tile shows "HCTI not set". Lexbase stories also need `GMAIL_USER`/`GMAIL_APP_PASSWORD` (the PDF is fetched again from Gmail).

## Checking a change locally
No HCTI locally: render the page HTML with Playwright/Chromium instead (`/opt/pw-browsers/chromium-*/chrome-linux/chrome` in cloud sessions) — `storyPageHtml(page, total, story)` + `STORY_CSS`, viewport 1080×1920, with Vazirmatn/Inter loaded from Google Fonts. Test `pdfQuoteShot` against a two-column justified PDF (reportlab makes one). Look at the image before pushing.


## Hand-drawn pages (Hamed, Oct 23 2026)
«طراحی» under each page opens `app/StoryDesigner.jsx`: the page at 9:16 in the automatic layout
(same CSS as `STORY_CSS`), measured once, then the headline, the screenshot, the body and the source
line can be dragged and sized (text size with +/-). «ساخت این طرح و دانلود» sends the positions as
`page.manual` to `story_page`, which draws only that page again and saves it; the page is then
saved to the device. «خودکار» clears `manual`. The screenshot is still the real photograph of the
source, never redrawn: only where and how big it sits changes. The same panel serves the stories
of every topic (News, Lexbase, Ideas, Studio).

## Templates (Hamed, Oct 23 2026)
Ten home-made "trending" looks were built first and **rejected** ("I only like the simple one; use
ready-made templates"). From a gallery of 27 ready-made Canva/Freepik story designs Hamed **kept 15
Canva ones: gallery numbers 2-12 and 16-19**, now `c2`…`c19` in `lib/story/templates.js` (redrawn in
HTML with Persian text; labels such as «خبر فوری» / «آپدیت» switch to «نکته مهم» / «نکته» on
explainers via `story.evergreen`). `simple` stays the default. The picker (`StoryTemplatePicker`) shows
`public/story-templates/<key>.jpg`; changing the template later (`story_draw` with `template`) keeps the text.
- **Photos (Hamed: "where a template has a photo, the AI makes it from the news, and it must be
  changeable")**: templates with `photo` (shape portrait/landscape/square, `look` photo/bw/illustration)
  get one AI picture per page (`lib/story/photo.js`, `fillStoryPhotos` in the story job, stage
  "photos"). Under each page: «🖼 عکس جدید» (optional note → job `story_photo`) and «⬆ آپلود عکس»
  (device picture → `/api/story/upload`, re-encoded with sharp, kept like the AI ones → `story_photo`
  with `url`). Only that page is drawn again.
- The photo is **illustration only**: no text, numbers, documents, screens, flags or seals (it must never
  look like evidence); people at most in the background, never a hijab or head covering, never a real
  person; learned `design` rules apply. **The source screenshot stays on every page of every template**:
  it is the proof, shown whole.
- A hand-drawn page (`page.manual`) is drawn in the simple style whatever the template.
- To add a template: a function in `T`, an entry in `STORY_TEMPLATES` (with `photo`/`look` if it has a
  picture), and a 216×384 preview jpg rendered from a sample page (stand-in photo blurred).
- **Backgrounds (Oct 26 2026):** ten preset colours (purple default, black, navy, blue, teal, green, red, orange, yellow, white) plus a colour wheel for any other, under the simple template. The chosen background travels as the preset's name or a `#rrggbb` (`cleanBg` keeps only those); `storyColours` in `lib/story/colours.js` is the one table for the server drawing, the hand designer and the swatches, and for a picked colour the text and box colours follow its brightness (white text on dark, black on light).
