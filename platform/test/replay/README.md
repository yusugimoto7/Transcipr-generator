# Nightly replay of past clients

Every evening (6:10–9:30 pm Vancouver time) a scheduled Claude Code session
takes past clients' applications one at a time and replays each one on the
platform. It starts from the documents the client sent, fills the intake and
builds the final files. Then it compares the result, file by file and box by
box, with what the team actually submitted, and improves the platform. In the
morning the firm finds:

- a **pull request** with the platform fixes, ready to review;
- a **report per client** and a **night summary** in the Drive reports folder.

This file is the procedure that session follows. Follow it step by step.

## Rules (never break these)

1. **Google Drive is read-only.** `replay.mjs` runs the platform with
   `DRIVE_READ_ONLY=1`: a read-only token, and every write is refused. The
   only writes are `replay.mjs report` and `replay.mjs night`, which write
   only inside the reports folder (`DRIVE_REPORTS_FOLDER`). Don't use any
   other way to reach Drive.
2. **Nothing else outside this machine:** no Odoo, no mailbox, no IRCC
   portal, no messages to clients.
3. **No client data in the repository, ever.** The repository is public.
   Code, tests, commit messages, the PR, `LOG.md`: no names, file numbers,
   dates of birth, passport numbers, addresses, employers, schools or
   anything else from a client file. Say "client 2 of tonight
   (owp-outside)". Regression tests use invented people (`test/e2e/profiles.mjs`).
4. **Client data stays in `REPLAY_DIR`** (default `/tmp/replay`, outside the
   repository) and in the reports folder. Run `replay.mjs clean` before the
   session ends, whatever happens.
5. **Never open** the folders "01 - Samples" or "00-BK", or the file
   "imm5476e - Hamed Sugimoto New.pdf".
6. **The team's files are a reference, not the truth.** Copy what the team
   does consistently. Where one file looks wrong (a box that contradicts the
   documents, a missing page, a wrong order), don't copy it: put it on the
   questions list for the firm.
7. **Never copy answers from the team's final forms into the intake.** Fill
   the intake only from the client's documents (including their forms 124 /
   128 and questionnaires), the way a team member would. Comparing the forms
   afterwards is how the platform's gaps show.
8. **A person approves every change.** Open a pull request; never merge it,
   never push to `claude/canada-visa-permit-platform-1nd07u` directly.
9. **Time box.** Check the time with `TZ=America/Vancouver date`. Start no new
   client after 8:45 pm. By 9:30 pm: PR opened, summary uploaded, `clean` run.

## 0. Set up

```bash
bash platform/scripts/replay-setup.sh
export PYTHON_BIN=/tmp/pv/bin/python
cd platform
```

Check the environment has `GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY`,
`DRIVE_CLIENTS_FOLDER` and `DRIVE_REPORTS_FOLDER` (only check that each is set;
never print them). If one is missing, have a **fictional-only night**: run
`npm test` and the E2E suite (`node test/e2e/run.mjs`), add one new invented
client with unusual details to `test/e2e/profiles.mjs`, fix what fails, and
open the PR. Say in the PR which variable was missing.

## 1. Choose tonight's clients

