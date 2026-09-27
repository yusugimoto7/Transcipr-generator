# Canada Visa Platform

An applicant-facing web app that helps a person prepare a **Canadian Study Permit**
application end to end: upload raw documents, let AI read and pre-fill the intake,
review the file for completeness and refusal risks, and generate the supporting
documents and IRCC form data sheets.

> Phase 1 scope: **Study Permit for a single (never-married) applicant applying from
> outside Canada.** The architecture is generic so other streams (work permit, PR,
> visitor visa) can be added as new schemas + checklists + generators.

This is a document-preparation tool. It is **not** a law firm and does not provide
legal advice. Applicants should verify every generated document against their originals
and current IRCC instructions before submitting.

## Features

- **Accounts** — email/password sign-up, one account per user, multiple applications each.
- **Document upload** — PDFs and photos (passport, LOA, PAL, bank statements, transcripts, language results).
- **AI extraction** — GPT reads uploads and pre-fills intake fields; the applicant confirms.
- **Guided intake** — a multi-step wizard covering personal, passport, contact, study, finances, education, language, history, and ties/intent.
- **Checklist + AI review** — personalized document checklist and an AI readiness review with a score and concrete fixes.
- **Generated outputs** (PDF):
  - Statement of Purpose / Study Plan (also usable as Letter of Explanation)
  - Financial Summary (proof-of-funds cover sheet)
  - Submission Cover Letter
  - IMM 1294 & IMM 5645 **data sheets** (field-by-field values to transcribe into the official validated forms)
- **Submission package** — one-click ZIP of every generated document plus a `00_README_Submission_Guide.txt` (applicant summary, included-docs checklist, personalized IRCC document checklist, empty-field list, and last AI readiness score).
- **Direct form fill (ready)** — `lib/generators/forms.js#fillAcroForm` fills any fillable PDF that exposes real AcroForm fields. Drop a fillable template + its field map to enable direct filling for forms that support it.

## Tech

- Next.js 14 (App Router) + React 18 — all pure-JS, no native modules
- Auth: `bcryptjs` password hashing + `jose` JWT session cookies (httpOnly)
- Storage: file-based JSON store behind `lib/store.js` (swap for Postgres later)
- AI: `openai` SDK — OpenAI GPT (server-side only)
- PDFs: `pdf-lib`

## Run locally

Requires Node 18.18+.

```bash
cd platform
npm install
cp .env.example .env.local   # set OPENAI_API_KEY and AUTH_SECRET
npm run dev                   # http://localhost:3001
```

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | yes | OpenAI (GPT) API key (server only) |
| `AUTH_SECRET` | yes | Long random string to sign session cookies |
| `ADMIN_EMAIL` | yes (for staff use) | Email(s) that are always admin — the account that manages staff and assigns files |
| `OPENAI_MODEL` | no | Defaults to `gpt-4.1`. Must support image + PDF input |
| `OPENAI_BASE_URL` | no | Only for Azure OpenAI / a gateway / an OpenAI-compatible proxy |
| `DATA_DIR` | no | Where accounts/applications JSON live (default `./data`) |
| `UPLOAD_DIR` | no | Where uploaded & generated files live (default `./uploads`) |
| `ANTHROPIC_API_KEY` | no | Enables Claude as the second, independent document checker |
| `SECOND_MODEL` | no | `anthropic:<model>` (default `anthropic:claude-sonnet-5` when the key is set) or `openai:<model>` |
| `MAIL_USER` / `MAIL_PASSWORD` | no | The team mailbox for email intake (IMAP; IONOS defaults) |
| `MAIL_IMAP_HOST` / `MAIL_IMAP_PORT` / `MAIL_FOLDER` | no | Defaults `imap.ionos.com` / `993` / `INBOX` |
| `MAIL_POLL_MINUTES` / `MAIL_SINCE_DAYS` | no | How often to check (5) and how far back the first run looks (7) |
| `DRIVE_CLIENTS_FOLDER` | no | Link/ID of the Drive folder holding the client folders (share as Editor) |
| `IRCC_CHECK_HOURS` | no | How often IRCC checklists are re-checked (default 24) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | no | Service-account key for **Import from Google Drive** (raw JSON or base64) — see below |
| `DRIVE_MAX_FILE_MB` / `DRIVE_MAX_TOTAL_MB` / `DRIVE_MAX_FILES` | no | Drive import limits (defaults 25 / 400 / 300) |

`data/` and `uploads/` hold applicant data and are git-ignored — never commit them.

