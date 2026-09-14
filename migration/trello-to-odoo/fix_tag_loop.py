"""Stop the "Tag Assignment" automation from re-writing the card on every write.

Studio automation "Tags" (server action "Tag Assignment") runs on every write
of a CRM card and ended with an unconditional

    record.write({'tag_ids': tags_to_add + tags_to_remove})

even when every tag was already in place.  Each such write fires all the
card's automations again, which (through the stored "x_last_update" field
that depends on write_date) fed the same action once more.  On some cards
the cycle never converged: moving a card into "22- Sent to Execution Team"
executed this action ~6,000 times and "Stage Time" ~10,000 times in one
request, until nginx returned 502 and Odoo rolled everything back -- which
the team saw as "the card does not go to the execution team".

This patch makes the action write only the tag commands that change
something.  Behaviour is otherwise identical.

Run:  PYTHONPATH=. .venv/bin/python fix_tag_loop.py [test|prod]
"""
import os
import sys

from dotenv import load_dotenv

from odoo_client import Odoo

MARKER = "tag_canada = 28"   # the action is found by content; ids differ per database

OLD = """# به‌روزرسانی فیلد tag_ids با استفاده از دستور write
if tags_to_add or tags_to_remove:
    record.write({'tag_ids': tags_to_add + tags_to_remove})"""

NEW = """# Only touch the card when a tag actually changes. Every write here fires all
# the card's automations again, and a no-op write kept that cycle going until
# the request timed out.
current = set(record.tag_ids.ids)
changes = [c for c in tags_to_add if c[1] not in current] + [c for c in tags_to_remove if c[1] in current]
if changes:
    record.write({'tag_ids': changes})"""


def main():
    load_dotenv(".env")
    which = sys.argv[1] if len(sys.argv) > 1 else "test"
    db = os.environ["ODOO_DB"] if which == "prod" else "test"
    pw = os.environ["ODOO_PASSWORD"] if which == "prod" else os.environ["ODOO_PASSWORD__TEST"]
    odoo = Odoo(os.environ["ODOO_URL"], db, os.environ["ODOO_USERNAME"], pw)
    odoo.login()

    hits = [a for a in odoo.search_read("ir.actions.server",
                                        [("model_id.model", "=", "crm.lead"), ("state", "=", "code")],
                                        ["name", "code"])
            if MARKER in (a["code"] or "")]
    if len(hits) != 1:
        sys.exit("expected one Tag Assignment action on %s, found %d" % (db, len(hits)))
    action = hits[0]
    code = action["code"]
    if NEW in code:
        print("already patched: action %s on %s" % (action["id"], db))
        return
    if OLD not in code:
        sys.exit("the write block does not look like the original; patch by hand")
    odoo.execute("ir.actions.server", "write", [action["id"]], {"code": code.replace(OLD, NEW)})
    print("patched action %s %r on %s" % (action["id"], action["name"], db))


if __name__ == "__main__":
    main()
