"""Phase 2: contracts as quotations, installed without touching CRM.

Three commands, in order:

  phase2 plan      read-only: lists the Contract Type options found on the
                   CRM lead, checks the Sales app, writes products.json for
                   you to fill in prices.
  phase2 install   creates the service products and quotation templates,
                   turns on online signature for quotations, and installs
                   the CRM automations SWITCHED OFF. CRM behaviour does not
                   change. Safe to rerun; updates in place.
  phase2 activate  switches the automations on. Run only after checking.

Everything is stamped with external ids like the rest of the migration.
"""

import json
import logging
import pathlib

from odoo_client import OdooError

log = logging.getLogger(__name__)

HERE = pathlib.Path(__file__).resolve().parent
PRODUCTS = HERE / "products.json"

# Server action: a confirmed (signed) quotation moves its opportunity to the
# payment stage and logs what was signed. Nothing else is touched.
SIGNED_ACTION_CODE = """
stage = env['crm.stage'].sudo().search([('name', 'ilike', '%(stage_needle)s')], limit=1)
for order in records:
    lead = order.opportunity_id
    if not lead:
        continue
    body = ('<p>Quotation <strong>%%s</strong> signed: %%s, %%s %%s</p>' %% (
        order.name,
        ', '.join(order.order_line.mapped('product_id.name')),
        order.currency_id.symbol, order.amount_total))
    lead.sudo().message_post(body=body, message_type='comment',
                             subtype_xmlid='mail.mt_note')
    if stage and lead.stage_id != stage:
        lead.sudo().write({'stage_id': stage.id})
""".strip()


def _model_exists(odoo, model):
    return bool(odoo.search_read("ir.model", [("model", "=", model)], ["id"], limit=1))


def _model_id(odoo, model):
    rows = odoo.search_read("ir.model", [("model", "=", model)], ["id"], limit=1)
    if not rows:
        raise OdooError(f"model {model} not found")
    return rows[0]["id"]


def contract_types(odoo):
    """The options of the lead's Contract Type dropdown, as [(value, label)]."""
    fields = odoo.search_read(
        "ir.model.fields",
        [("model", "=", "crm.lead"), ("ttype", "=", "selection"),
         ("field_description", "ilike", "contract type")],
        ["name", "field_description"],
    )
    if not fields:
        return None, []
    meta = odoo.execute("crm.lead", "fields_get", [fields[0]["name"]], attributes=["selection"])
    return fields[0]["name"], meta[fields[0]["name"]].get("selection") or []


# ---------------------------------------------------------------------------


def plan(odoo):
    print()
    field, options = contract_types(odoo)
    if field:
        print(f"Contract Type dropdown on the lead ({field}) has {len(options)} options:")
        for value, label in options:
            print(f"  {value:<16} {label}")
    else:
        print("No 'Contract Type' dropdown found on the lead — products.json will start empty.")

    sales = _model_exists(odoo, "sale.order")
    templates = _model_exists(odoo, "sale.order.template")
    print()
    print(f"Sales app installed:        {'yes' if sales else 'NO — install Apps > Sales first'}")
    print(f"Quotation templates model:  {'yes' if templates else 'NO — Sales > Settings > Quotation Templates'}")
    company = odoo.search_read("res.company", [], ["name", "currency_id"], limit=1)[0]
    print(f"Company / currency:         {company['name']} / {company['currency_id'][1]}")
    existing = odoo.search_read("product.template", [("type", "=", "service"), ("sale_ok", "=", True)],
                                ["name", "list_price"])
    if existing:
        print(f"Existing sellable services: {len(existing)} "
              f"({', '.join(p['name'] for p in existing[:6])}{'…' if len(existing) > 6 else ''})")

    if PRODUCTS.exists():
        current = json.loads(PRODUCTS.read_text())
    else:
        current = {}
    for value, label in options:
        current.setdefault(value, {"name": label, "price": 0, "template": True})
    PRODUCTS.write_text(json.dumps(current, indent=2, ensure_ascii=False) + "\n")
    print()
    print(f"Wrote {PRODUCTS}. Fill in each price (company currency), adjust names, "
          "remove any type you do not sell, then run: phase2 install")