1. `node test/replay/replay.mjs done` lists the clients already replayed.
2. Find the firm's application list (`node test/replay/replay.mjs find-file
   "TR-Files"`, then `csv <id>`). It gives each client's file number,
   application type and submission date. If you can't find it, walk
   `DRIVE_CLIENTS_FOLDER` with `list` (year folders, then `S26… - Name`
   folders) and judge the type from the team's final files.
3. Order: **spouse work permits from outside Canada (`owp-outside`) first,
   latest submission first.** Once ten of those are done, take the other
   types the same way (`owp-worker-spouse`, `study-permit`, `trv-outside`,
   `study-permit-minor`, `super-visa`, then the rest), still latest first.
   Skip clients with no final files folder.
4. Plan 2–3 clients a night. Quality over quantity.

## 2. Replay one client

```bash
node test/replay/replay.mjs start <client folder id> --type <type>
```

This opens a file on a private local copy of the platform. It imports the
client's documents folder (`01 - Documents`, or every folder that isn't the
team's) and runs "Read documents & fill intake" with the real document reader.
It also downloads the team's final files into `$REPLAY_DIR/<number>/team/`.
It prints what the intake still needs. `status.json` lists every document and
where it is on this machine.

**Fill the intake like a team member.** Open the client's documents (forms
124/128, questionnaires, letters, the documents themselves) and answer what is
still missing. Write a JSON file of `{ fieldId: value }` and run:

```bash
node test/replay/replay.mjs answer <number> answers.json
```

Use the field ids and options `status` prints. Leave a field empty only when
the documents don't say. Note it as "not in the documents".

Then build and compare:

```bash
node test/replay/replay.mjs build <number>
```

This builds the final files exactly as the team would press **Build**, and
downloads them to `platform/`. It then writes `compare.md` / `compare.json`:

- which files each side has, and in what order;
- page counts and the pages one side has and the other does not;
- every IRCC form box that differs (team vs platform);
- what the intake still misses and what the forms flag for the team.

## 3. Review like the firm's most careful case officer

Go through `compare.md`, then **look at the files themselves**. Open the PDFs
and the page pictures. At least look at the main form, Client Information and
the Financial file on both sides. For each difference decide what it is:

| Kind | Example | What to do |
|---|---|---|
| **Platform bug** | a box the documents answer is empty or wrong; a document in the wrong file; pages rotated; a blank page | Fix it (step 4) |
| **Platform doesn't know the firm's way** | the team always puts the CV in Client Information; always adds a family-status file | Fix it when the team does it the same way in 2 or more clients, or it is clearly right |
| **Team inconsistency or possible mistake** | a box that contradicts the passport; a document missing from one file only | Don't copy. Add to the questions list |
| **Not in the documents** | an answer the team got by phone | Note it. Consider a new intake question or questionnaire item |

Quality points to check in every package: the right documents and nothing
extra; the firm's order of sections; translations next to their originals;
readable scans; no duplicate or blank pages; reasonable file size; the
portal's size limits.

Write `findings.md` in `$REPLAY_DIR/<number>/`. It may name the client: it
goes only to Drive. Then upload:

```bash
node test/replay/replay.mjs report <number> findings.md
```

## 4. Fix the platform

- Work on this session's own branch. Make the smallest change that fixes the
  cause, in the platform's style.
- Add or extend a fictional E2E client (`test/e2e/profiles.mjs`, invented
  details) that shows the problem, and an `expect` for the box or file you
  fixed.
- Run `npm test` and `node test/e2e/run.mjs <types you touched>` (run a
  `npx next build` first after changing `lib/`). Everything must pass
  before you commit. If a fix breaks other types, revert it and report it
  instead.
- Commit messages describe the platform change only.

## 5. Before 9:30 pm

1. Add a short entry to `test/replay/LOG.md`: date, how many clients by type,
   what was fixed, how many questions for the firm. No client data.
2. Push the branch and open a pull request into
   `claude/canada-visa-permit-platform-1nd07u`, titled `Nightly replay
   YYYY-MM-DD: …`. Body: each fix and why, the tests run, and "questions for
   the firm are in the Drive reports folder". No client data.
3. Write the night summary (`night.md`: clients replayed, by number and type;
   fixes; questions for the firm; anything that blocked you). Upload it with
   `node test/replay/replay.mjs night night.md`.
4. `node test/replay/replay.mjs clean`.

## Self-test

`node test/replay/selftest.mjs` runs all of this on an invented client in a
stand-in Drive. It checks that the platform signs in to Drive read-only and
that nothing is written outside the reports folder. Run it after changing
`replay.mjs`, `compare.py` or `lib/drive.js`.