## Roles

| Role | How they get it | What they see |
|---|---|---|
| **Admin** | Registers with an email listed in `ADMIN_EMAIL` | Everything, plus `/admin`: create account managers, deactivate/reset, assign files |
| **Account manager** | Created by an admin in `/admin` | Files assigned to them (and files they created) |
| **Applicant** | Self-registers | Only their own applications; cannot set a client number or firm representation |

Two managers can work on the same file at once: every save carries the version it
was based on, and a save built on a stale version is rejected with a
"Updated by someone else — reloaded" notice instead of overwriting the other
person's work.

## Import a client's documents from Google Drive

On a file's **Documents** tab, staff paste the link of the client's Drive folder
and click **Import**. The platform downloads every usable file (PDF, JPG, PNG,
WEBP, DOCX), follows per-person subfolders and shortcuts, unpacks `.zip`
archives, exports Google Docs to PDF, files each document under its checklist
item by its code, and then reads them with AI to fill the intake. Backup
folders (`bk`, `old`, `used`, `Recovered files`…) are skipped unless ticked.
Anything it can't use (HEIC photos, RAR archives, `.doc`, oversize scans) is
listed with the reason. **Sync again** fetches only what changed in Drive.

Only admins and account managers see this — never applicants.

**One-time setup (admin, ~10 minutes):**

1. Go to <https://console.cloud.google.com/>, create a project (e.g. "Visa platform").
2. *APIs & Services → Library* → enable **Google Drive API**.
3. *IAM & Admin → Service accounts → Create service account* (no roles needed).
   Open it → *Keys → Add key → Create new key → JSON*. A `.json` file downloads.
4. On Render → the service → *Environment* → add `GOOGLE_SERVICE_ACCOUNT_JSON`
   and paste the **whole contents** of that file. Save (Render redeploys).
5. In Google Drive, share the firm's client-files folder with the service
   account's email (`…@….iam.gserviceaccount.com`, shown on the Import box) as
   **Viewer**. Every client subfolder under it is then importable; the folders
   stay private. The access is read-only.

The server only ever calls the Google API with the ID taken from the pasted link
— it never fetches the pasted URL itself.

## Where files are kept (Google Drive)

Google Drive is where every file lives; the server disk is only a cache.

| Folder in the client's Drive folder | What goes there |
|---|---|
| `01 - Documents` | everything the client sends — imported from Drive (already there), emailed, or uploaded on the platform |
| `02 - Final Files` | the numbered files for the IRCC portal; a rebuild replaces them in place, files a rebuild drops go to Drive's bin |
| `03 - Working Files` | letters, form data sheets, pre-filled forms, the next-steps note |

- The client folder is the one the file was imported from, else the folder with the client number under
  `DRIVE_CLIENTS_FOLDER`, else a new `S26160 - First Last` folder under this year's "… FILES" folder. A family
  shares one folder, named after the main applicant.
- New uploads and built files are copied up in the background within seconds, and a sweep every
  `DRIVE_SYNC_MINUTES` (default 10) catches anything missed (e.g. after a restart).
- Opening, previewing, reading or building with a file uses the cached copy, or fetches it back from Drive.
  The cache is kept under `CACHE_MAX_MB` (default 600) by removing the least recently used files that are
  **safely on Drive** and unused for `CACHE_IDLE_MINUTES` (default 30). A file not yet on Drive is never removed.
- Removing a document on the platform keeps its copy on Drive.
- Admin → **Storage** shows the Drive connection, cache use, anything still waiting for Drive and any errors,
  with "Save everything to Drive now".
- The service account needs **Editor** on the clients folder. Without a Drive connection files stay on the
  server disk, as before.

## Odoo (TR Visa project)

The platform reads the cards of the **TR Visa** project in Odoo (read-only) every 15 minutes:

- Each main applicant's file is linked to their card: by the client number when the file has one, else by the
  applicant's name. The file takes the card's number (`S26213`) and name; the whole family gets the number.
  When a client has several cards, the most recent one wins.
- A new card (open, created in the last `ODOO_IMPORT_DAYS`, default 365) becomes a client file. The type is read
  from the card's title or tags (e.g. "Study Permit", "Visitor", "100-304"); when it can't be, the file is marked
  **Check the type**. Assignees in Odoo are assigned on the platform when their emails match.
- Cards in closed (folded) stages and archived cards are ignored. A card chosen by hand (client page → pencil →
  Odoo card → Link) stays linked.
- Admin → **Odoo** shows the connection, the last sync and what it changed, with "Sync with Odoo now".

