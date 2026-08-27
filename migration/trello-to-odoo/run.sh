#!/usr/bin/env bash
# One-command Trello -> Odoo migration.
#
# Sets up the environment, collects credentials (typed here, never stored
# anywhere but the local .env), and walks the whole migration end to end with a
# confirmation before anything is written to Odoo.
#
#   ./run.sh
#
# Safe to re-run: it skips setup that is already done, and the migration itself
# never re-creates records it already migrated.

set -euo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
die()  { printf '\033[31merror: %s\033[0m\n' "$1" >&2; exit 1; }

# Windows (Git Bash) ships "python", Linux and macOS ship "python3".
PY=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 8))' 2>/dev/null; then
    PY="$candidate"; break
  fi
done
[ -n "$PY" ] || die "Python 3.8+ is not installed, or not on PATH. Get it from https://python.org/downloads (tick 'Add python.exe to PATH')."

step "Setting up"
if [ ! -d .venv ]; then
  "$PY" -m venv .venv || die "could not create a virtualenv (on Debian/Ubuntu: apt install python3-venv)"
fi
# A virtualenv puts its programs in bin/ on Unix and Scripts/ on Windows.
if [ -f .venv/bin/activate ]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
elif [ -f .venv/Scripts/activate ]; then
  # shellcheck disable=SC1091
  source .venv/Scripts/activate
else
  die "the virtualenv in .venv looks broken — delete it and re-run."
fi
pip install --quiet --disable-pip-version-check -r requirements.txt
echo "Python environment ready."

# --- credentials ------------------------------------------------------------

[ -f .env ] || { cp .env.example .env; chmod 600 .env; }
chmod 600 .env

get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"'; }
put() {
  local key="$1" value="$2" tmp
  tmp=$(mktemp)
  grep -vE "^$key=" .env > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" .env
  chmod 600 .env
}
ask() { # ask KEY "prompt" [secret]
  local key="$1" prompt="$2" secret="${3:-}" value
  [ -n "$(get "$key")" ] && return 0
  if [ -n "$secret" ]; then read -rsp "$prompt: " value; echo
  else read -rp "$prompt: " value; fi
  [ -n "$value" ] || die "$key is required."
  put "$key" "$value"
}

step "Trello credentials"
if [ -z "$(get TRELLO_API_KEY)" ]; then
  bold "Open https://trello.com/power-ups/admin — create a Power-Up, then copy its API key."
fi
ask TRELLO_API_KEY "Trello API key"
if [ -z "$(get TRELLO_TOKEN)" ]; then
  bold "Now open this URL, approve, and copy the token it shows:"
  python migrate.py auth-url
fi
ask TRELLO_TOKEN "Trello token" secret

step "Odoo credentials"
ask ODOO_URL "Odoo URL [https://odoo.sugimotogroup.org]"
if [ -z "$(get ODOO_USERNAME)" ]; then
  bold "In Odoo: avatar -> My Profile -> Account Security -> New API Key."
  bold "An API key works with 2FA on and can be revoked without changing your password."
fi
ask ODOO_USERNAME "Odoo login (email)"
ask ODOO_PASSWORD "Odoo API key" secret
if [ -z "$(get ODOO_DB)" ]; then
  python migrate.py probe || true
  ask ODOO_DB "Odoo database name"
fi

step "Checking the connection"
python migrate.py probe

# --- boards -----------------------------------------------------------------

step "Your Trello boards"
python migrate.py boards
echo
read -rp "Board ids to migrate, comma-separated: " BOARDS
[ -n "$BOARDS" ] || die "no boards given."

# --- people -----------------------------------------------------------------

step "Mapping people"
python migrate.py users --boards "$BOARDS"
echo
bold "Edit users.json now: put each person's Odoo login (email) next to their"
bold "Trello username. Leave blank for anyone without an Odoo account — their"
bold "name goes into the task description instead."
read -rp "Press Enter when users.json is saved... " _

# --- custom fields ----------------------------------------------------------

step "Creating Odoo fields for the Trello custom fields"
python migrate.py fields --boards "$BOARDS"

# --- dry run ----------------------------------------------------------------

step "Dry run (nothing is written)"
python migrate.py run --boards "$BOARDS" --include-activity --dry-run

echo
warn "The next step writes to Odoo at $(get ODOO_URL)."
read -rp "Type 'migrate' to continue: " CONFIRM
[ "$CONFIRM" = "migrate" ] || die "aborted — nothing was written."

# --- migrate ----------------------------------------------------------------

step "Migrating"
python migrate.py run --boards "$BOARDS" --include-activity

step "Verifying"
python migrate.py verify --boards "$BOARDS" || warn "Some objects are unmigrated — re-run ./run.sh to finish them."

step "Done"
bold "Open $(get ODOO_URL)/odoo/project to see the result."
echo "Per-board details, including any skipped attachments: report.json"
echo "Keep the Trello boards closed but undeleted for a couple of weeks."
