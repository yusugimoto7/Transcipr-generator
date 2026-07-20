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
- **AI extraction** — Claude reads uploads and pre-fills intake fields; the applicant confirms.
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
- AI: `@anthropic-ai/sdk` (server-side only)
- PDFs: `pdf-lib`

## Run locally

Requires Node 18.18+.

```bash
cd platform
npm install
cp .env.example .env.local   # set ANTHROPIC_API_KEY and AUTH_SECRET
npm run dev                   # http://localhost:3001
```

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Claude API key (server only) |
| `AUTH_SECRET` | yes | Long random string to sign session cookies |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-sonnet-5` |
| `DATA_DIR` | no | Where accounts/applications JSON live (default `./data`) |
| `UPLOAD_DIR` | no | Where uploaded & generated files live (default `./uploads`) |

`data/` and `uploads/` hold applicant data and are git-ignored — never commit them.

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
    anthropic.js              Claude client + JSON helpers
    schema.js                 study-permit intake schema (source of truth)
    checklist.js              document checklist
    uploads.js                file storage + Claude content blocks
    pdf.js                    text → PDF renderer
    generators/               extract, review, sop, coverdocs, forms
```

## Deploy online

The app stores accounts, applications and uploaded files on disk, so it needs a host
with a **persistent disk** (not a serverless platform like Vercel, where the disk is
wiped on every deploy). A `Dockerfile` is included.

### Render (recommended)

1. Sign up at [render.com](https://render.com) with your GitHub account.
2. Click **New + → Web Service**, and connect the `Transcipr-generator` repository.
3. Configure the service:
   - **Root Directory**: `platform` (Render then auto-detects the Dockerfile; Language = Docker)
   - **Instance Type**: **Starter** or above. ⚠️ The Free tier cannot attach a disk —
     applicant data would be erased on every deploy/restart, so it is not usable here.
4. **Environment variables** (Advanced or the Environment tab):
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com
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