Setup on Render (Environment):

| Variable | Value |
|---|---|
| `ODOO_URL` | `https://yourcompany.odoo.com` |
| `ODOO_DB` | the database name (on odoo.com usually the subdomain) |
| `ODOO_USER` | the login email of the Odoo user whose key is used |
| `ODOO_API_KEY` | Odoo → My Profile → Account Security → **New API Key** |
| `ODOO_PROJECT` | optional, default `TR Visa` |

## Document check (صحت و سقم)

Every time documents are read, each one is also checked before it can go to
IRCC (`lib/verify.js`): the certified translation is compared with the Persian
original (names, dates, numbers, places, relationships), every Jalali ↔
Gregorian date pair is recomputed by the platform, names and dates are compared
with the intake and — across all of a person's documents — with their passport,
expiry and age of certificates are checked, and a translation bundle is checked
for its three parts (translation, certified copy of the original, original).
Each document gets a colour on the Documents tab, with the findings:

| Colour | Meaning |
|---|---|
| **green** | nothing found |
| **yellow** | minor: typos, formatting, notes |
| **orange** | needs attention: a part of the bundle missing, a vague or unclear statement, a secondary inconsistency |
| **red** | serious: a name, date or number wrong or different from the passport / intake, a wrong date conversion, an expired document, missing translation, key data illegible |

**Two models.** With `ANTHROPIC_API_KEY` set (or `SECOND_MODEL`), every
document is checked by two independent models — GPT and Claude — and the
verdicts are merged: a finding both report is *confirmed*; one only one model
reports stays visible, labelled "one model only — confirm by eye", and never
turns a document red on its own. Each AI finding must quote the words it refers
to; the platform reads the page with OCR and marks a finding whose quoted words
are not on the page as *unverified* (a hallucination looks exactly like that).
When the two models read a name, date or number differently, or disagree on
what the bundle contains, that is reported for a person to settle. Exact
checks (dates, passport comparison, expiry, bundle parts) are code, not AI.
Staff sign off each document with "I checked this document"; the tick shows on
its badge. Nothing makes AI output certain — this makes an error need to slip
past two models, an OCR check and a person.

Findings marked red or orange are also fed to the Review.

## Email intake (visa@sugimotovisa.com)

Documents clients email to the team arrive on the right file by themselves
(`lib/mailIntake.js`). The mailbox is checked every few minutes over IMAP; for
each new message with documents:

1. the sender is matched to a file — a client number in the subject or body
   (`S26160`), a sender address remembered on the file, the intake's email or
   the applicant's login;
2. the attachments (PDF, JPG, PNG, WEBP, DOCX; zips unpacked) are saved on the
   file, read and checked like any upload;
3. each document is named the team's way from what the reading found
   (`103 - Passport - Zahra.pdf`) and copied into the client's Drive folder
   under **01 - Documents**. A client with no folder yet gets one — `S26160 -
   First Last` with `01 - Documents` and `02 - Final Files` — under this
   year's `… FILES` folder (or the clients folder).

A message that matches no file, or several, waits under **Admin → Email
intake** for staff to file it (the sender is then remembered for that file).
The mailbox itself is never modified.

**Setup:**

1. On Render, set `MAIL_USER` (`visa@sugimotovisa.com`) and `MAIL_PASSWORD`
   (the mailbox password). The mailbox is at IONOS, so the defaults
   `MAIL_IMAP_HOST=imap.ionos.com`, `MAIL_IMAP_PORT=993` apply.
2. Set `DRIVE_CLIENTS_FOLDER` to the link of the folder that holds the client
   folders, and share that folder with the service account as **Editor**
   (Viewer is enough for importing, not for filing).
3. Optional: `MAIL_POLL_MINUTES` (default 5), `MAIL_SINCE_DAYS` (how far back
   the first run looks, default 7), `MAIL_FOLDER` (default INBOX).

## IRCC's current checklists

Every file is checked against what IRCC itself currently asks for, not only the
firm's own checklist:

- **General checklist** for the kind of application — IMM 5484 (visitor visa, super
  visa), IMM 5483 (study), IMM 5488 (work) from outside Canada; IMM 5555 / 5556 /
  5558 (student / worker / visitor) inside Canada. The newest version is found
  through the form's canada.ca page.
- **Visa office instructions** for the country the client applies from (intake:
  *Country of current residence*), e.g. Iran → Ankara: IMM 5855 (visit), IMM 5816
  (study), IMM 5896 (work).

