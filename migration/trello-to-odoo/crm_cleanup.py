"""Archive CRM cards: departed people's cards, and cards gone quiet.

Two rules, applied only to cards that are still active:

  people   every card owned or created by the named people
  stale    every card with no write and no chatter message for N days

Archiving is reversible in Odoo (filter on Archived, then Unarchive), and
every run writes what it plans to touch to archived_cards.json before it
starts, so an exact undo stays possible even if the run is interrupted.

Writes go in very small batches: archiving a lead fires several of this
database's automations, and a batch of 25 already exceeds the web proxy's
60-second gateway timeout.
"""

import datetime
import json
import logging
import pathlib
import time
import xmlrpc.client

log = logging.getLogger(__name__)

HERE = pathlib.Path(__file__).resolve().parent
LOG_FILE = HERE / "archived_cards.json"
BATCH = 5            # ~1.4s per card; 10 per write already risks the 60s proxy timeout
TIMEOUT = 90         # seconds per request, so a slow write fails instead of hanging
RETRIES = 2


def _history():
    return json.loads(LOG_FILE.read_text(encoding="utf-8")) if LOG_FILE.exists() else []


def _save(history):
    LOG_FILE.write_text(json.dumps(history, indent=1, ensure_ascii=False), encoding="utf-8")


def _write_active(odoo, ids, value, on_progress=None):
    """Flip `active` in small batches, skipping (not aborting on) a bad batch."""
    from odoo_client import server_proxy
    odoo.models = server_proxy(f"{odoo.url}/xmlrpc/2/object", timeout=TIMEOUT)
    done, failed = [], []
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        for attempt in range(RETRIES):
            try:
                odoo.write("crm.lead", chunk, {"active": value})
                done.extend(chunk)
                break
            except (xmlrpc.client.ProtocolError, OSError) as exc:
                if attempt == RETRIES - 1:
                    log.warning("  skipped %s (%s)", chunk, type(exc).__name__)
                    failed.extend(chunk)
                else:
                    time.sleep(2)
        if on_progress and (i // BATCH) % 20 == 0 and i:
            log.info("  %d/%d…", len(done), len(ids))
            on_progress(done)
    if failed:
        log.warning("%d cards could not be written: %s", len(failed), failed[:10])
    return done


def find_users(odoo, names):
    """Users whose name matches any of `names` (archived users included)."""
    found, missing = [], []
    for needle in names:
        rows = odoo.search_read("res.users", [("name", "ilike", needle)], ["name", "login"],
                                context={"active_test": False})
        if rows:
            found.extend(rows)
        else:
            missing.append(needle)
    if missing:
        raise SystemExit(f"no user matches: {', '.join(missing)}")
    return found


def last_touch(odoo):
    """lead id -> the later of its write date and its newest chatter message."""
    last = {}
    for m in odoo.search_read("mail.message", [("model", "=", "crm.lead")], ["res_id", "date"]):
        day = (m["date"] or "")[:10]
        if last.get(m["res_id"], "") < day:
            last[m["res_id"]] = day
    return last


def select(odoo, user_names=(), quiet_days=None):
    """The active cards each rule matches, as {rule: [row, ...]}."""
    picked = {}
    if user_names:
        users = find_users(odoo, user_names)
        ids = [u["id"] for u in users]
        log.info("people: %s", ", ".join(f"{u['name']} <{u['login']}>" for u in users))
        picked["people"] = odoo.search_read(
            "crm.lead", ["|", ("user_id", "in", ids), ("create_uid", "in", ids)],
            ["name", "stage_id", "user_id"])
    if quiet_days:
        cutoff = (datetime.date.today() - datetime.timedelta(days=quiet_days)).isoformat()
        last = last_touch(odoo)
        rows = odoo.search_read("crm.lead", [], ["name", "stage_id", "write_date", "activity_ids"])
        picked["stale"] = [r for r in rows
                           if max(r["write_date"][:10], last.get(r["id"], "")) < cutoff]
        log.info("quiet since %s: %d cards (%d have a scheduled activity)", cutoff,
                 len(picked["stale"]), sum(1 for r in picked["stale"] if r["activity_ids"]))
    return picked


def archive(odoo, picked, dry_run=True):
    ids = sorted({r["id"] for rows in picked.values() for r in rows})
    for rule, rows in picked.items():
        log.info("  %-7s %d cards", rule, len(rows))
    log.info("%s %d cards in total", "would archive" if dry_run else "archiving", len(ids))
    if dry_run or not ids:
        return ids

    # Record the plan before touching anything: an interrupted run stays undoable.
    seen, cards = set(), []
    for rows in picked.values():
        for r in rows:
            if r["id"] not in seen:
                seen.add(r["id"])
                cards.append({"id": r["id"], "name": r["name"],
                              "stage": (r.get("stage_id") or [0, ""])[1]})
    history = _history()
    history.append({"when": datetime.datetime.now().isoformat(timespec="seconds"),
                    "rules": {rule: [r["id"] for r in rows] for rule, rows in picked.items()},
                    "planned": ids, "done": [], "cards": cards})
    _save(history)

    def progress(done):
        history[-1]["done"] = list(done)
        _save(history)

    done = _write_active(odoo, ids, False, on_progress=progress)
    history[-1]["done"] = done
    _save(history)
    log.info("archived %d of %d cards; ids written to %s", len(done), len(ids), LOG_FILE.name)
    return done


def unarchive_last(odoo):
    """Undo the most recent archive run."""
    history = _history()
    if not history:
        raise SystemExit(f"{LOG_FILE.name} has no runs to undo")
    run = history[-1]
    ids = sorted(run.get("done") or run.get("planned") or [c["id"] for c in run["cards"]])
    done = _write_active(odoo, ids, True)
    log.info("restored %d of %d cards from the run of %s", len(done), len(ids), run["when"])
    return done
