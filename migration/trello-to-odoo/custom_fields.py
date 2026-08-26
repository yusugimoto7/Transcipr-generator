"""Trello custom fields -> Odoo manual fields on project.task.

Trello boards used as case trackers carry most of their real data in custom
fields, not in the card description. Odoo has no equivalent out of the box, so
this module creates *manual* fields (``ir.model.fields`` with state='manual')
on project.task — the same mechanism Studio uses, but available on Community
too — and adds them to the task form through one inherited view.

Field values are also written into the task description as a table, so the data
is readable even if field creation is skipped or the inherited view is removed.
"""

import logging
import re

log = logging.getLogger(__name__)

TASK_MODEL = "project.task"
VIEW_KEY = "view_task_form_trello"

# Trello custom field type -> Odoo field type.
# Trello's "list" (dropdown) becomes a char holding the chosen option's text:
# manual selection fields need version-specific selection_ids plumbing, and a
# free-text copy survives someone renaming an option later.
TYPES = {"text": "char", "number": "float", "date": "date", "checkbox": "boolean", "list": "char"}


def field_name(label, taken):
    """Odoo-safe manual field name derived from a Trello field label."""
    slug = re.sub(r"[^a-z0-9]+", "_", (label or "").lower()).strip("_") or "field"
    name = f"x_trello_{slug}"[:60].rstrip("_")
    if name in taken:
        for suffix in range(2, 100):
            candidate = f"{name[:57]}_{suffix}"
            if candidate not in taken:
                name = candidate
                break
    taken.add(name)
    return name


def value_of(item, definition):
    """Python value for one card's custom field item, or None if unset."""
    kind = definition.get("type")
    if kind == "list":
        option_id = item.get("idValue")
        for option in definition.get("options") or []:
            if option.get("id") == option_id:
                return (option.get("value") or {}).get("text")
        return None

    raw = item.get("value") or {}
    if kind == "checkbox":
        return str(raw.get("checked", "")).lower() == "true"
    if kind == "number":
        try:
            return float(raw.get("number"))
        except (TypeError, ValueError):
            return None
    if kind == "date":
        return (raw.get("date") or "")[:10] or None
    text = raw.get("text")
    return text if text not in ("", None) else None


class CustomFieldSync:
    """Creates and caches the Odoo manual fields backing Trello custom fields."""

    def __init__(self, odoo):
        self.odoo = odoo
        self.by_trello_id = {}   # trello field id -> (odoo field name, trello definition)
        self._model_id = None

    def model_id(self):
        if self._model_id is None:
            rows = self.odoo.search_read("ir.model", [("model", "=", TASK_MODEL)], ["id"], limit=1)
            if not rows:
                raise RuntimeError("project.task model not found — is the Project app installed?")
            self._model_id = rows[0]["id"]
        return self._model_id

    def existing_names(self):
        rows = self.odoo.search_read(
            "ir.model.fields",
            [("model", "=", TASK_MODEL), ("name", "like", "x_trello_")],
            ["name"],
        )
        return {r["name"] for r in rows}

    def ensure(self, definitions):
        """Create a manual field per Trello custom field. Returns names created."""
        taken = self.existing_names()
        created = []
        for definition in definitions:
            trello_id = definition["id"]
            if trello_id in self.by_trello_id:
                continue
            ttype = TYPES.get(definition.get("type"))
            if not ttype:
                log.warning("  custom field %r has unsupported type %r — skipped",
                            definition.get("name"), definition.get("type"))
                continue

            existing_id = self.odoo.ref("cfield", trello_id)
            if existing_id:
                rows = self.odoo.search_read("ir.model.fields", [("id", "=", existing_id)], ["name"])
                if rows:
                    self.by_trello_id[trello_id] = (rows[0]["name"], definition)
                    continue

            name = field_name(definition.get("name"), taken)
            field_id, _ = self.odoo.upsert(
                "cfield", trello_id, "ir.model.fields",
                {
                    "name": name,
                    "field_description": definition.get("name") or name,
                    "model_id": self.model_id(),
                    "model": TASK_MODEL,
                    "ttype": ttype,
                    "state": "manual",
                    "store": True,
                },
                update=False,
            )
            self.by_trello_id[trello_id] = (name, definition)
            created.append((name, definition.get("name"), ttype))
            log.info("  created field %s (%s) for %r", name, ttype, definition.get("name"))
        if created:
            # New columns exist now; drop the cached field layout.
            self.odoo._field_cache.pop(TASK_MODEL, None)
        return created

    def values(self, card):
        """{odoo_field_name: value} for one card, skipping unset fields."""
        out = {}
        for item in card.get("customFieldItems") or []:
            mapped = self.by_trello_id.get(item.get("idCustomField"))
            if not mapped:
                continue
            name, definition = mapped
            value = value_of(item, definition)
            if value is not None and value is not False:
                out[name] = value
        return out

    def labelled(self, card):
        """[(label, display value)] for one card, for the description table."""
        rows = []
        for item in card.get("customFieldItems") or []:
            mapped = self.by_trello_id.get(item.get("idCustomField"))
            if not mapped:
                continue
            name, definition = mapped
            value = value_of(item, definition)
            if value is None or value == "":
                continue
            if isinstance(value, bool):
                value = "Yes" if value else "No"
            rows.append((definition.get("name") or name, str(value)))
        return rows

    def install_view(self):
        """Add the created fields to the task form via one inherited view."""
        names = sorted(name for name, _ in self.by_trello_id.values())
        if not names:
            return
        parent = self._parent_form_view()
        if not parent:
            log.warning("Could not find the task form view; fields exist but were not added to "
                        "the form. Add them as optional columns, or via Studio.")
            return
        fields_xml = "".join(f'<field name="{n}"/>' for n in names)
        arch = (
            '<xpath expr="//notebook" position="inside">'
            f'<page string="Trello data"><group>{fields_xml}</group></page>'
            "</xpath>"
        )
        vals = {
            "name": "project.task.form.trello",
            "model": TASK_MODEL,
            "inherit_id": parent,
            "arch_db": f"<data>{arch}</data>",
            "priority": 99,
        }
        try:
            view_id = self.odoo.ref("view", VIEW_KEY)
            if view_id:
                self.odoo.write("ir.ui.view", [view_id], {"arch_db": vals["arch_db"]})
            else:
                self.odoo.upsert("view", VIEW_KEY, "ir.ui.view", vals)
            log.info("  task form now shows a 'Trello data' tab with %d fields", len(names))
        except Exception as exc:
            log.warning("  could not extend the task form view (%s). The fields still exist "
                        "and hold their data; add them to the form manually if needed.", exc)

    def _parent_form_view(self):
        for module, name in (("project", "view_task_form2"), ("project", "view_task_form")):
            rows = self.odoo.search_read(
                "ir.model.data",
                [("module", "=", module), ("name", "=", name), ("model", "=", "ir.ui.view")],
                ["res_id"], limit=1,
            )
            if rows:
                return rows[0]["res_id"]
        rows = self.odoo.search_read(
            "ir.ui.view",
            [("model", "=", TASK_MODEL), ("type", "=", "form"), ("inherit_id", "=", False)],
            ["id"], limit=1,
        )
        return rows[0]["id"] if rows else None
