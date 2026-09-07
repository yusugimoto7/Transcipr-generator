"""Archive CRM cards: departed people's cards, and cards gone quiet.

Two rules, applied only to cards that are still active:

  people   every card owned or created by the named people
  stale    every card with no write and no chatter message for N days

Archiving is reversible in Odoo (filter on Archived, then Unarchive), and
every run writes the ids it touched to archived_cards.json so an exact undo
is possible even after other changes.
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
BATCH = 25          # bigger writes time out behind the proxy (502)
RETRIES = 4


def _write_active(odoo, ids, value):
    """Flip `active` in small batches; a slow write can 502 behind the proxy."""
    from odoo_client import server_proxy
    # A hung request must fail fast and be retried, not block the whole run.
    odoo.models = server_proxy(f"{odoo.url}/xmlrpc/2/object", timeout=120)
    done = []
    for i in range(0, len(ids), BATCH):
        chunk = ids[i:i + BATCH]
        for attempt in range(RETRIES):
            try:
                odoo.write("crm.lead", chunk, {"active": value})
                done.extend(chunk)
                break
            except (xmlrpc.client.ProtocolError, OSError) as exc:
                if attempt == RETRIES - 1:
                    log.error("giving up on cards %s: %s", chunk[:3], exc)
                    return done
                time.sleep(2 ** attempt)
        if (i // BATCH) % 20 == 0 and i:
            log.info("  %d/%d…", len(done), len(ids))
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
    """The active cards each rule matches, as {rule: [(id, name, stage), ...]}."""
    picked = {}
    if user_names:
        users = find_users(odoo, user_names)
        ids = [u["id"] for u in users]
        log.info("people: %s", ", ".join(f"{u['name']} <{u['login']}>" for u in users))
        rows = odoo.search_read("crm.lead", ["|", ("user_id", "in", ids), ("create_uid", "in", ids)],
                                ["name", "stage_id", "user_id"])
        picked["people"] = rows
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
    done = _write_active(odoo, ids, False)
    record = {
        "when": datetime.datetime.now().isoformat(timespec="seconds"),
        "rules": {rule: [r["id"] for r in rows] for rule, rows in picked.items()},
        "cards": [{"id": r["id"], "name": r["name"],
                   "stage": (r.get("stage_id") or [0, ""])[1]}
                  for rows in picked.values() for r in rows],
    }
    history = json.loads(LOG_FILE.read_text(encoding="utf-8")) if LOG_FILE.exists() else []
    history.append(record)
    LOG_FILE.write_text(json.dumps(history, indent=1, ensure_ascii=False), encoding="utf-8")
    log.info("archived %d of %d cards; ids written to %s", len(done), len(ids), LOG_FILE.name)
    return done


def unarchive_last(odoo):
    """Undo the most recent archive run."""
    history = json.loads(LOG_FILE.read_text(encoding="utf-8")) if LOG_FILE.exists() else []
    if not history:
        raise SystemExit(f"{LOG_FILE.name} has no runs to undo")
    ids = sorted({c["id"] for c in history[-1]["cards"]})
    done = _write_active(odoo, ids, True)
    log.info("restored %d of %d cards from the run of %s", len(done), len(ids), history[-1]["when"])
    return done
