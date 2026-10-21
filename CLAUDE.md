# Sugimoto Visa — Topic Engine

Next.js 14 (App Router, JSX, `runtime = "nodejs"`) content tool for a Persian-language Canadian/European immigration brand (@sugimotovisa). It ingests real immigration news, turns it into Farsi topic cards, and generates video scripts, clean Telegram news posts, and Farsi SEO blog articles (WordPress drafts). A separate module auto-posts Canadian immigration draws.

Deployed on Render from `main` (auto-deploy on push). Two people work on this repo on the same branch, each with their own Claude Code session.

## Branch workflow (two people, one branch)

Both people work directly on `main`. Render deploys every push to it, so the
discipline is about not stepping on each other and not shipping a broken build:

- `git pull --rebase origin main` before you start work and again right before every push.
- `npm run build` must pass before every push. A broken push goes straight to production.
- Push small commits often. Do not sit on a day of local changes.
- If a push is rejected, `git pull --rebase origin main`, resolve, build, push again.
- CI also runs the build on every push to `main`. If it goes red, fix it immediately.
- Before starting a lane of work, say which files you are about to change so the other person is not editing the same ones at the same time.

## Safety rules — read before running anything locally

Every integration in this app is optional and degrades gracefully when its env vars are blank. Use that.

- **Local `.env.local` = `USE_OPENAI=true` + `OPENAI_API_KEY` only.** Leave everything else blank. Production Telegram, WordPress, and Google Sheet credentials live in Render; do not copy them into a local file.
- **Never set `DRAWS_AUTORUN=true` locally.** The draws poster publishes straight to the public channel with no review step.
- Never commit secrets. `.env*.local` is gitignored; keep it that way.
- Any credential pasted into a chat is exposed — rotate it.

## Verify before pushing

```
npm install
npm run build        # must print "✓ Compiled successfully"
```

There is no test suite. Diagnostics live in the deployed app instead:
- `/api/status` — one-page health check of every integration
- `/api/feeds` — which news sources are actually delivering
- GitHub → Actions → **harvest** → latest run summary — per-feed health from the scheduled harvest, plus how many Google News links resolved
- Tap the line above the deck in the app — why the deck has the cards it has

## Where things are

