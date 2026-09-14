"""Stage 22 routing: the Execution team field picks the project.

Server action 941 (fired by automation 64 when a lead reaches
"22- Sent to Execution Team") used to route only on Contract Type, through a
hard-coded map, and ignored the "Execution team" field (x_case_type) that the
team actually fills in on the card.  Two consequences:

  * a card saying "Visa - TR" produced a task in Admission, because its
    contract type was CA-SP;
  * twelve contract types could not reach stage 22 at all, because the map was
    keyed on the dropdown *labels* ('CA-Visitor Record', 'Resubmit-WP', ...)
    while Odoo stores the technical values ('CA-VR', 'RE-WP', ...).

This patches the action in place:

  1. Execution team decides the project; Contract Type is only the fallback
     when the field is left empty.
  2. The fallback map is keyed on the stored values (the old label keys are
     kept as well, so nothing that used to work stops working).
  3. A task that already exists for the lead in the wrong project is moved
     instead of being silently skipped, so correcting the field and dragging
     the card back into stage 22 actually re-routes it.

Run:  PYTHONPATH=. .venv/bin/python fix_execution_routing.py [test|prod]
"""
import os
import sys

from dotenv import load_dotenv

from odoo_client import Odoo

# The action is found by its code marker: the two databases do not share ids.
CODE_MARKER = "CRM Stage 22 -> Execution Project + Agreements"

# --- 1) what replaces sections 1 to 3 (routing) -----------------------------

OLD_ROUTING_HEAD = """# ------------------------------------------------------------
# 1) Contract Type
# ------------------------------------------------------------
contract_type = record.x_studio_contract_type_1 or ''

if not contract_type or contract_type == 'Not Decided':
    raise UserError('لطفاً نوع قرارداد را انتخاب کنید.')
"""

NEW_ROUTING = """# ------------------------------------------------------------
# 1) Execution team decides the project.
#    Contract Type is only the fallback when the field is empty.
# ------------------------------------------------------------
contract_type = (record.x_studio_contract_type_1 or '').strip()
if contract_type == 'Not Decided':
    contract_type = ''

case_type = record.x_case_type or ''
execution_project = False

if case_type:
    team_field = env['ir.model.fields'].sudo().search([
        ('model', '=', 'crm.lead'),
        ('name', '=', 'x_case_type'),
    ], limit=1)

    team_item = env['ir.model.fields.selection'].sudo().search([
        ('field_id', '=', team_field.id),
        ('value', '=', case_type),
    ], limit=1)

    team_name = team_item.name if team_item else ''

    if team_name:
        execution_project = env['project.project'].sudo().search([
            ('name', '=', team_name),
        ], limit=1)

    # The selection values are the project ids, so fall back to the id.
    if not execution_project and case_type.isdigit():
        execution_project = env['project.project'].sudo().browse(
            int(case_type)).exists()

    if not execution_project:
        raise UserError(
            'پروژه اجرایی «%s» پیدا نشد.' % (team_name or case_type)
        )

# ------------------------------------------------------------
# 2) Fallback: Contract Type -> Execution Project.
#    Keys are the values Odoo stores, not the dropdown labels.
# ------------------------------------------------------------
if not execution_project:
    if not contract_type:
        raise UserError(
            'لطفاً تیم اجرایی (Execution team) یا نوع قرارداد را انتخاب کنید.'
        )

    project_map = {
        'CA-SUV': 'SUV-Biz-Team',
        'CA-SP': 'Admission',

        'CA-TRV': 'Visa - TR',
        'CA-Business TRV': 'Visa - TR',
        'CA-VR': 'Visa - TR',
        'CA-WP': 'Visa - TR',
        'CA-Iranian WP': 'Visa - TR',

        'CA-Caregiver': 'Visa - PR',
        'CA-Express Entry': 'Visa - PR',
        'CA-PNP': 'Visa - PR',
        'CA-PNPEXP': 'Visa - PR',

        'CA-JRC': 'Visa - TR',
        'CA-MC': 'Visa - TR',

        'CA-ICT': 'SUV-Biz-Team',
        'CA-IMP': 'SUV-Biz-Team',

        'EU-SUV': 'SUV-Biz-Team',
        'EU-SP': 'Admission',
        'EU-DN': 'Visa - PR',
        'EU-BC': 'Visa - TR',
        'EU-ASB': 'Admission',

        'RE-WP': 'Visa - TR',
        'RE-TRV': 'Visa - TR',
        'RE-SP': 'Visa - TR',

        # The old label keys, kept so nothing that used to work stops working.
        'CA-Visitor Record': 'Visa - TR',
        'CA-PNP / Express Entry': 'Visa - PR',
        'CA-JR Court': 'Visa - TR',
        'CA-Mandamus Court': 'Visa - TR',
        'EU-SP / Language Course': 'Admission',
        'EU-Digital Nomad': 'Visa - PR',
        'EU-Blue Card': 'Visa - TR',
        'EU-Ausbildung': 'Admission',
        'Resubmit-WP': 'Visa - TR',
        'Resubmit-TRV': 'Visa - TR',
        'Resubmit-SP': 'Visa - TR',
    }

    execution_project_name = project_map.get(contract_type)

    if not execution_project_name:
        raise UserError(
            'برای نوع قرارداد "%s" پروژه اجرایی تعریف نشده است. '
            'لطفاً تیم اجرایی (Execution team) را انتخاب کنید.'
            % contract_type
        )

    execution_project = env['project.project'].sudo().search([
        ('name', '=', execution_project_name),
    ], limit=1)

    if not execution_project:
        raise UserError(
            'Project "%s" پیدا نشد.'
            % execution_project_name
        )
"""

