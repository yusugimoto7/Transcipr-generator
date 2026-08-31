"""Trello custom fields -> Odoo manual fields on project.task.

Trello boards used as case trackers carry most of their real data in custom
fields, not in the card description. Odoo has no equivalent out of the box, so
this module creates *manual* fields (``ir.model.fields`` with state='manual')
on project.task — the same mechanism Studio uses, but available on Community
too — and adds them to the task form through one inherited view.

Field values are also written into the task description as a table, so the data
is readable even if field creation is skipped or the inherited view is removed.
"""

import hashlib
import logging
import re

from odoo_client import MODULE, OdooError

log = logging.getLogger(__name__)

TASK_MODEL = "project.task"
VIEW_KEY = "view_task_form_trello"

# Trello custom field type -> Odoo field type.
# Trello's "list" (dropdown) becomes a char holding the chosen option's text:
# manual selection fields need version-specific selection_ids plumbing, and a
# free-text copy survives someone renaming an option later.
TYPES = {"text": "char", "number": "float", "date": "date", "checkbox": "boolean", "list": "char"}


def base_field_name(label):
    """Odoo-safe manual field name derived from a Trello field label.

    Labels that differ only in punctuation or case ("Email Address:" and
    "Email Address") collapse to the same name on purpose — the same field
    defined separately on five boards should be one Odoo field, not five.

    Non-Latin labels (Persian board fields) produce no usable ASCII slug; a
    hash of the label keeps distinct labels distinct instead of collapsing
    every one of them onto a single "field" name.
    """
    text = (label or "").strip()
    slug = re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")
    if len(slug) < 2:
        slug = "f_" + hashlib.md5(text.encode()).hexdigest()[:10]
    return f"x_trello_{slug}"[:60].rstrip("_")


def unique_name(base, taken):
    """A free variant of base, for a label reused with a different type."""
    if base not in taken:
        return base
    for suffix in range(2, 100):
        candidate = f"{base[:57]}_{suffix}"
        if candidate not in taken:
            return candidate
    raise RuntimeError(f"cannot find a free field name for {base}")


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
        return normalize_date((raw.get("date") or "").split("T")[0]) or None
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

    def existing_fields(self):
        """Migration-created fields already on project.task.

        Returns (by_name, by_label): the second index lets a Trello field
        reuse an existing Odoo field whose stored label matches even when the
        name was minted under an older naming scheme.
        """
        rows = self.odoo.search_read(
            "ir.model.fields",
            [("model", "=", TASK_MODEL), ("name", "like", "x_trello_")],
            ["name", "ttype", "field_description"],
        )
        by_name = {r["name"]: {"id": r["id"], "ttype": r["ttype"], "name": r["name"]}
                   for r in rows}
        by_label = {(base_field_name(r["field_description"]), r["ttype"]):
                    {"id": r["id"], "ttype": r["ttype"], "name": r["name"]} for r in rows}
        return by_name, by_label

    def ensure(self, definitions):
        """Create or reuse one manual field per distinct Trello field label.

        The same field ("Passport No.") defined separately on several boards
        maps onto a single Odoo field, so the task form stays readable and the
        data is comparable across projects. A label reused for a *different*
        type gets its own suffixed field rather than a type clash.
        """
        existing, by_label = self.existing_fields()
        created, shared = [], 0
        for definition in definitions:
            trello_id = definition["id"]
            if trello_id in self.by_trello_id:
                continue
            ttype = TYPES.get(definition.get("type"))
            if not ttype:
                log.warning("  custom field %r has unsupported type %r — skipped",
                            definition.get("name"), definition.get("type"))
                continue

            known = self.odoo.ref("cfield", trello_id)
            if known:
                rows = self.odoo.search_read("ir.model.fields", [("id", "=", known)], ["name"])
                if rows:
                    self.by_trello_id[trello_id] = (rows[0]["name"], definition)
                    continue

            base = base_field_name(definition.get("name"))
            match = existing.get(base) or by_label.get((base, ttype))
            if match and match["ttype"] == ttype:
                # Same label, same type: point this Trello field at the field
                # that already exists instead of making a near-duplicate.
                self.odoo.stamp("cfield", trello_id, "ir.model.fields", match["id"])
                self.by_trello_id[trello_id] = (match["name"], definition)
                shared += 1
                continue

            name = base if not match else unique_name(base, set(existing))
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
            existing[name] = {"id": field_id, "ttype": ttype, "name": name}
            by_label[(base, ttype)] = existing[name]
            self.by_trello_id[trello_id] = (name, definition)
            created.append((name, definition.get("name"), ttype))
            log.info("  created field %s (%s) for %r", name, ttype, definition.get("name"))
        if created:
            # New columns exist now; drop the cached field layout.
            self.odoo._field_cache.pop(TASK_MODEL, None)
        if shared:
            log.info("  reused %d existing fields for same-named Trello fields", shared)
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
        rebuild_view(self.odoo)


# ---------------------------------------------------------------------------
# Standalone maintenance: merge duplicate fields, rebuild the form view.


def _all_fields(odoo):
    return odoo.search_read(
        "ir.model.fields",
        [("model", "=", TASK_MODEL), ("name", "like", "x_trello_")],
        ["name", "field_description", "ttype"],
        order="id",
    )


def drop_view(odoo):
    """Remove the Trello data tab so field unlinks aren't blocked by the view."""
    view_id = odoo.ref("view", VIEW_KEY)
    if view_id:
        odoo.execute("ir.ui.view", "unlink", [view_id])
        stamps = odoo.search_read(
            "ir.model.data",
            [("module", "=", MODULE), ("name", "=", odoo.key("view", VIEW_KEY))],
            ["id"],
        )
        if stamps:
            odoo.execute("ir.model.data", "unlink", [s["id"] for s in stamps])


