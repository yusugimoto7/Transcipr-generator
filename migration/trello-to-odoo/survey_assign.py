"""Survey task round-robin (automation "Survey", action 771/770, Trello era).

The call-centre rotation hard-codes users 21 and 30. Both accounts are
archived, so every new Survey task was assigned to them and Odoo's
"You have been assigned" e-mail bounced back to legal@. This makes the
rotation skip archived users; with nobody active left the task is created
unassigned.

Run:  PYTHONPATH=. python survey_assign.py
"""
import logging
import os
import re

from dotenv import load_dotenv

from odoo_client import Odoo

log = logging.getLogger(__name__)

OLD = "call_center_users = [21, 30]"
NEW = ("call_center_users = env['res.users'].sudo().browse([21, 30]).filtered('active').ids  "
       "# archived users are skipped")


def install(odoo):
    for act in odoo.search_read("ir.actions.server", [("code", "ilike", "call_center_users")], ["id", "name", "code"]):
        if "filtered('active')" in act["code"]:
            continue  # already applied
        code = act["code"].replace(OLD, NEW)
        # No active call-centre user: create the task unassigned instead of failing.
        code = code.replace("next_user = call_center_users[(index + 1) % len(call_center_users)]",
                            "next_user = call_center_users[(index + 1) % len(call_center_users)] if call_center_users else False")
        code = code.replace("next_assigned_index = (last_assigned_index + 1) % len(call_center_users)\n"
                            "        next_assigned_user = call_center_users[next_assigned_index]",
                            "next_assigned_user = call_center_users[(last_assigned_index + 1) % len(call_center_users)] if call_center_users else False")
        code = code.replace("'user_ids': [(6, 0, [next_user])]", "'user_ids': [(6, 0, [next_user] if next_user else [])]")
        code = code.replace("'user_ids': [(6, 0, [next_assigned_user])]",
                            "'user_ids': [(6, 0, [next_assigned_user] if next_assigned_user else [])]")
        code = code.replace("set_param('last_assigned_user', str(next_user))", "set_param('last_assigned_user', str(next_user or ''))")
        code = code.replace("set_param('last_assigned_user', str(next_assigned_user))",
                            "set_param('last_assigned_user', str(next_assigned_user or ''))")
        # .index() raised ValueError once the last user left the list, and
        # safe_eval has no ValueError name for the except clause.
        code = re.sub(r"( *)try:\n\s*index = call_center_users\.index\(int\(last_user\)\) if last_user else -1\n"
                      r"\s*except ValueError:\n\s*index = -1",
                      lambda m: m.group(1) + "index = call_center_users.index(int(last_user)) if last_user and "
                                             "last_user.isdigit() and int(last_user) in call_center_users else -1", code)
        odoo.write("ir.actions.server", [act["id"]], {"code": code})
        log.info("  %s (%d): rotation skips archived users", act["name"], act["id"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    load_dotenv(".env")
    o = Odoo(os.environ["ODOO_URL"], os.environ["ODOO_DB"], os.environ["ODOO_USERNAME"], os.environ["ODOO_PASSWORD"])
    o.login()
    install(o)
