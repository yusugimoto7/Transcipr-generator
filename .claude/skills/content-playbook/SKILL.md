---
name: content-playbook
description: Everything the team (Hamed and the editors) has taught about making and designing Sugimoto Visa content, across every part — topics, Lexbase, ideas, Farsi scripts, English scripts and video, Telegram post, blog article, carousel, story, pictures and publishing — plus what went wrong and how it was fixed. Read before changing any prompt, any generated-content format, any design, or any publishing step, and add to it whenever the team gives new feedback.
---

# Sugimoto Visa content playbook

One place for the lessons learned while making content with the Topic Engine. The
feature skills hold the detail for their part (`carousel-design`, `instagram-story`,
`video-benchmarks`, `lexbase-court-outcome`); this file is the whole picture.
**When the team gives feedback, add it here (and to the feature skill) in the same commit
as the change**, in the team's own words where possible, with the date.

## 0. Rules over everything

1. **Grounding is non-negotiable.** Every fact in every output (card, script, post, article,
   slide, story page, picture text) must be in fetched source text. Never write from a
   headline alone; a thin source is dropped, not padded. Invented facts are the worst bug.
   One function decides the source text for every step: `lib/grounding.js` `sourceTextFor`.
2. **Editor notes are framing, not facts.** A note sets angle, emphasis, length and design.
   It is never a source of facts (`editorNoteBlock` in `lib/custom-news.js`). Prompts say so.
3. **The brand's own voice.** Never «طبق منبع», «بر اساس گزارش», "according to the source".
   No sales lines, no «دایرکت», «لینک در بیو», «ذخیره کنید» in news content. Only the
   carousel's last slide carries the consultation line.
4. **Nothing is published by itself.** Each output is started from its own tile. The Telegram
   news post goes to @sugimotovisa only from its own Send button after a confirm; carousels and
   stories go to the content calendar, where nothing reaches Instagram/TikTok without Hamed's
   approval of that exact content (`contentHash`). Never weaken this.
5. **Slow work runs as server jobs** (`lib/jobs.js`, `startJob` in `app/page.jsx`), never awaited
   in a click handler: phones freeze pages when you switch apps.

## 1. Farsi language — every Persian output

