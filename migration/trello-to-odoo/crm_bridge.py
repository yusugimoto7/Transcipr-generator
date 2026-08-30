"""CRM -> Project bridge.

Installs, via the external API:

- a "Case Type" selection field on the CRM lead, listing the migrated
  projects;
- an automation on the CRM pipeline: when a lead moves into the trigger
  stage, a task is created in the chosen project (client name, contact
  details, and a link back to the lead in the description). Moving a lead
  there without a Case Type is blocked with a clear message;
- a hidden marker field on tasks so the same lead never creates two tasks.

Everything is stamped with external ids, so rerunning updates in place.
"""

import logging

from odoo_client import MODULE, OdooError

log = logging.getLogger(__name__)

LEAD = "crm.lead"
FIELD = "x_case_type"
MARKER = "x_crm_lead_id"

SERVER_ACTION_CODE = """
for record in records:
    if not record.x_case_type:
        raise UserError(
            "Set 'Case Type' on this lead before moving it to this stage, "
            "so the task is created in the right project."
        )
    project_id = int(record.x_case_type)
    Task = env['project.task'].sudo()
    if not Task.search_count([('x_crm_lead_id', '=', record.id)]):
        parts = []
        if record.contact_name or record.partner_id:
            parts.append('<p><strong>Client:</strong> %s</p>' %
                         (record.contact_name or record.partner_id.display_name))
        if record.phone:
            parts.append('<p><strong>Phone:</strong> %s</p>' % record.phone)
        if record.email_from:
            parts.append('<p><strong>Email:</strong> %s</p>' % record.email_from)
        parts.append('<p><a href="/odoo/crm/%d">Original CRM opportunity</a></p>' % record.id)
        Task.create({
            'name': record.name,
            'project_id': project_id,
            'partner_id': record.partner_id.id or False,
            'description': ''.join(parts),
            'x_crm_lead_id': record.id,
        })
""".strip()


def _model_id(odoo, model):
    rows = odoo.search_read("ir.model", [("model", "=", model)], ["id"], limit=1)
    if not rows:
        raise OdooError(f"model {model} not found — is the app installed?")
    return rows[0]["id"]


def _field_id(odoo, model, name):
    rows = odoo.search_read(
        "ir.model.fields", [("model", "=", model), ("name", "=", name)], ["id"], limit=1
    )
    return rows[0]["id"] if rows else None


def find_stage(odoo, needle):
    rows = odoo.search_read("crm.stage", [("name", "ilike", needle)], ["id", "name"])
    if not rows:
        all_stages = odoo.search_read("crm.stage", [], ["name"])
        raise OdooError(
            f"no CRM stage matches {needle!r}. Stages found: "
            + ", ".join(s["name"] for s in all_stages)
        )
    if len(rows) > 1:
        log.warning("several stages match %r: %s — using %r",
                    needle, ", ".join(r["name"] for r in rows), rows[0]["name"])
    return rows[0]


def migrated_projects(odoo):
    """The projects this migration created, id -> name."""
    stamps = odoo.search_read(
        "ir.model.data",
        [("module", "=", MODULE), ("model", "=", "project.project")],
        ["res_id"],
    )
    ids = [s["res_id"] for s in stamps]
    if not ids:
        raise OdooError("no migrated projects found — run the migration first")
    rows = odoo.search_read("project.project", [("id", "in", ids)], ["id", "name"])
    return {r["id"]: r["name"] for r in rows}


