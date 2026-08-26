# Trello → Odoo migration

Moves Trello boards into Odoo Project, keeping cards, stages, labels,
assignees, due dates, checklists, comments (with their original author and
date) and file attachments.

Target instance: `https://odoo.sugimotogroup.org`

## What maps to what

| Trello | Odoo |
| --- | --- |
| Board | `project.project` |
| List | `project.task.type` (a stage scoped to that project) |
| Card | `project.task` |
| Archived card | task with `active = False` (visible under Filters → Archived) |
| Label | `project.tags`, colour carried across |
| Member | assignee, via `users.json` |
| Due date | `date_deadline`; "due complete" marks the task done |
| Checklist | rendered into the description as a ✔/☐ list, plus optional sub-tasks |
| Comment | log note on the task, original author and timestamp preserved |
| File attachment | `ir.attachment` on the task |
| Link attachment | link in the task description |

Card order inside a list is preserved through `sequence`. Every task
description ends with a link back to its original Trello card.

## Reruns are safe

Each created record is stamped with an Odoo external id (`__trello__.card_<id>`)
keyed to its Trello object. Rerunning skips everything already migrated, so an
interrupted run is resumed by simply running it again. Nothing is ever written
back to Trello — the tool only issues GETs there.

## Step by step

### 1. Install

```bash
cd migration/trello-to-odoo
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

### 2. Get Trello credentials

Open <https://trello.com/power-ups/admin>, create a Power-Up (any name), and
copy its **API key** into `TRELLO_API_KEY` in `.env`. Then:

```bash
python migrate.py auth-url     # open the printed URL, approve, copy the token
```

Put the token in `TRELLO_TOKEN`. Use an account that can see all five boards.

### 3. Get Odoo credentials

In Odoo: avatar → **My Profile** → **Account Security** → **New API Key**. Put
your login in `ODOO_USERNAME` and the API key in `ODOO_PASSWORD` (an API key is
safer than your password and works even with 2FA enabled). Then confirm the
connection and find the database name:

```bash
python migrate.py probe
```

The migration needs a user with rights to create projects and tasks —
**Project → Administrator** is the simple choice.

### 4. Install the Project app

In Odoo, **Apps → Project → Install**, if it is not already there. Nothing else
needs installing; the script uses only stock Project models.

### 5. List your boards

```bash
python migrate.py boards
```

Copy the ids of the five boards you want.

### 6. Map people

```bash
python migrate.py users --boards ID1,ID2,ID3,ID4,ID5
```

This writes `users.json` listing every Trello member found. Fill in each
person's Odoo login (their email):

```json
{
  "yusugimoto": "yu@sugimotogroup.org",
  "someoneelse": ""
}
```

Leave a value blank for anyone who has no Odoo account — their name is written
into the task description instead, so nothing is lost. Each of these people
must already exist as an Odoo user; create them first if you want them
assigned.

### 7. Dry run

```bash
python migrate.py run --boards ID1,ID2,ID3,ID4,ID5 --dry-run
```

Writes nothing. It reports, per board, how many stages, tags, cards, archived
cards, comments and attachments will be migrated, and warns about members
missing from `users.json`.

### 8. Migrate one board first

Start with your smallest board and inspect the result in Odoo before doing the
rest:

```bash
python migrate.py run --boards SMALL_BOARD_ID --checklist-subtasks
```

### 9. Migrate the rest

```bash
python migrate.py run --boards ID2,ID3,ID4,ID5 --checklist-subtasks
```

Attachments dominate the runtime — each file is downloaded from Trello and
uploaded to Odoo. A board with a few hundred cards and no large files takes a
few minutes.

### 10. Verify

```bash
python migrate.py verify --boards ID1,ID2,ID3,ID4,ID5
```

Compares Trello and Odoo object by object and exits non-zero if anything is
still unmigrated. Rerun `run` to finish those. `report.json` from the last run
lists any attachments that were skipped, with their Trello URLs.

### 11. Then, and only then

Keep the Trello boards read-only for a couple of weeks as a safety net —
close them rather than deleting them. Deleting a Trello board is irreversible
and takes its attachments with it.

## Options

| Flag | Effect |
| --- | --- |
| `--dry-run` | Report only, no writes |
| `--checklist-subtasks` | Also create a child task per checklist item |
| `--update` | On a rerun, refresh already-migrated tasks from Trello. Off by default so edits made in Odoo are not overwritten |
| `--no-attachments` | Skip file downloads — much faster for a trial run |
| `--max-attachment-mb N` | Skip files larger than N MB (default 25) and list them in `report.json` |
| `--comments-as-messages` | Post comments as real messages instead of log notes |

## Two things worth knowing

**Comments are posted as internal log notes by default.** A real Odoo message
notifies every follower, which for a few thousand migrated comments means a few
thousand emails. Log notes appear in the same chatter thread without sending
anything. `--comments-as-messages` overrides this — think before using it.

**Odoo version differences are detected, not assumed.** Odoo 17 renamed the task
assignee to a many-to-many and made the deadline a datetime. The script probes
the field layout at startup and adapts; on a single-assignee version, extra
Trello members are named in the description. `probe` prints what it found.

## Files

| File | Purpose |
| --- | --- |
| `migrate.py` | CLI and migration engine |
| `trello_client.py` | Read-only Trello API client, rate-limited |
| `odoo_client.py` | Odoo XML-RPC client and external-id bookkeeping |
| `render.py` | Trello Markdown → Odoo HTML |
| `users.json` | Your Trello → Odoo people map (git-ignored) |
| `report.json` | Per-board results of the last run (git-ignored) |
