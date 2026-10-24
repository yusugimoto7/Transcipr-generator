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
- **A court item's case comes from its own text, never from the split model** (Oct 21 2026). The
  split had given Kumar's summary (2026 FC 1138) the citation 2026 FC 1109, an Iranian applicant's
  case, and Raeisi Ardali's card then showed Kumar's text as its original. Now: the citation is the
  first one in the item's excerpt (`citationOf`), a court card finds its item only by that case or
  its stored text (never issue + number alone), stored deck cards are re-keyed (`lexdeck2`), and when
  no item is found the card's stored Lexbase text is used, not the CanLII page.

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

- **Voice (Oct 21 2026, replaces the neutral "clean news" tone):** a friendly lawyer posting himself,
  first person and colloquial, like the Persian channel the team showed as the model («نکته اینجاست»،
  «قسمت جالبش اینه که…»، «این سؤال داره زیاد پرسیده میشه»، «فکر کنم…»). Short: 2–5 short paragraphs,
  the point first, a bold first line optional, at most one emoji. Terms as Persian speakers in Canada
  say them (CEC، ناک کد، ال‌ام‌آی‌ای) with a short explanation when unfamiliar. An opinion may only follow
  from the source's facts and never adds a number, date or claim. A short English line from the source
  may be quoted word for word. Still no sales lines, no "according to the source", no hashtags.
  `TG_VOICE` / `TG_RULES` in `lib/prompts.js`.
- Written by the strongest model (`OPENAI_POST_MODEL`, default gpt-5.6-sol), because short + colloquial
  + exact needs it; picking the related link stays on the cheap model.
- Only the genuinely related sugimotovisa.com page (or none).
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

- **English carousels end with the bio link** (Hamed, Oct 24 2026): the last slide's only call to action is "Tap the link in our bio to book a consultation with Sugimoto Visa." (`CTA_TEXT_EN` in `lib/wizardPrompts.js`); never "comment the word", no Persian word in an English slide. The first English carousel said: comment "مشاوره".

- **Carousel shape** (Hamed, Oct 24 2026, from the instagram-agent-skill review; `carouselShape` in `lib/carousel.js`): cover headline at most 6 English / 8 Persian words; other slides aim for about 25 English / 35 Persian words, but completeness wins and a fact is never dropped; with 6 slides or more the second-to-last is a stand-alone RECAP (the screenshot slide) and the last stays closing line + consultation line. Each slide's text goes to Instagram as its alt text.

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
- **Three Instagram pages** (Hamed, Oct 24 2026): @sugimotovisa (Persian, Canada), @sugimotovisa.europe (Persian, Europe), @sugimoto.visa (English, Canada and Europe). English content goes to @sugimoto.visa by default; the composer's Instagram page field can change it.

- Under carousels and stories: **🗓 Schedule** / **🚀 Post right away** to the content calendar
  (`app/CalendarButtons.jsx`), not Telegram buttons (Oct 2026). Hamed's click approves after a
  confirm; anyone else's goes to him as "Waiting for approval".
- Approval covers captions + media of the switched-on channels; any change needs a new approval.
- **Posting to the networks is off for now** (Oct 18 2026: "disable the automatic posting on platforms; only we have options to download on computer or upload on Google Drive; after testing credentials we can enable"). `CALENDAR_PLATFORM_POSTING` is the master switch; each post has "Download to this computer" and "Save to Google Drive". Enable only after every channel's credentials are tested.

## 12. How we learn

- Since Oct 21 2026 Hamed teaches the app directly: "🧠 از این یادداشت یاد بگیر" under his edit notes keeps
  a general rule (`learned/` on editing-data, Video Editing → Lessons → Content rules) that goes into
  every later prompt of that kind. When working on a part, copy its active rules into this file or the
  feature skill, with the date, so the written record keeps up with what the app already follows.

**Dates and tense (Oct 21 2026).** A source is often written before the change it reports ("from January 2025 the rules will change"). Every writing prompt (carousel, Telegram, story, script, article, story-page and picture-text rewrites) now carries today's date and the rule to set the tense from it (`lib/today.js`, through `lessonsBlock`). The learned rule had been filed under pictures only, because the note came from a picture's ✏️, so it never reached the text prompts: the learn job now also picks every kind of content a rule applies to (`scopes`), and old picture rules also reach the slide text.

**Explainers stay on their question, first line to last (Hamed, Oct 21 2026).** The idea "visitor visa with an invitation letter: is the letter enough?" got a script that answered in one paragraph and then walked through the rest of the official visitor-visa page (biometrics, processing times, fees). An evergreen topic rests on a whole general page; the writer must use only the parts that answer the question, write less when the page says little about it, and drop any paragraph about something else. `stayOnQuestion(topic, lang)` in `lib/prompts.js` carries this into the script (FA and EN), Telegram post, article, carousel and story prompts.

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


## Visa results stories (Studio, Oct 21 2026)