def install(odoo, stage_needle, currency_check=True):
    if not PRODUCTS.exists():
        raise OdooError("products.json not found — run `phase2 plan` and fill in prices first")
    products = json.loads(PRODUCTS.read_text())
    if not _model_exists(odoo, "sale.order"):
        raise OdooError("the Sales app is not installed (Apps > Sales)")
    has_templates = _model_exists(odoo, "sale.order.template")

    # 1. Service products, one per contract type.
    product_ids = {}
    for key, spec in products.items():
        if not spec.get("name"):
            continue
        vals = {
            "name": spec["name"],
            "default_code": key,
            "type": "service",
            "sale_ok": True,
            "purchase_ok": False,
            "list_price": float(spec.get("price") or 0),
            "invoice_policy": "order",
        }
        pid, created = odoo.upsert("p2prod", key, "product.template", vals)
        product_ids[key] = pid
        log.info("  product %-16s %s  (%s)", key, spec["name"], "created" if created else "updated")
        if not spec.get("price"):
            log.warning("    price is 0 for %s — set it in products.json and rerun", key)

    # 2. One quotation template per contract type: the product, signature
    #    required, no online payment (books stay in QuickBooks).
    if has_templates:
        for key, spec in products.items():
            if key not in product_ids or not spec.get("template", True):
                continue
            variant = odoo.search_read("product.product",
                                       [("product_tmpl_id", "=", product_ids[key])], ["id"], limit=1)
            if not variant:
                continue
            existing = odoo.ref("p2tmpl", key)
            vals = {
                "name": f"Contract – {spec['name']}",
                "require_signature": True,
                "require_payment": False,
                "number_of_days": 14,
            }
            if not existing:
                vals["sale_order_template_line_ids"] = [(0, 0, {
                    "product_id": variant[0]["id"],
                    "product_uom_qty": 1,
                    "name": spec["name"],
                })]
            _, created = odoo.upsert("p2tmpl", key, "sale.order.template", vals)
            log.info("  quotation template for %s %s", key, "created" if created else "updated")
    else:
        log.warning("Quotation templates are not enabled: Sales > Configuration > Settings > "
                    "'Quotation Templates'. Products were created; rerun after enabling.")

    # 3. Online signature on, online payment off — company-level setting.
    company = odoo.search_read("res.company", [], ["id"], limit=1)[0]
    try:
        odoo.write("res.company", [company["id"]],
                   {"portal_confirmation_sign": True, "portal_confirmation_pay": False})
        log.info("  online signature ON, online payment OFF (quotations)")
    except OdooError as exc:
        log.warning("  could not set the signature setting (%s) — turn on Sales > Settings > "
                    "Online Signature by hand", str(exc).strip().splitlines()[-1])

    # 4. The CRM-facing automation, installed SWITCHED OFF.
    action_vals = {
        "name": "Quotation signed -> move opportunity to payment stage",
        "model_id": _model_id(odoo, "sale.order"),
        "state": "code",
        "code": SIGNED_ACTION_CODE % {"stage_needle": stage_needle.replace("'", "")},
    }
    action_id = odoo.ref("p2action", "signed")
    if action_id:
        odoo.write("ir.actions.server", [action_id], action_vals)
    else:
        action_id, _ = odoo.upsert("p2action", "signed", "ir.actions.server", action_vals)

    state_field = odoo.search_read("ir.model.fields",
                                   [("model", "=", "sale.order"), ("name", "=", "state")],
                                   ["id"], limit=1)[0]["id"]
    auto_vals = {
        "name": "Phase 2: quotation signed -> opportunity to payment stage",
        "model_id": _model_id(odoo, "sale.order"),
        "trigger": "on_create_or_write",
        "trigger_field_ids": [(6, 0, [state_field])],
        "filter_domain": "[('state', '=', 'sale'), ('opportunity_id', '!=', False)]",
        "active": False,
    }
    if odoo.has_field("base.automation", "action_server_ids"):
        auto_vals["action_server_ids"] = [(6, 0, [action_id])]
    else:
        auto_vals.update({"state": "code", "code": action_vals["code"]})
    auto_id = odoo.ref("p2auto", "signed")
    if auto_id:
        odoo.write("base.automation", [auto_id], {k: v for k, v in auto_vals.items()
                                                  if k != "active"})
    else:
        odoo.upsert("p2auto", "signed", "base.automation", auto_vals)
    log.info("  automation installed and SWITCHED OFF (run `phase2 activate` after checking)")
    return product_ids


def set_active(odoo, active):
    auto_id = odoo.ref("p2auto", "signed")
    if not auto_id:
        raise OdooError("phase 2 automation not installed yet — run `phase2 install` first")
    odoo.write("base.automation", [auto_id], {"active": active})
    log.info("automation %s", "ACTIVE" if active else "switched off")