def _install_lead_form_field(odoo):
    """Put Case Type on the lead form.

    Customized forms (Studio tabs and the like) may not contain the stock
    anchors, so several are tried in order; the first the server accepts
    wins.
    """
    # Not marked required on the form: that would block saving every lead,
    # including fresh ones. The requirement is enforced exactly where it
    # matters — the automation refuses the move to the trigger stage.
    field_tag = f'<field name="{FIELD}"/>'
    anchors = [
        ('//field[@name=\'tag_ids\']', "after"),
        ('//field[@name=\'expected_revenue\']', "after"),
        ('//field[@name=\'email_from\']', "after"),
        ('//group[1]', "inside"),
        ('//sheet', "inside"),
        ('//form/*[1]', "before"),
    ]
    parents = odoo.search_read(
        "ir.ui.view",
        [("model", "=", LEAD), ("type", "=", "form"), ("inherit_id", "=", False)],
        ["id", "name"],
    )
    if not parents:
        log.warning("no lead form view found — add the Case Type field to the form by hand")
        return

    view_id = odoo.ref("crmview", "lead_case_type")
    for parent in parents:
        for xpath, position in anchors:
            arch = (f'<data><xpath expr="{xpath}" position="{position}">'
                    f"{field_tag}</xpath></data>")
            try:
                if view_id:
                    odoo.write("ir.ui.view", [view_id], {
                        "inherit_id": parent["id"], "arch_db": arch,
                    })
                else:
                    view_id, _ = odoo.upsert("crmview", "lead_case_type", "ir.ui.view", {
                        "name": "crm.lead.form.case.type", "model": LEAD,
                        "inherit_id": parent["id"], "arch_db": arch, "priority": 99,
                    })
                log.info("Case Type added to lead form %r at %s", parent["name"], xpath)
                return
            except OdooError as exc:
                log.debug("anchor %s on view %s rejected: %s", xpath, parent["name"], exc)
                continue
    log.warning("no anchor fit any lead form view — the field exists and the automation "
                "still blocks the stage move; add the field to the form via the UI "
                "(Settings > Technical > Views, or Studio)")


def install(odoo, stage_needle):
    stage = find_stage(odoo, stage_needle)
    projects = migrated_projects(odoo)
    log.info("Trigger stage: %r; projects offered: %s",
             stage["name"], ", ".join(projects.values()))

    # Case Type on the lead: one option per migrated project, stored as its id.
    selection = [(0, 0, {"value": str(pid), "name": name, "sequence": i * 10})
                 for i, (pid, name) in enumerate(sorted(projects.items(), key=lambda p: p[1]))]
    field_id = odoo.ref("crmfield", FIELD)
    if field_id:
        log.info("Case Type field already exists")
    else:
        field_id, _ = odoo.upsert(
            "crmfield", FIELD, "ir.model.fields",
            {
                "name": FIELD, "field_description": "Case Type",
                "model_id": _model_id(odoo, LEAD), "model": LEAD,
                "ttype": "selection", "state": "manual", "store": True,
                "selection_ids": selection,
            },
            update=False,
        )
        log.info("created Case Type field on the CRM lead")

    # Marker on tasks, so one lead never creates two tasks.
    if not odoo.ref("crmtaskfield", MARKER) and not _field_id(odoo, "project.task", MARKER):
        odoo.upsert(
            "crmtaskfield", MARKER, "ir.model.fields",
            {
                "name": MARKER, "field_description": "CRM Lead Id",
                "model_id": _model_id(odoo, "project.task"), "model": "project.task",
                "ttype": "integer", "state": "manual", "store": True,
            },
            update=False,
        )
        log.info("created the lead marker field on tasks")

    _install_lead_form_field(odoo)

    # Server action holding the logic.
    action_vals = {
        "name": "CRM: create project task on execution handoff",
        "model_id": _model_id(odoo, LEAD),
        "state": "code",
        "code": SERVER_ACTION_CODE,
    }
    action_id = odoo.ref("crmaction", "lead_to_task")
    if action_id:
        odoo.write("ir.actions.server", [action_id], action_vals)
    else:
        action_id, _ = odoo.upsert("crmaction", "lead_to_task", "ir.actions.server", action_vals)

    # The automation: fire when stage_id changes to the trigger stage.
    stage_field = _field_id(odoo, LEAD, "stage_id")
    auto_vals = {
        "name": f"Lead reaches {stage['name']!r} -> create project task",
        "model_id": _model_id(odoo, LEAD),
        "trigger": "on_create_or_write",
        "trigger_field_ids": [(6, 0, [stage_field])],
        "filter_domain": f"[('stage_id', '=', {stage['id']})]",
    }
    # Odoo 17 links automations to server actions; 16 and older embed the code.
    if odoo.has_field("base.automation", "action_server_ids"):
        auto_vals["action_server_ids"] = [(6, 0, [action_id])]
    else:
        auto_vals.update({"state": "code", "code": SERVER_ACTION_CODE})
    auto_id = odoo.ref("crmauto", "lead_to_task")
    if auto_id:
        odoo.write("base.automation", [auto_id], auto_vals)
    else:
        odoo.upsert("crmauto", "lead_to_task", "base.automation", auto_vals)
    log.info("automation installed on stage %r", stage["name"])
    return stage, projects