Each source is re-checked when a file needs it and its copy is older than
`IRCC_CHECK_HOURS` (default 24). Only a changed text is read again by the AI; the
documents IRCC added or dropped are recorded. On a file's **Documents** tab,
*IRCC's current requirements* shows the sources, versions and recent changes, and
anything IRCC asks for that the firm's checklist lacks is added to that file's
checklist under **Also required by IRCC** (conditional items as *If applicable*).
Admins see every source and its history under **Admin → IRCC checklists**, with
**Check IRCC now**.

## Final files for the IRCC portal

**Generate → Final files for the IRCC portal** builds the set of files that go to
the portal — one per upload slot — numbered and named like the team's
"02 - Final Files" folders (`05 - Client Information - Zahra.pdf`). The set per
application type was learned from the firm's 2026 final folders (file names
only):

- forms first — main form, Schedule 1 (`imm5257_1e`), IMM 5645, IMM 5476 (an
  uploaded signed copy is used as is; otherwise the pre-filled official form) —
  then Passport, Photo (JPG), Client Information;
- then the documents that have their own slot for that type — e.g. Marriage
  Certificate (always separate), Birth Certificate & National ID Card, Police
  Clearance, CV, Education, Family Member Proof of Status, Financial Support,
  LOA, PAL, Consent for Travel, Custody Document, Health Insurance, Medical Exam;
- Submission Letter last.

Client Information holds everything else, with its table of contents, and never
repeats a document that has its own slot. Official forms are passed through
untouched. **Download all (.zip)** gives the whole set.

### Page orientation

Scans are turned upright by reading their text (Tesseract OCR with Persian +
English, `lib/orientationOcr.js`): Tesseract's orientation check when it is
confident, otherwise the rotation in which the page reads clearly best. Only
pages with too little text fall back to the vision model — asked to pick the
upright one of four pictures — and any page still undecided is left as scanned
and listed after the build so staff can check it.

## Application types

Defined in `lib/appTypes.js`, one per service in the TR Visa team's checklists
(`100-3xx` = applied from outside Canada, `100-4xx` = from inside Canada). Each
service has its own document codes (`103` passport, `107-1` PAL, `119-3`
business employees…) — clients name files with them, and the checklist ticks
items off by that code. IMM 5476 (and IMM 5713 for family) are added
automatically when the firm represents the client.