Hamed's format for client approvals: one or two pictures per 9:16 story (the approval letter, and a
screenshot of the application timeline), the Sugimoto logo large over them, the dates circled, and
the client's lines under them: «سرکار خانم … / جناب آقای …», «⬅️ نوع ویزا», «⬅️ اقدام از», «⬅️ سن»,
«⬅️ تاریخ سابمیت ویزا», «⬅️ مدت زمان انتظار ویزا», «⬅️ تاریخ اپرووال ویزا», sometimes a last ✅ line.
- **Privacy is the rule that never bends:** the family name, UCI, application / passport / document
  numbers, address, email, phone and barcodes are always covered; only the first name stays. The
  letter's date stays and is marked. Covering is burned into the pixels before anything leaves the
  server, a person checks every box before drawing, and the uploads are never stored.
- Only the first name, visa type and dates are read from the pictures; the title (خانم / آقا), the age
  and "applied from" are typed by the team (left as «…» until then). Nothing else is invented.
- The «اطلاعات پرونده» box takes the team's own lines (timeline, visa type, age, applied from, an extra
  ✅ line); a model only sorts what they wrote into the fields (`readVisaNotes`), and what they wrote wins
  over what the pictures say. Several clients: one per story, in order.
- **Never covered** (Hamed, Oct 21 2026): «Canada» anywhere (Government of Canada / Gouvernement du
  Canada, "remain in Canada", "Citizenship Canada"), IRCC's names, the form number at the foot (IMM 0277…).
  An application number keeps its letters and first digit (W3…, VWS2…); the rest is covered.
- **Listed like topics** (Hamed, Oct 21 2026): «ساخت خبر ویزا» puts a row «خبر ویزا · <name>» in the «خبرهای ویزا» list; opened, it is a page with the story tools (pictures and boxes, text, design, make, download, calendar). Saved for the team once its stories are made.
- **One client by default:** the pictures of one upload are nearly always one client's. They open under
  one heading «خبر ویزا · <title and first name>», with the story tools inside; up to two pictures make
  one story. Another client is added by hand («مشتری دیگر»), or by the notes naming several clients.
- **Story look (Hamed, Oct 21 2026):** a letter shows only its printed part — the white page margins
  are trimmed (`trimMargins`); a line with no information is left out (never «…»); the title comes from
  the first name («زینت» → «سرکار خانم», «علی» → «جناب آقای»), and is left off when the name could be either.
- **Layout (Hamed, Oct 23 2026): the approval letter much bigger, the writing on top of it without hiding the important information.** Default `layout`: big "letter" (about 72% of the height, ~3x the old size), letter on top, text "over" the letter in its emptiest spot — never on the marked dates or the lines the reading marks to keep (decision sentence, permit type and validity, first name); falls back to under the pictures when no spot fits. Laid out in pixels on the server (`planStory` in `lib/visa-news/compose.js`); the story note and the design panel can change big / first / text / size.
- **Hand-drawn layout** (Hamed, Oct 23 2026: "a design page where I size the picture and move the text box myself"): «طراحی دستی» on the case page (`app/VisaDesigner.jsx`) shows the 9:16 story; pictures and the text box are dragged and sized by finger, text size by +/-; the result (`layout.manual[story]`, story pixels) is drawn exactly (`planStory` manual branch), kept with the case, and «خودکار» goes back to the automatic layout. The logo is still placed by the server, off dates, tables and the text.
- **No small logo at the foot of the story** (Hamed, Oct 23 2026). **The text never sits on a table** (Type / Validity / Document Number): tables are found from the pixels (`inkOf`), and on a saved case the decision / permit / validity lines are read back from the covered picture (`keepLinesOf`), so the layout protects them even without the original reading.
- **The logo never sits on the dates** (Hamed, Oct 23 2026): it is burned into the picture of the story where it covers the least ink, never over a marked date; a picture with no free place gets none.
- **Notes and learning** (Oct 23 2026): a note under a picture reads it again with that note; a note under the stories changes text and look and draws again; both can teach a rule (scope `visa`).
- **The work never stops with the page** (Oct 23 2026): a case is held in the server's memory while it is read and checked; switching tab or closing the page loses nothing.
- No stickers or GIFs (Congrats…) are drawn into the story: the team adds those inside Instagram / TikTok (Hamed, Oct 21 2026).
- The waiting time is written as the team writes it («۷ ماه و ۱۶ روز»); counted from the dates only if not given.
- **Only two dates are marked** (Hamed, Oct 21 2026): the submission date and the answer date. In a
  timeline, the "Date sent" of the «Submission Confirmation» row and of the approval / decision row
  (never "Date read", never other rows); on a letter, its own date only (not validity). Decided by a
  fixed rule (`markedDates` in `lib/visa-news/scan.js`), the model's choice only when the rule finds none.
- Marks: **yellow highlighter (default, Hamed's choice)**, red circle or red underline; backgrounds: light (lilac),
  navy, Sugimoto slate. Samples Hamed sent are in the Oct 21 2026 session; more may follow.
