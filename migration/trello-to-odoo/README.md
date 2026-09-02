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
| Custom field | a real Odoo field on `project.task` (`x_trello_*`), shown in a **Trello data** tab |
| Archived card | task with `active = False` (visible under Filters → Archived) |
| Label | `project.tags`, colour carried across |
| Member | assignee, via `users.json` |
| Due date | `date_deadline`; "due complete" marks the task done |
| Checklist | rendered into the description as a ✔/☐ list, plus optional sub-tasks |
| Comment | log note on the task, original author and timestamp preserved |
| File attachment | `ir.attachment` on the task |
| Link attachment | link in the task description |
| Card history | optional dated log notes ("moved from X to Y"), with `--include-activity` |

Card order inside a list is preserved through `sequence`. Every task
description ends with a link back to its original Trello card. Farsi and other
right-to-left text is rendered with `dir="auto"`, so mixed Farsi/English cards
read correctly in Odoo.

## Custom fields

The visa boards keep most of their real data in custom fields — passport
number, deadlines, priority, spouse age. Odoo has no equivalent out of the box,
so the tool creates a genuine Odoo field per Trello custom field:

| Trello type | Odoo field |
| --- | --- |
| Text | `char` |
| Number | `float` |
| Date | `date` |
| Checkbox | `boolean` |
| Dropdown | `char` holding the selected option's text |

Fields are named `x_trello_<label>` and grouped into a **Trello data** tab on
the task form. One field is created per distinct label, shared across boards:
"Passport No." defined separately on four boards becomes a single Odoo field,
so the data is comparable between projects and the form stays readable. Labels
that differ only in punctuation or case collapse together; a label reused for a
different type gets its own suffixed field instead of a type clash. Being real fields, they are filterable, groupable and usable in
Odoo reports — which is most of the point of leaving Trello. The values are
*also* written into the task description as a table, so nothing is lost if you
later remove the fields or the tab.

Create them ahead of the migration to review them first:

```bash
python migrate.py fields --boards ID1,ID2,ID3,ID4,ID5
```

`--no-custom-fields` skips field creation entirely and keeps only the
description table.

## Reruns are safe

Each created record is stamped with an Odoo external id (`__trello__.card_<id>`)
keyed to its Trello object. Rerunning skips everything already migrated, so an
interrupted run is resumed by simply running it again. Nothing is ever written
back to Trello — the tool only issues GETs there.

## The short way

```bash
cd migration/trello-to-odoo
./run.sh
```

On **Windows**, run it from **Git Bash** (installed with Git for Windows —
right-click the folder → "Git Bash Here"), or from PowerShell as `bash run.sh`.
It is a shell script; PowerShell cannot run it directly.

It sets up Python, asks for the credentials it needs (they go into a local
`.env` with 0600 permissions and nowhere else), lists your boards, pauses while
you map people, does a dry run, asks for confirmation, migrates and verifies.
Re-running it is safe — it skips what is already done.

The rest of this document is the same process done by hand, and the reference
for the individual commands.

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

## Access

```bash
python migrate.py access --boards ID1,ID2,ID3,ID4,ID5
```

Mirrors Trello board membership: each project becomes "Invited internal users
only" and the Odoo users mapped from that board's Trello members are
subscribed to it. Members of one board cannot see another board's project.
Project Administrators keep seeing everything, and a task's assignee always
sees their task.

## Phase 2 — contracts as quotations (CRM untouched until you say so)

```bash
python migrate.py phase2 plan               # read-only: finds your Contract Types, writes products.json
python migrate.py phase2 install --db test  # products, quotation templates, signature setting; automation OFF
python migrate.py phase2 install            # same, on production, once test looks right
python migrate.py phase2 activate           # switch the CRM automation on — only after checking
```

`install` creates one service product and one quotation template per contract
type from `products.json`, turns on online signature for quotations (online
payment stays off — bookkeeping remains in QuickBooks), and installs the
"quotation signed → opportunity to payment stage" automation switched off. Until
`activate`, nothing in CRM behaves differently.

## Repair commands

Two commands exist to repair data migrated by earlier versions of this tool,
and are safe to rerun:

```bash
python migrate.py merge-fields          # collapse duplicate x_trello_* fields
python migrate.py fix-comments --boards ID1,...   # rewrite escaped chatter HTML
```

`merge-fields` collapses fields that repeat the same label and type into one,
moves every task's values onto the survivor, repoints the Trello stamps so
future runs keep writing to it, drops the duplicates, and rebuilds the Trello
data tab — which now lays fields out in two columns and hides, per task, any
field that has no value.

`fix-comments` rebuilds every migrated comment and history note from Trello
and rewrites the stored body, fixing messages saved with escaped HTML by older
runs; it also sets the comment author for anyone mapped in users.json.

## Options

| Flag | Effect |
| --- | --- |
| `--dry-run` | Report only, no writes |
| `--checklist-subtasks` | Also create a child task per checklist item |
| `--include-activity` | Also migrate card history (created / moved between lists) as log notes |
| `--no-custom-fields` | Do not create Odoo fields for Trello custom fields |
| `--update` | On a rerun, refresh already-migrated tasks from Trello. Off by default so edits made in Odoo are not overwritten |
| `--no-attachments` | Skip file downloads — much faster for a trial run |
| `--max-attachment-mb N` | Skip files larger than N MB (default 25) and list them in `report.json` |
| `--comments-as-messages` | Post comments as real messages instead of log notes |

## Think twice about `--checklist-subtasks` on the visa boards

Those cards carry document checklists with a hundred-plus items each. Turning
every item into a sub-task would produce tens of thousands of tasks and make
the project unusable. The default — checklists rendered into the description as
a ✔/☐ list, progress included — is the right choice for these boards. Use
sub-tasks only on boards with short, genuinely actionable checklists.

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
| `run.sh` | Guided end-to-end run — setup, credentials, migrate, verify |
| `migrate.py` | CLI and migration engine |
| `trello_client.py` | Read-only Trello API client, rate-limited |
| `odoo_client.py` | Odoo XML-RPC client and external-id bookkeeping |
| `render.py` | Trello Markdown → Odoo HTML |
| `custom_fields.py` | Trello custom fields → Odoo fields on `project.task` |
| `test_migration.py` | Offline test against fake Trello and Odoo (`python test_migration.py`) |
| `users.json` | Your Trello → Odoo people map (git-ignored) |
| `report.json` | Per-board results of the last run (git-ignored) |