| Service | Type | IRCC forms | Group |
|---|---|---|---|
| 100-301 | Study Permit — Main Applicant | IMM 1294, IMM 5257B, IMM 5645 | Study — outside Canada |
| 100-305 | Study Permit — Child of a Student | IMM 1294, IMM 5645 | Study — outside Canada |
| 100-306 | Study Permit — Child of a Worker (parent's permit) | IMM 1294, IMM 5645, IMM 5646 | Study — outside Canada |
| 100-405 | Study Permit — Child, inside Canada (parent's permit) | IMM 5709 | Study — inside Canada |
| 100-406 | Study Permit — inside Canada (own LOA) | IMM 5709 | Study — inside Canada |
| 100-302 | Work Permit — Spouse of a Student | IMM 1295, IMM 5257B, IMM 5645 | Work — outside Canada |
| 100-304 | Work Permit — Spouse of a Foreign Worker | IMM 1295, IMM 5257B, IMM 5645 | Work — outside Canada |
| 100-311 | Work Permit — IMP C11 (Entrepreneur / Significant Benefit) | IMM 1295, IMM 5257B, IMM 5645 | Work — outside Canada |
| 100-401 | Open Work Permit — Iranian Nationals (public policy) | IMM 5710 | Work — inside Canada |
| 100-402 | Post-Graduation Work Permit (PGWP) | IMM 5710 | Work — inside Canada |
| — | Spousal Open Work Permit (inside Canada) | IMM 5710 | Work — inside Canada |
| 100-303 | Visitor Visa — Child of a Student | IMM 5257 | Visit — outside Canada |
| 100-307 | Visitor Visa (TRV) | IMM 5257, IMM 5257B, IMM 5645 | Visit — outside Canada |
| 100-308 | Visitor Visa — Accompanying Spouse | IMM 5257, IMM 5257B, IMM 5645 | Visit — outside Canada |
| 100-309 | Visitor Visa — Accompanying Child | IMM 5257 | Visit — outside Canada |
| 100-310 | Visitor Visa — Business | IMM 5257, IMM 5257B, IMM 5645 | Visit — outside Canada |
| 100-312 | Super Visa (Parents & Grandparents) | IMM 5257, IMM 5257B, IMM 5645 | Visit — outside Canada |
| 100-403 | Visitor Visa (TRV) — for Work / Study Permit Holders | IMM 5257, IMM 5645 | Visit — inside Canada |
| 100-404 | Visitor Record — extend stay as a visitor | IMM 5708 | Visit — inside Canada |
| — | Reconsideration request (after refusal) | IMM 5744 | After a decision |

TRV-from-inside (100-403) and Visitor Record (100-404) are deliberately separate:
a TRV lets someone re-enter Canada after travelling (counterfoil, visa office),
a Visitor Record lets them stay longer (status document, in-Canada office) —
different form, office, documents and letter.

Each type declares its intake steps, IRCC forms
(with the firm's 1xx document codes), checklist, compiled packages, letters and
process stages. Adding a type is a data change in that file.

## Project layout

```
platform/
  app/
    api/                      REST endpoints (auth, applications, upload, extract, review, generate, download)
    login, register/          auth pages
    dashboard/                applications list
    application/[id]/         the workspace (Documents → Intake → Review → Generate)
  components/                 client UI (AuthForm, TopBar, Workspace, panels/*)
  lib/
    store.js                  data layer (users + applications)
    auth.js                   sessions & password hashing
    ai.js                     OpenAI (GPT) client + JSON helpers
    schema.js                 study-permit intake schema (source of truth)
    checklist.js              document checklist
    uploads.js                file storage + model content blocks
    pdf.js                    text → PDF renderer
    generators/               extract, review, sop, coverdocs, forms
```

## Deploy online

The app stores accounts, applications and uploaded files on disk, so it needs a host
with a **persistent disk** (not a serverless platform like Vercel, where the disk is
wiped on every deploy). A `Dockerfile` is included.

### Render (recommended)

**Easiest path — Blueprint (one click).** A `render.yaml` Blueprint at the repo root
configures everything (service, root dir, disk at `/data`, env vars) automatically:

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. **New + → Blueprint** → select the `Transcipr-generator` repo.
3. Render reads `render.yaml`; enter your `OPENAI_API_KEY` when prompted
   (`AUTH_SECRET` is generated automatically). Click **Apply**.
4. When the service shows **Live**, you're online at `https://canada-visa-platform.onrender.com`
   (or similar).

**Manual path** (if you prefer configuring by hand):

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. Click **New + → Web Service**, and connect the `Transcipr-generator` repository.
3. Configure the service:
   - **Root Directory**: `platform` (Render then auto-detects the Dockerfile; Language = Docker)
   - **Instance Type**: **Starter** or above. ⚠️ The Free tier cannot attach a disk —
     applicant data would be erased on every deploy/restart, so it is not usable here.
4. **Environment variables** (Advanced or the Environment tab):
   - `OPENAI_API_KEY` = your key from platform.openai.com
   - `AUTH_SECRET` = a long random string (32+ chars)
5. **Add a Disk** (Advanced → Add Disk, or the service's Disks tab after creation):
   - Name: `visa-data` · **Mount Path: `/data`** · Size: 1 GB is plenty to start.
   The mount path must be exactly `/data` — that is where the Dockerfile keeps
   accounts (`/data/store`) and uploads (`/data/uploads`).
6. Click **Create Web Service**. The first build takes a few minutes; when it shows
   **Live**, your platform is at `https://<your-service-name>.onrender.com`.

Notes:
- Render sets `PORT` automatically and the app picks it up — no port config needed.
- Every `git push` to the connected branch auto-deploys; the disk (your data) persists
  across deploys.
- Costs ≈ $7/month (Starter) + $0.25/GB for the disk.

(Railway or Fly.io also work the same way — Docker + a volume mounted at `/data`.)

Uploaded applicant documents are personal data — keep the URL private until you add
hardening (rate limiting, backups; HTTPS-only cookies are already on in production).

## Extending to new streams

1. Add a schema in `lib/schema.js` (steps + fields).
2. Add a checklist in `lib/checklist.js`.
3. Add form maps / generators as needed in `lib/generators/`.
4. The UI (wizard, review, generate) is schema-driven and adapts automatically.

## Roadmap / TODO

- Fold in the user's sample "final files" to match exact formatting/wording.
- Direct fill of any IRCC forms that expose real AcroForm fields (`fillAcroForm`).
- Additional streams: work permit, visitor visa, PR (Express Entry).
- Optional: swap the JSON store for Postgres, add spouse/dependents support.