# --- 2) the Contract tag must not be built from an empty contract type ------

OLD_TAG = """contract_tag_name = 'Contract: %s' % contract_type

contract_tag = env['project.tags'].sudo().search([
    ('name', '=', contract_tag_name),
], limit=1)

if not contract_tag:
    contract_tag = env['project.tags'].sudo().create({
        'name': contract_tag_name,
    })

tag_ids.append(contract_tag.id)
"""

NEW_TAG = """if contract_type:
    contract_tag_name = 'Contract: %s' % contract_type

    contract_tag = env['project.tags'].sudo().search([
        ('name', '=', contract_tag_name),
    ], limit=1)

    if not contract_tag:
        contract_tag = env['project.tags'].sudo().create({
            'name': contract_tag_name,
        })

    tag_ids.append(contract_tag.id)
"""

# --- 3) an existing task in the wrong project is moved, not skipped ---------

OLD_EXEC_TASK = """existing_execution_task = env['project.task'].sudo().search([
    ('project_id', '=', execution_project.id),
    ('description', 'ilike', crm_marker),
], limit=1)

# ------------------------------------------------------------
# 15) ساخت Task در Execution Project
# ------------------------------------------------------------
if not existing_execution_task:
    env['project.task'].sudo().create({
        'name': record.name,
        'project_id': execution_project.id,
        'description': execution_description,
        'partner_id': record.partner_id.id if record.partner_id else False,
        'tag_ids': [(6, 0, tag_ids)],
    })
"""

NEW_EXEC_TASK = """# "Agreements" can be picked as the Execution team; the section below already
# creates that task, so there is no separate execution task to make.
create_execution_task = execution_project.id != agreements_project.id

existing_execution_task = env['project.task'].sudo().search([
    ('description', 'ilike', crm_marker),
    ('project_id', '!=', agreements_project.id),
], limit=1) if create_execution_task else False

# ------------------------------------------------------------
# 15) ساخت Task در Execution Project
#     اگر Task قبلاً در پروژه اشتباه ساخته شده، منتقل می‌شود
# ------------------------------------------------------------
if not create_execution_task:
    pass
elif not existing_execution_task:
    env['project.task'].sudo().create({
        'name': record.name,
        'project_id': execution_project.id,
        'description': execution_description,
        'partner_id': record.partner_id.id if record.partner_id else False,
        'tag_ids': [(6, 0, tag_ids)],
    })
elif existing_execution_task.project_id.id != execution_project.id:
    previous_project_name = existing_execution_task.project_id.name
    existing_execution_task.sudo().write({
        'project_id': execution_project.id,
        'tag_ids': [(6, 0, tag_ids)],
    })
    existing_execution_task.sudo().message_post(
        body='Moved from "%s" to "%s" to match the Execution team on %s.'
        % (previous_project_name, execution_project.name, record.name or '')
    )
"""

PATCHES = [
    ("routing", OLD_ROUTING_HEAD, NEW_ROUTING),
    ("contract tag", OLD_TAG, NEW_TAG),
    ("execution task", OLD_EXEC_TASK, NEW_EXEC_TASK),
]


def main():
    load_dotenv(".env")
    which = sys.argv[1] if len(sys.argv) > 1 else "test"
    db = os.environ["ODOO_DB"] if which == "prod" else "test"
    pw = os.environ["ODOO_PASSWORD"] if which == "prod" else os.environ["ODOO_PASSWORD__TEST"]

    odoo = Odoo(os.environ["ODOO_URL"], db, os.environ["ODOO_USERNAME"], pw)
    odoo.login()

    candidates = [
        a for a in odoo.search_read(
            "ir.actions.server",
            [("model_id.model", "=", "crm.lead"), ("state", "=", "code")],
            ["name", "code"])
        if CODE_MARKER in (a["code"] or "")
    ]
    if len(candidates) != 1:
        sys.exit("expected one stage-22 routing action on %s, found %d"
                 % (db, len(candidates)))
    action = candidates[0]
    action_id = action["id"]
    code = action["code"]
    print("patching server action %s %r on %s" % (action_id, action["name"], db))

    # The old map ran from "# 2) Mapping" to the end of the section-3 lookup;
    # the new routing block replaces all of it.
    start = code.index(OLD_ROUTING_HEAD)
    end = code.index("# ------------------------------------------------------------\n# 4) ")
    body = code[start:end]

    if NEW_ROUTING in code:
        print("routing        already patched")
    elif OLD_ROUTING_HEAD in body:
        code = code[:start] + NEW_ROUTING + "\n" + code[end:]
        print("routing        patched")
    else:
        sys.exit("routing block does not look like the original; patch by hand")

    for label, old, new in PATCHES[1:]:
        if new in code:
            print("%-14s already patched" % label)
        elif old in code:
            code = code.replace(old, new)
            print("%-14s patched" % label)
        else:
            sys.exit("could not find the %s block; patch by hand" % label)

    odoo.execute("ir.actions.server", "write", [action_id], {"code": code})
    print("server action %s updated on %s" % (action_id, db))


if __name__ == "__main__":
    main()