| Area | Files |
|---|---|
| **Feed list — add sources here** | `lib/feeds.js` |
| News ingest logic: parsing, dedupe, YouTube resolution | `lib/news.js` |
| Candidate pool: relevance scoring, merge, reading the harvest | `lib/candidates.js` |
| Scheduled harvester (every 2h, GitHub Actions → `harvest-data` branch) | `scripts/harvest.mjs`, `.github/workflows/harvest.yml` |
| Google News link → real publisher URL | `lib/gnews.js` |
| Topic generation pipeline, caching, cost caps | `app/api/topics/route.js` |
| All LLM prompts + output parsing | `lib/prompts.js` |
| Model selection per job (env-overridable) | `lib/openai.js`, `lib/anthropic.js` |
| WordPress draft publishing (redirect-safe auth) | `lib/wordpress.js` |
| Telegram news post: written, edited in the app (text with `**bold**`, related site link), one 4:5 picture in the carousel style, sent from the app to the public channel (jobs `telegram_write`/`_save`/`_image`/`_send`) | `lib/telegram-post.js`, `app/page.jsx` (`TelegramPanel`) |
| Telegram review chat: removed (Oct 2026). Nothing is sent to a review chat; everything is edited and approved in the app. `/api/telegram/webhook` only answers Telegram with 200 in case the old webhook is still registered | `app/api/telegram/webhook` |
| Durable memory (Google Sheet via Apps Script) | `lib/sheet.js`, `google-apps-script.gs` |
| Draws auto-poster (separate system) | `lib/draws/**`, `app/api/draws/**` |
| Keep-awake + deck warm-up (every 10 min, GitHub Actions → `/api/topics?warm=1`) | `.github/workflows/keepwarm.yml` |
| Instagram creators (list / reader / health page) | `lib/creators.js`, `lib/social/instagram.js`, `/api/social` |
| Lexbase newsletter from Gmail (IMAP, read-only; PDF → items) | `lib/newsletter/lexbase.js`, `/api/lexbase` |
| Background jobs (script, Telegram, article, draft, Word file, carousel, video run server-side) | `lib/jobs.js`, `app/api/jobs/route.js` |
| Shared workspace — every used/archived topic and what was made from it, for the whole team (Sheet "Library" tab, replaces the old Library view) | `lib/workspace.js`, `app/api/workspace/route.js` |
| Carousel posts: slide text (Wizard's carousel prompt) → optionally edited in the app first (heading + body per slide, caption, template 1-7) → gpt-image-2 → WordPress media → content calendar (Schedule / Post right away, `app/CalendarButtons.jsx`). Captions keep at most 3 hashtags | `lib/carousel.js`, `lib/carousel-templates.js`, `lib/wordpress.js` (`uploadMedia`) |
| ✏️ under every picture: change only that picture. Carousel slide and Telegram picture: the image model edits the picture itself (`editPicture`, logo composited again). Story page: only its text changes (typed, or rewritten from the source by an instruction) and that page alone is drawn again; the screenshot is never touched | `lib/carousel.js`, `lib/story-page.js` |
| Instagram fact stories (1-4 pages, default 1): Farsi fact per page over a real screenshot of the source with the proving sentence highlighted — Lexbase from the issue's PDF (pdf.js, fetched again from Gmail only when a story is made), web sources photographed through HCTI; pages drawn through HCTI. Needs `HCTI_USER_ID` + `HCTI_API_KEY` | `lib/story/**` |
| English video: options sheet on the topic page → n8n workflow "Topic Engine: English video" (HeyGen) → reports back to `/api/video/callback`. Inactive until `VIDEO_WORKFLOW_URL` + `VIDEO_WORKFLOW_SECRET` are set | `lib/video.js`, `app/api/video/callback/route.js` |
| General ideas: demand signals (Google/YouTube autocomplete EN+FA, IRCC Help Centre, Reddit, site titles, official page text) harvested daily → weekly batch of evergreen ideas grounded on canada.ca pages | `lib/ideas/seeds.js` (subjects, pages), `lib/ideas/signals.js`, `lib/ideas/index.js`, `/api/ideas` |
| Research beyond the daily news ("🔎 تحقیق روی ایده یا موضوع" on the News tab, job `research`): an idea → the search model finds 2-4 pages → one card written from their text; a subject (or `DEFAULT_SUBJECTS`) → up to 6 post ideas, one page each → one card each. The search only finds pages; cards are written like custom news, from the fetched text alone. (`lib/research.js` is the Content Wizard's, a different thing) | `lib/idea-research.js`, `openaiSearch` in `lib/openai.js` |
| Studio tab (next to News, Lexbase, Ideas): news from the editor's own links and pictures (`CustomNewsBox`; those topics are listed here, not in News, and have every tile the others have), and **visa results** (نتایج ویزا): up to 10 pictures of a client's approval letter / application timeline → OCR (tesseract.js, its English model downloaded at first use into the temp folder) + a vision model + fixed rules propose what to cover (family name, UCI, application/passport numbers, address, email, barcodes; the first name stays) and which dates to mark → a person checks every box on the picture (tap to remove, drag to add) and ticks that they did → covered for good with sharp, 1-2 pictures per 9:16 story drawn through HCTI → download or one draft calendar card (Instagram story). Unredacted pictures are never stored: they live in the page's memory and the job's request only | `app/VisaResults.jsx`, `lib/visa-news/scan.js`, `lib/visa-news/compose.js`, jobs `visa_scan` / `visa_story`, `/api/calendar/visa` |
| Source text for every writing step (Lexbase item → stored official page → fetched page → excerpt; a provincial draw puts the province's own results page first) | `lib/grounding.js`, `lib/provinces.js` |
| Video Editing section (login, team, projects, review, corrections, approval). The editing method is NOT here: it lives in english-sugimotovisa (`scripts/rough_cut.py`, GitHub job `rough_cut`); this app only stores state on that repo's `editing-data` branch and starts the job | `lib/editing/**`, `app/editing/**`, `app/api/editing/**`, `middleware.js` |
| Content calendar (one Trello-style board, markets as labels, month view, cards from topics and approved videos, publishing to Instagram, TikTok, YouTube, LinkedIn page, X after Hamed's approval) | `lib/calendar/**`, `app/calendar/**`, `app/api/calendar/**` |
| "Choose from Google Drive" button wherever a Drive link is asked for (New project, calendar media, English video benchmark): Google Picker in the person's own Google account (`drive.file` scope), then the file is shared as "Anyone with the link" because the worker, the publishing clock and the video workflow download by link. Hidden until `GOOGLE_PICKER_CLIENT_ID`, `GOOGLE_PICKER_API_KEY`, `GOOGLE_PICKER_APP_ID` are set (`.env.example`); a new Drive-link field gets the same button | `app/DrivePicker.jsx`, `app/api/drive/config/route.js` |
| Voice instead of typing, in every text field (Farsi, English or both): a microphone appears at the edge of the focused field, the note is written where the cursor was (`/api/voice/transcribe`, speech model `OPENAI_TRANSCRIBE_MODEL`, needs `USE_OPENAI` + `OPENAI_API_KEY`). A field opts out with `data-no-voice` (links, times). Video Editing's Corrections also takes a whole spoken review: "Speak your notes" splits it into corrections by the second named, shown to be checked before they are added; a note with no time is never given a guessed one | `app/VoiceDictation.jsx` (mounted in `app/layout.jsx`), `app/voice/recorder.js`, `lib/voice/**`, `app/editing/p/[id]/VoiceCorrections.jsx` |
| Copy button in the bottom corner of every text box that holds text, on every page (`app/CopyCorners.jsx`, mounted in `app/layout.jsx`; `data-no-copy` opts a box out, `data-copy` adds one to any other element) | `app/CopyCorners.jsx` |
| UI (one list: new + used topics, Archive filter; Lexbase and Ideas tabs; topic view with scripts, original text, article, carousel, video) | `app/page.jsx` |
| Look: palette B with the logo's slate `#32515d` as main colour (tokens in `app/globals.css`), Geist + Vazirmatn (`public/fonts`), the team's logo files (`public/brand/logo-on-dark.png`, `logo-on-light.png`, `mark.png`). Shared building blocks adapted from shadcn/ui (MIT) in `components/ui` (Button, Badge, Input/Textarea, Card, Sheet, DropdownMenu) with Tailwind (`tailwind.config.js`, its global reset off while old screens move over) and Lucide icons. New and reworked screens use these, never hand-styled buttons or emoji icons. Done: the calendar (board, card window, views, lists, composer shell, sheets), the top bar, the Topic Engine's chrome and Video Editing's styles. Deeper Topic Engine panels still carry some hand-styled buttons: move them to `components/ui` when touched | `components/ui/**`, `app/globals.css`, `tailwind.config.js` |

## Video Editing section

- Off unless `EDITING_SESSION_SECRET` and `EDITING_GITHUB_TOKEN` are set; then Video Editing, the calendar and the Team page need a login. `APP_LOGIN=all` puts the whole Topic Engine behind the same login too (one sign-in for everything).

## One login, access per person

- Accounts are the Video Editing accounts (`lib/editing/auth.js`, users on the `editing-data` branch). Hamed (admin) has everything; each member has what he ticks on the Team page: `topics`, `calendar`, `editing`, `publishing` (Telegram and WordPress sends from the Topic Engine), `learn` ("learn from this note"; the rule list itself stays admin only). Accounts from before access existed have `calendar` + `editing`. Rules in `lib/editing/access.js`.
- `middleware.js` maps every path to a part (`sectionOf`) and checks a 5-minute access ticket (`ve_access`, signed like the session) that it renews from the stored account through `/api/editing/auth/ticket` on this server (`http://127.0.0.1:$PORT`). `guard()` re-checks calendar/editing/team access against the stored account on every API call, so taking those away applies at once; for the Topic Engine it applies when the ticket renews.
- Machine callers stay open in `access.js` (Telegram webhook and file fetches, `/api/video/callback`, `/api/draws/*` with its key, `/api/calendar/tick`, `/api/calendar/media/*`, `/api/topics?warm=1`). A new machine endpoint must be added there or it will start answering 401 once `APP_LOGIN=all` is on.
- Without `publishing`, `/api/capabilities` reports Telegram off (the send buttons hide) and `/api/jobs` refuses the send kinds (`PUBLISH_JOBS`); `/api/publish` and `/api/gdoc` refuse POST.
- Locally use `EDITING_STORE_DIR=/some/folder` instead of the GitHub token: data stays in that folder and no worker is started.
- Checks and lessons come from the worker too: each version's result carries `qa` (flash cuts, a word said twice across a join, lips against sound; shown as "Checked before review") and, after corrections, `lessons`. Lessons are rule changes stored as `lessons/<id>.json` on `editing-data`; only the admin sees them (Video Editing → Lessons, `lib/editing/lessons.js`) and an approval dispatches the worker's `lesson` action, which commits the edits to english-sugimotovisa as shown. This app never edits the rules itself.
- Stages after the cut (`STAGES` in `lib/editing/projects.js`): once a version is approved, "Next step" offers Subtitles and Motion graphics (`POST /api/editing/projects/<id>/stage`). Each stage has its own versions, corrections and approval; runs carry `stage` (cut | subtitles | graphics) and graphics runs a `step`: a `plan` (storyboard summary + still frames from Drive) is approved first, which starts a `render` run; corrections on a render draw a new plan. The worker does the work with the team's skills (video-transcribe for subtitles, the language heard from the video; video-motion-graphics for graphics), never this app. Hidden until `EDITING_STAGES=on`, which is set only after that worker change is merged in english-sugimotovisa.
- Rules that never change: only pauses, false starts and retakes are removed (decided in english-sugimotovisa, never here); a version can be approved only after it reached review; nothing is posted to Instagram or TikTok from this section; a change to the editing rules goes into english-sugimotovisa's files, never only into this app.
- A member only ever reads their own projects: every API route loads the project through `loadProject(user, id)`, which answers 403 otherwise. Keep it that way for any new route.

## Content calendar

- Same accounts as Video Editing, same switch: off until `EDITING_SESSION_SECRET` and `EDITING_GITHUB_TOKEN` are set. State is on the `editing-data` branch, one file per board.
- Everyone signed in adds, edits and moves cards. Only the admin approves, publishes and edits lists and labels. Everyone signed in can turn a topic, and what was made from it, into cards; members add their own approved videos.
- From the topic page: the "📅 Content calendar" strip (`app/CalendarStrip.jsx`, `/api/calendar/topic`, `lib/calendar/fromTopic.js`) turns the carousel, story, English video, blog article or scripts into a draft card in the market's board (the board's Canada or EU label by the topic's market, plus the kind's label), caption and files filled in, linked back by `source.key` + `source.made` so the strip shows where it sits. A second copy needs an explicit "+". `/calendar?board=<id>&card=<id>` opens that post.
- A card holds one file (`media.url`) or up to 10 (`media.items`, first one mirrored in `media.url`): Instagram posts them as a carousel, or as Stories (`format: "story"`, one story per file, no caption); X takes up to 4 images; LinkedIn a multi-image post. The signed media link carries `i` for the file's position.
- One board for everything (the team's decision, Oct 2026): "Content calendar". Markets and kinds are labels (Canada, EU, Reel, Carousel…); `createBoard` refuses. Boards that existed before (Canada, EU, Mocko…) are folded into the oldest one by `consolidate` in `lib/calendar/model.js` the first time the list is read: cards move with every field, get a label named after their old board, and the old board is only hidden (`removed_at`), never deleted. The calendar views, the board and the Posts lists all filter by label.
- Cards brought over from Trello (the "Insta SugimotoVisa" board, Oct 2026) keep what Trello held: `cover` (colour band on the face, `COVER_COLORS`), `due_complete`, `attachments` (links, and Trello-hosted files that stay on Trello: only the link is kept), `trello` (card number, link back, members with no account in `unmapped`), custom fields as `links`, checklists, comments (by their real author's name, `by: "trello:<name>"` when there is no account). Colours live in `lib/calendar/palette.js`: label colours are `trello_<colour>` (the shades the team's phones show, so a `_dark` label is the bright one), and the lists the team filled in Trello are filled here (`forest`, `maroon`, `black`; the app's own list colours stay a stripe). Such cards are planning cards: `planningOnly` in `app/calendar/Publishing.jsx` keeps them out of the Posts tabs until a network is switched on or a time is set, and they never have a channel on, an approval or a publish time. A list draws 60 cards and "Show more", so the 600-card Completed lists stay quick on a phone.
- Each list has a Trello-style "…" menu (`app/calendar/ListMenu.jsx`, `POST /api/calendar/boards/<b>/lists`, `listAction` in `lib/calendar/model.js`): add card to top, rename, copy (cards become fresh drafts), move, sort, colour (`list.color`), move all cards, archive published / all cards / the list (not a list the publisher uses). Admin only: rename, copy, move, colour and every archive; sorting and moving cards is everyone's. No "Watch": there are no notifications to subscribe to. "Lists and labels" stays as the one-form editor and keeps each list's colour.
- Approval covers the captions and media of the switched-on channels (`contentHash`); changing either needs a new approval, moving the card or its date does not. A card is published only while its approval holds. Never weaken this: it is how "nothing goes to Instagram or TikTok without Hamed's approval" is kept here.
- **Posting to the networks is OFF until the credentials are tested** (the team's decision, Oct 2026). Master switch `CALENDAR_PLATFORM_POSTING=true` (`platformPosting()` in `lib/calendar/publisher.js`); without it the clock never starts, `tick()` does nothing, `publishCard` and the `publish_now` action refuse, and the "Publish now" / "Post right away" buttons hide. A finished post leaves the app only by hand: `PostFiles` (`app/calendar/PostFiles.jsx`) downloads the caption and files to the computer (`/api/calendar/boards/<b>/cards/<c>/file`) or saves them to a new folder in the person's own Google Drive (`DriveSaveButton` in `app/DrivePicker.jsx`, same Google keys as the picker). Turn the switch on only after each channel is tested (use `CALENDAR_DRY_RUN` first). The draws poster is separate (`DRAWS_AUTORUN`).
- Publishing: `CALENDAR_AUTOPUBLISH=true` (needs the master switch too) arms a clock (instrumentation.js) that publishes due, approved cards every minute. `CALENDAR_DRY_RUN=true` makes every channel only pretend. Failures are never retried by themselves; a post interrupted by a restart is marked "unknown" for a person to check.
- Publishing screens follow Zoho Social: New post composer (network icons, one caption with per-network customisation via `channels[k].custom`, media, schedule, live previews), month and week calendars coloured by `postStatus`, and post lists (Drafts, Waiting for approval, Scheduled, Published, Failed). Members "Send for approval"; Hamed approves, sends back with a note, or publishes. The Trello board stays as "Planning".
- Look and feel follow Trello: one dark top bar for the whole app (`AppBar` in `app/editing/ui.jsx`, used by `Shell` and by the Topic Engine itself with its Wizard/Refresh buttons in `actions`; apps filtered by access, account menu); on phones the calendar's left navigation is a bottom tab bar (Calendar, Posts, +, Board, More) with sheets, never a strip of pills; coloured board with grey lists and white cards (cover from the first file, label pills, date/checklist/files badges, coloured avatars from `avatarColor`), a card window that saves each change at once (no Save button) with the Members/Labels/Checklist/Dates/Links/Move/Archive side column, and on phones a compact month grid (a dot per post, coloured by status) with the chosen day's posts under it. "+ New post" first asks where the post comes from: from scratch, something already made in the Topic Engine, or the Topic Engine to make something new. Video Editing projects show as a board by stage.
- Time zones: the team is in Vancouver and Tehran (`TEAM_ZONES` in `lib/tz.js`). Stored times are exact moments (ISO); every screen shows a time in the viewer's own device zone, named, next to the same moment in the other place (`whenAll`, `pickerNote` under every date picker, the zone banner above the calendar views). A new place for the team goes into `TEAM_ZONES`; never print a bare clock time.
- Channels: X, LinkedIn and Instagram use the draws poster's keys on Render. TikTok and YouTube are connected from the calendar's Channels panel (tokens stored encrypted with a key from `EDITING_SESSION_SECRET`). Instagram gets the media through a signed app link, `/api/calendar/media/...`.

## Project skills

Team decisions for specific features live in `.claude/skills/` and load in every session: `content-playbook` (everything learned about making and designing content, all parts — start here), `instagram-story`, `carousel-design`, `video-benchmarks`, `lexbase-court-outcome`. Read the matching one before changing that feature, and update it when Hamed decides something new about it.

## The app learns from Hamed's notes

- Under every edit note in the Topic Engine (✏️ on a carousel slide or the Telegram picture, a story page's instruction, the carousel / story "note for the next version", the Telegram rewrite note) Hamed, and each member he ticks "Teach the app" (`learn` access) for on the Team page, sees "🧠 از این یادداشت یاد بگیر". Ticked, the note goes to the `learn` job (`lib/learning.js`, access checked in `/api/jobs`): a model decides whether it holds a general rule (not a one-off fix, no facts of that story, not a duplicate) and stores it as `learned/<id>.json` on `editing-data`. A notice at the bottom of the page says what was learned or why not.
- Rules go into every later prompt of their kind through `lessonsBlock(scope)`: `design` (carousel and Telegram pictures, drawing and ✏️ edits), `carousel` (slide text), `telegram`, `story`, `script`, `article`. They are never a source of facts. Hamed sees and switches them off under Video Editing → Lessons → Content rules.
- **Skill files:** each rule names its skill (`carousel-design`, `instagram-story`, `content-playbook`). A development session that works on that part reads the active rules (`/api/editing/content-lessons`, or the `learned/` folder on `editing-data`) and writes the ones still missing into the skill, dated, in the same commit as any related change.

## Conventions that matter here

- **Slow steps run as server jobs, not page fetches.** A phone freezes a page when you switch apps, so anything slow must be started with `startJob` in `app/page.jsx` (POST `/api/jobs`) and read back by polling. Never `await` a model call inside a click handler. Jobs are in memory: a deploy or restart mid-job loses it, and the page offers a retry.

- **The server writes the batch, the page only watches.** A run started by opening the app keeps going when the page is left (`startRun` in `app/api/topics/route.js`; opening with a deck older than `FRESH_MS` starts one). `GET /api/topics?deck=1` returns what exists now, including cards of a run still in progress; the page polls it while the stream said `generating`, and a page opened mid-run catches up from it.
- **A story is written into a card once.** `shownMem` in `app/api/topics/route.js` remembers every story that got a card (article link + published headline, 30 days), fed by each run and by the page, which sends what is on its list (`shown`). Runs skip those stories, the deck accumulates (new cards first), and "nothing new" keeps the deck instead of falling back to web search. Without it every run rewrote the same top stories and the page showed nothing new for hours. Right after a restart the warm job waits for the first page to say what it already has.
- **Topics stream.** `/api/topics` with `stream: true` sends one card per line as each write batch finishes, and the page also shows the deck saved on the device first. Keep both: never make the page wait for a whole batch.
- **Grounding is non-negotiable.** Every generated text must be supported by fetched source text. Never let a model see only a headline and write from it; if a source is too thin, drop it. Invented facts are the worst bug this app can have.
- Nothing goes to Telegram automatically: the news post, the article, the carousel, the story and the English video are each started from their own tile on the topic page. The news post reaches @sugimotovisa only from its own Send button, after a confirm. Carousels and stories no longer go to Telegram from the topic page: they go to the content calendar, where Hamed's approval holds as everywhere else (an admin's Schedule / Post right away approves after a confirm; anyone else's goes to him for approval).
- Stories: every page's quote must be found in the source text before anything is drawn, and the screenshot is a photograph of the original (PDF page or web page), never an image model's drawing. Screenshots are taken only when a story is made.
- Farsi output is the brand's own voice — never "according to the source", never sales lines or "DM us" in news posts.
- Express Entry draw results are excluded from topics (the brand covers them elsewhere).
- Evergreen ideas (`topic.evergreen`) are explainers, not news: the script, Telegram post, article and carousel prompts switch framing on that flag, and ground on the official page the harvester stored (`page_id`).
- Per-feed failures are swallowed on purpose so one dead source never breaks a batch — so when adding a source, confirm it on `/api/feeds` after deploy.
- Match the surrounding code's comment style: comments explain *why*, not what.
- Do not put model identifiers in commit messages or code comments.

## Current direction

Topic supply now runs on a harvested pool: `scripts/harvest.mjs` accumulates candidates every two hours into `candidates.json` on the `harvest-data` branch (never edit that branch by hand; it is force-pushed each run). The app reads it, filters, shortlists, has the model SELECT, fetches real text for each pick, then has the model WRITE cards from that text only. Next lanes: silent page-change detection on canada.ca, practitioner feeds, audience-demand signals. Ask the other person which lane they are on before starting one.