def rebuild_view(odoo):
    """(Re)create the Trello data tab from whatever x_trello_ fields exist.

    Each field is hidden when it holds no value, so a task shows only the
    handful of fields its board actually filled in, and the fields flow in
    two columns instead of one long single-column list.
    """
    rows = sorted(_all_fields(odoo), key=lambda r: (r["field_description"] or r["name"]).lower())
    if not rows:
        return
    def cell(r):
        return f'<field name="{r["name"]}" invisible="not {r["name"]}"/>'
    left = "".join(cell(r) for r in rows[0::2])
    right = "".join(cell(r) for r in rows[1::2])
    # The production task form is Studio-customized and dropped the stock
    # Description page, leaving the migrated card descriptions stored but
    # invisible. Re-add a Description page ahead of the Trello data tab.
    arch = (
        '<xpath expr="//notebook" position="inside">'
        '<page string="Description"><field name="description" nolabel="1"/></page>'
        '<page string="Trello data"><group>'
        f"<group>{left}</group><group>{right}</group>"
        "</group></page></xpath>"
    )
    parent_rows = odoo.search_read(
        "ir.model.data",
        [("module", "=", "project"), ("name", "in", ["view_task_form2", "view_task_form"]),
         ("model", "=", "ir.ui.view")],
        ["res_id"], limit=1,
    )
    if not parent_rows:
        parent_rows = odoo.search_read(
            "ir.ui.view",
            [("model", "=", TASK_MODEL), ("type", "=", "form"), ("inherit_id", "=", False)],
            ["id"], limit=1,
        )
        parent = parent_rows[0]["id"] if parent_rows else None
    else:
        parent = parent_rows[0]["res_id"]
    if not parent:
        log.warning("task form view not found; fields exist but the tab was not rebuilt")
        return
    vals = {
        "name": "project.task.form.trello",
        "model": TASK_MODEL,
        "inherit_id": parent,
        "arch_db": f"<data>{arch}</data>",
        "priority": 99,
    }
    view_id = odoo.ref("view", VIEW_KEY)
    if view_id:
        odoo.write("ir.ui.view", [view_id], {"arch_db": vals["arch_db"]})
    else:
        odoo.upsert("view", VIEW_KEY, "ir.ui.view", vals)
    log.info("Trello data tab rebuilt with %d fields (empty ones hidden per task)", len(rows))


_SHORT_YEAR = re.compile(r"^(\d{1,3})-(\d{2})-(\d{2})")


def normalize_date(value):
    """Zero-pad a short year: Odoo stores '975-09-16' but refuses to write it back."""
    if isinstance(value, str):
        match = _SHORT_YEAR.match(value)
        if match:
            return match.group(1).zfill(4) + value[match.end(1):]
    return value


def merge_duplicate_fields(odoo):
    """Collapse x_trello_name_2/_3... into one field per (label, type).

    Values move onto the surviving field, Trello-field stamps are repointed
    so future runs keep writing to the survivor, and the duplicate columns
    are dropped. A task whose survivor already holds a different value keeps
    it (each task came from one board, so this is rare) and the conflict is
    logged.
    """
    groups = {}
    for row in _all_fields(odoo):
        key = (base_field_name(row["field_description"]), row["ttype"])
        groups.setdefault(key, []).append(row)

    merged = conflicts = 0
    for (base, ttype), members in sorted(groups.items()):
        if len(members) < 2:
            continue
        # Prefer the member carrying the canonical name; else the oldest.
        members.sort(key=lambda r: (r["name"] != base, r["id"]))
        canon = members[0]
        for dup in members[1:]:
            tasks = odoo.search_read(
                TASK_MODEL, [(dup["name"], "!=", False)],
                ["id", dup["name"], canon["name"]],
                context={"active_test": False},
            )
            for task in tasks:
                value, kept = task[dup["name"]], task[canon["name"]]
                if ttype == "date":
                    value = normalize_date(value)
                if not kept:
                    # One bad value (a typo'd year Odoo stored but refuses to
                    # write back) must not abort the merge: the original value
                    # is still in the task description's Trello fields table.
                    try:
                        odoo.write(TASK_MODEL, [task["id"]], {canon["name"]: value})
                    except OdooError as exc:
                        conflicts += 1
                        log.warning("  task %s: could not move %r=%r (%s) — value stays "
                                    "in the task description only",
                                    task["id"], canon["name"], value,
                                    str(exc).strip().splitlines()[-1])
                elif kept != value:
                    conflicts += 1
                    log.warning("  task %s: %r keeps %r, dropping duplicate value %r",
                                task["id"], canon["name"], kept, value)
            stamps = odoo.search_read(
                "ir.model.data",
                [("module", "=", MODULE), ("model", "=", "ir.model.fields"),
                 ("res_id", "=", dup["id"])],
                ["id"],
            )
            if stamps:
                odoo.write("ir.model.data", [s["id"] for s in stamps], {"res_id": canon["id"]})
            odoo.execute("ir.model.fields", "unlink", [dup["id"]])
            merged += 1
            log.info("  merged %s (%r) -> %s, %d task values moved",
                     dup["name"], dup["field_description"], canon["name"], len(tasks))
    if conflicts:
        log.warning("%d value conflicts kept the surviving field's value", conflicts)
    return merged