- **Persian names first, English in parentheses the first time** (Oct 2026: "always name the
  Farsi names for specific words like IRCC, it should be اداره مهاجرت کانادا, put the English
  names in parenthesis if needed"). The shared glossary is `FARSI_TERMS` in `lib/prompts.js`
  (IRCC → اداره مهاجرت کانادا (IRCC), PNP → برنامه نامزدی استانی (PNP), ITA → دعوت‌نامه اقدام
  (ITA), PGWP, LMIA, Start-up Visa…). Add new terms there, never in one prompt only.
- In scripts, specialised vocabulary keeps the original English phrase in parentheses.
- Never a bare English acronym as the name of something. People's names stay as written.
- Express Entry draw results are not topics (covered elsewhere).

## 2. Topics and sources

- Topic supply: harvested pool (`scripts/harvest.mjs` → `harvest-data`), select, fetch real
  text, write cards from that text only. Most recent first in the list.
- Same story from several outlets → one topic with all sources shown (`lib/similar.js`).
- **Provincial draws come from the province itself** (Oct 17 2026: "search and bring the
  original updates from their provinces"). `lib/provinces.js` finds the province's official
  results page (PEI, BC, Ontario, Manitoba, Saskatchewan, Alberta, Nova Scotia, New Brunswick,
  NL) and uses it only when it really holds that draw (the invitation count next to a date
  within a week before the news). It then goes first in the source text, ahead of the news
  report, and the story is told and photographed from it. To add a province or a moved page, edit
  `PROVINCES` and test with a real draw (a wrong URL silently falls back to the news site).
  Known: PEI's site answered 403 to our cloud machine; check from Render.
- Editors' own news: links (≤5) and/or pictures (≤5) + a note → one grounded card. Pictures are
  transcribed word for word first (`lib/image-text.js`); the transcription is the source.
  Minimum text: 200 characters from pages, 80 from pictures alone.
- Topic links `/?t=<key>` open in a new tab; Back/Forward stay in the app.

## 3. Lexbase newsletter

- **Every** item of an issue becomes a card (≈40: policy notes + court decisions), not a
  shortlist. Items about **Iran / Iranians, study permits, Start-up Visa** are always first
  (`focusOf`). Cards are stored in the Sheet so they survive restarts; new issues appear on open.
- Court items carry Allowed/Dismissed from the decision text (see `lexbase-court-outcome`).
- The Original text tab shows the whole issue on request.

- **Lexbase scripts are informative reports, not news** (Oct 20 2026, with 16 of the team's own
  stories as samples: «دادگاه فدرال کانادا فلان حکم را صادر کرد… نه اینکه بگیم اگر برای مجوز کار
  اقدام می‌کنید این خبر برات مهمه»). `lexbaseScriptPrompt` in `lib/prompts.js`: open with the ruling or
  the document («دادگاه فدرال کانادا درخواست … را رد کرد»، «محتوای آموزشی افسران اداره مهاجرت…»،
  «سؤال از اداره مهاجرت: … پاسخ: …»), then the case, IRCC's argument, the judge's answer, the case
  name. No "if you are applying", no "this matters to you", no advice, no consultation line; the
  court outcome label is never contradicted.
- A card was once scripted from another case with the same issue + number (two issues in one month
  share the month key); `findLexbaseItem` now checks the CanLII link or the stored text.

## 4. Ideas (evergreen explainers)

- Not news: grounded on the official canada.ca page stored by the harvester (`page_id`); every
  prompt switches framing on `topic.evergreen`. Demand signals: Google/YouTube autocomplete
  (EN+FA), IRCC Help Centre questions, Reddit, site titles.
- Weekly batch, cached on the device and stale-while-revalidate on the server: the tab must open
  instantly (it once took 30 s after every restart — fixed with caching).

## 5. Scripts (Farsi + English)

- Farsi script: spoken, specific, the fact first; English terms in parentheses; glossary names.
- Voice reference for news scripts: the team's own on-camera Farsi (corrected subtitles of the
  "Inland vs overseas" video, `VOICE_SAMPLE_FA` in `lib/prompts.js`): short spoken sentences, the
  Persian term then its English name, step-by-step explanation. Style only, never facts. Add more
  of the team's real transcripts there when they exist.
- English script: must really be English (a Persian "English" script is detected and rewritten).
- "Change the script" note + Regenerate (e.g. "more details", "shorter") rewrites from the same
  source text, keeping what the note does not ask to change.
- After a deploy the saved script is always loaded; a failed write offers a retry button.

## 6. Telegram news post

- A clean news post: bold short title, 2–4 short paragraphs (what happened, from when, for whom).
  No hook lines, no sales lines, no source line; only the genuinely related sugimotovisa.com page
  (or none).
- Edited **in the app, not in Telegram** (Oct 2026): text box with `**bold**`, rewrite with a
  note, Save, then "ارسال به @sugimotovisa". One 4:5 picture (1088×1360) in the carousel style
  with the post's headline, logo composited; ↻ redraw and ✏️ edit under it.
- ≤1000 characters → one photo message with caption; longer → photo, then the text under it.
- The picture is **uploaded as a file** (multipart), never handed to Telegram as a link: on Oct 17
  2026 the Send button "did nothing" — Telegram's fetcher can be refused by the site storing the
  image, and the error was shown at the top of the panel, out of sight. The outcome of a send is
  now shown right under the button. `telegram_send` needs the "publishing" access.

## 7. Carousel

Text (`NEWS_RULES` in `lib/carousel.js`, the Wizard's carousel prompt):
- **Hook = the news itself** (the number, decision, date). Never address the reader: no
  «این آمار برای شما چه معنی دارد؟», «برای شما», «آیا شما هم…», no question hooks (Oct 2026:
  "do not write the post in a way that what to do FOR YOU… make the hook on the news itself").
- **Completeness**: every number, date, named body and exception in the source appears; never skip
  the main subject (the team caught a carousel that skipped the whole point of the news).
- **Exact names and roles**; never promote a title.
- **One complete unit per card**: a short paragraph, or bullets that are each complete. Never one
  sentence split across three boxes (Oct 2026 feedback).
- Caption: the fact first, then 🔹 details. No "send this to…", no closing question.
Design (`carousel-design` skill): 4:5 at 1088×1360, gpt-image-2 with the brand's own carousels as
style references (style only), white + deep teal #0d4f4b + cream #f3e3c3 + mint pills, rounded
cards with teal icons, a different kind of picture per slide (`VISUALS`), **no hijab or head
covering ever, people at most in the background**, bottom strip left empty and the **logo
composited bottom-centre** (never drawn by the model).
Working with it: preview lightbox; download every slide as its own file (not a zip); "note for
the next version" + Redo that revises the current set (a plain redo made near-identical sets);
✏️ under each slide changes **only that slide** from the current image; ↻ draws it fresh.
Parser is tolerant of Persian digits/markdown around `===SLIDE n===`, with retries and a fallback
model — a carousel once failed entirely because helper functions were deleted by accident: run the
undefined-identifier eslint check after editing `lib/carousel.js`.

## 8. Story (Instagram fact story)

Full detail in `instagram-story`. Essentials:
- 1–4 pages (1 by default). Each page: short Farsi fact in the reference stories' spoken voice,
  a **real screenshot of the original** (Lexbase PDF page or the web page) with the proving
  sentence highlighted, the explanation in white text boxes below it.
- The quote must be found in the source text before anything is drawn; the screenshot is a
  photograph, never an image model's drawing; screenshots only when a story is made.
- **No website header/masthead on the screenshot** (Oct 17 2026: "it should not put header of
  the news website! It's weird"). Removed for every story, old ones included.
- Draws are photographed from the **province's official page** when one holds the draw; a table
  line is shown as the table's header row + that row highlighted (one cell alone means nothing).
- Flat colour background, purple #8a3893 default; Vazirmatn 800; no logo, no frames.
- ✏️ on a page changes only that page's **text** (typed, or an instruction rewritten from the
  source); the screenshot is never edited by an image model.

## 9. English video

- Options sheet → n8n workflow (HeyGen) → reports back to `/api/video/callback`. Benchmarks in
  `video-benchmarks`. "Change the script" note + regenerate before sending.
- Video editing rules live in english-sugimotovisa, never in this app: only pauses, false starts
  and retakes are removed.

## 10. Pictures in general

- Every generated picture has ✏️ under it to change **that picture only** with a prompt, plus
  ↻ to draw it again. Carousel slides and the Telegram picture: `editPicture` (the current image
  goes to `images.edit`; the logo is composited again over the same spot). Story pages: text only.
- Pictures are kept in the WordPress media library; if WordPress refuses, they live in memory
  until a restart and the page says so.

## 11. Publishing and the calendar

- Under carousels and stories: **🗓 Schedule** / **🚀 Post right away** to the content calendar
  (`app/CalendarButtons.jsx`), not Telegram buttons (Oct 2026). Hamed's click approves after a
  confirm; anyone else's goes to him as "Waiting for approval".
- Approval covers captions + media of the switched-on channels; any change needs a new approval.
- **Posting to the networks is off for now** (Oct 18 2026: "disable the automatic posting on platforms; only we have options to download on computer or upload on Google Drive; after testing credentials we can enable"). `CALENDAR_PLATFORM_POSTING` is the master switch; each post has "Download to this computer" and "Save to Google Drive". Enable only after every channel's credentials are tested.

## 12. How we learn

- Treat every screenshot or complaint from the team as a rule: write it here with the date and the
  team's words, and change the prompt or code in the same commit.
- Before changing a prompt, check the result on a real topic (one that triggered the feedback).
- Pictures: look at the image before pushing (render locally with Chromium where the service
  isn't available locally).
- Never put model names in commits or code comments; never commit secrets.

## 13. The app's own look (Oct 18 2026)

- Palette **B, "Deep Teal & Sand"**, chosen by the team from three samples (design canvas "Sugimoto new look"), then the main colour changed by the team to the logo's slate `#32515D` (Oct 18 2026): action slate `#32515D`, deep bar `#243B44`, light slate tint `#E2EAED`, cream `#F3E3C3`, sand ground `#F7F5F0`, borders `#E5E0D5`, ink `#14231F`. The logo's orange `#EA580C` stays in the logo and small highlights only. Tokens live in `app/globals.css` (`--orange` keeps its old name but is the teal action colour) and `C` in `app/page.jsx`.
- The real logo, never a drawn mark: `public/brand/logo-on-dark.png` (white lettering, for the teal bar), `logo-on-light.png` (dark lettering), `mark.png` / `app/icon.png` (the orange square alone, phones and browser tab). Sources: the team's Drive files Sugimoto-06 and Sugimoto-01.
- Direction agreed: shadcn/ui (MIT) components and Kaneo's (MIT) kanban as code to build on, PLANKA/Trello for ideas only; one design system for every part of the app.
