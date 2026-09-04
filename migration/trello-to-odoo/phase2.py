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
    # mail.message.create keeps the HTML; message_post would escape a str body.
    env['mail.message'].sudo().create({
        'model': 'crm.lead', 'res_id': lead.id, 'body': body,
        'message_type': 'comment', 'subtype_id': env.ref('mail.mt_note').id,
        'author_id': env.user.partner_id.id,
    })
    if stage and lead.stage_id != stage:
        lead.sudo().write({'stage_id': stage.id})
""".strip()


# Server action: a quotation created from an opportunity that has a Service
# picked is pre-filled from that service's template — principal line at 1,
# add-ons and government fees at 0 for the salesperson to set, terms attached.
PREFILL_ACTION_CODE = """
for order in records:
    lead = order.opportunity_id
    tmpl = lead.x_service if lead else False
    if not tmpl or order.order_line:
        continue
    # Pricelist by the service's currency: EUR-tagged products -> EUR list.
    is_eur = any(t.name == 'EUR' for t in tmpl.sale_order_template_line_ids.mapped('product_id.product_tmpl_id.product_tag_ids'))
    cur = 'EUR' if is_eur else 'CAD'
    plist = (env['product.pricelist'].sudo().search([('currency_id.name', '=', cur), ('company_id', '=', False)], limit=1)
             or env['product.pricelist'].sudo().search([('currency_id.name', '=', cur), ('company_id', '=', order.company_id.id)], limit=1))
    if plist:
        order.write({'pricelist_id': plist.id})
    lines = []
    for line in tmpl.sale_order_template_line_ids:
        if line.product_id:
            lines.append((0, 0, {'product_id': line.product_id.id,
                                 'product_uom_qty': line.product_uom_qty or 1}))
    for opt in tmpl.sale_order_template_option_ids:
        lines.append((0, 0, {'product_id': opt.product_id.id, 'product_uom_qty': 0}))
    vals = {'order_line': lines, 'sale_order_template_id': tmpl.id,
            'require_signature': True, 'require_payment': False}
    if tmpl.note:
        vals['note'] = tmpl.note
    if lead.name:
        vals['client_order_ref'] = lead.name.split(' - ')[0].split(' – ')[0].strip()
    order.write(vals)
""".strip()

SERVICE_FIELD = "x_service"


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

    print()
    if PRODUCTS.exists():
        catalogue = json.loads(PRODUCTS.read_text(encoding="utf-8"))
        services = [k for k in catalogue if not k.startswith("_")]
        print(f"{PRODUCTS.name}: {len(services)} services, "
              f"{len(catalogue.get('_gov', {}))} government fees (from the Canada price list). "
              "Review prices there, then run: phase2 install")
    else:
        print(f"{PRODUCTS.name} missing — run build_catalogue.py to create it from the price list.")


def _enable_setting(odoo, field):
    """Tick one checkbox in Sales/Inventory settings (idempotent)."""
    sid = odoo.execute("res.config.settings", "create", {field: True})
    odoo.execute("res.config.settings", "execute", [sid])


def _ensure_pricelists(odoo):
    """One pricelist per selling currency, shared by both companies.

    Product list prices are in the company currency (CAD). EUR services get
    a fixed EUR price on the EUR pricelist, so no exchange-rate conversion
    ever touches a contract amount.
    """
    _enable_setting(odoo, "group_product_pricelist")
    _enable_setting(odoo, "group_sale_order_template")
    lists = {}
    for code in ("CAD", "EUR"):
        cur = odoo.search_read("res.currency", [("name", "=", code)], ["id", "active"],
                               context={"active_test": False})
        if not cur:
            raise OdooError(f"currency {code} does not exist in this database")
        if not cur[0]["active"]:
            odoo.write("res.currency", [cur[0]["id"]], {"active": True})
        lists[code], created = odoo.upsert("p2plist", code, "product.pricelist", {
            "name": code, "currency_id": cur[0]["id"], "company_id": False,
        })
        log.info("  pricelist %s %s", code, "created" if created else "ok")
    return lists


def _ensure_tag(odoo, name):
    tag_id, _ = odoo.upsert("p2tag", name, "product.tag", {"name": name})
    return tag_id


def install(odoo, stage_needle, currency_check=True):
    if not PRODUCTS.exists():
        raise OdooError("products.json not found — run `phase2 plan` and fill in prices first")
    products = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    if not _model_exists(odoo, "sale.order"):
        raise OdooError("the Sales app is not installed (Apps > Sales)")
    has_templates = _model_exists(odoo, "sale.order.template")
    pricelists = _ensure_pricelists(odoo)
    eur_tag = _ensure_tag(odoo, "EUR")

    def price_in(code, pid, currency, price):
        """Fixed price on the currency's pricelist; tag EUR products."""
        if currency == "EUR":
            odoo.write("product.template", [pid], {"product_tag_ids": [(4, eur_tag)]})
        odoo.upsert("p2pli", f"{currency}-{code}", "product.pricelist.item", {
            "pricelist_id": pricelists[currency], "applied_on": "1_product",
            "product_tmpl_id": pid, "compute_price": "fixed", "fixed_price": float(price or 0),
        })

    # 1. Products: shared government fees, then per service a principal
    #    product and one add-on product per priced component.
    def make_product(key, name, price, is_gov=False):
        vals = {
            "name": name, "default_code": key, "type": "service",
            "sale_ok": True, "purchase_ok": False, "invoice_policy": "order",
            "list_price": float(price or 0),
        }
        pid, created = odoo.upsert("p2prod", key, "product.template", vals)
        variant = odoo.search_read("product.product", [("product_tmpl_id", "=", pid)],
                                   ["id"], limit=1)
        return pid, variant[0]["id"] if variant else None, created

    gov_variants = {}
    for key, spec in products.get("_gov", {}).items():
        _, vid, created = make_product(key, spec["name"], spec["price"], is_gov=True)
        gov_variants[key] = vid
        log.info("  gov fee  %-10s %-55s %s", key, spec["name"][:55], "created" if created else "ok")

    product_ids, variants, addon_variants = {}, {}, {}
    for key, spec in products.items():
        if key.startswith("_") or not spec.get("name"):
            continue
        if spec.get("components"):
            # Combined contract (Sparkbridge + Sugimoto): one product per
            # component, each becomes its own quotation line.
            variants[key] = []
            for comp in spec["components"]:
                _, cvid, created = make_product(comp["code"], comp["name"], comp["price"])
                variants[key].append((cvid, comp["name"], comp["price"]))
                log.info("  component %-12s %-55s %s", comp["code"], comp["name"][:55],
                         "created" if created else "ok")
            product_ids[key] = None
        else:
            pid, vid, created = make_product(key, spec["name"], spec.get("price"))
            product_ids[key], variants[key] = pid, vid
            price_in(key, pid, spec.get("currency", "CAD"), spec.get("price"))
            log.info("  service  %-12s %-55s %s", key, spec["name"][:55], "created" if created else "ok")
            if not spec.get("price") and key != "CUSTOM":
                log.warning("    price is 0 for %s — set it in products.json", key)
        addon_variants[key] = []
        for i, (label, price) in enumerate(spec.get("addons", {}).items(), start=1):
            akey = f"{key}-A{i}"
            apid, avid, _ = make_product(akey, f"{spec['name'].split(' · ')[0]} – {label}", price)
            price_in(akey, apid, spec.get("currency", "CAD"), price)
            addon_variants[key].append((avid, label))

    # 2. One quotation template per service: the principal as the line,
    #    add-ons and government fees as optional products the salesperson
    #    ticks per family. Signature required, no online payment, payment
    #    terms from the price list as the template's terms.
    if has_templates:
        for key, spec in products.items():
            if key.startswith("_") or key not in variants or not spec.get("template", True):
                continue
            existing = odoo.ref("p2tmpl", key)
            vals = {
                "name": f"{key} · {spec['name']}",
                "require_signature": True,
                "require_payment": False,
                "number_of_days": 14,
                "note": spec.get("terms") or "",
            }
            if not existing:
                if isinstance(variants[key], list):
                    vals["sale_order_template_line_ids"] = [
                        (0, 0, {"product_id": v, "product_uom_qty": 1, "name": n})
                        for v, n, _ in variants[key]]
                else:
                    vals["sale_order_template_line_ids"] = [(0, 0, {
                        "product_id": variants[key], "product_uom_qty": 1,
                        "name": spec["name"],
                    })]
                options = [(0, 0, {"product_id": v, "quantity": 1, "name": label})
                           for v, label in addon_variants[key]]
                options += [(0, 0, {"product_id": gov_variants[g], "quantity": 1,
                                    "name": products["_gov"][g]["name"]})
                            for g in spec.get("gov", []) if g in gov_variants]
                if options and odoo.has_field("sale.order.template",
                                              "sale_order_template_option_ids"):
                    vals["sale_order_template_option_ids"] = options
            _, created = odoo.upsert("p2tmpl", key, "sale.order.template", vals)
            log.info("  template %-12s %s", key, "created" if created else "updated")
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
        state = odoo.search_read("base.automation", [("id", "=", auto_id)], ["active"],
                                 context={"active_test": False})[0]["active"]
        log.info("  automation updated, left %s", "ACTIVE" if state else "switched off")
    else:
        odoo.upsert("p2auto", "signed", "base.automation", auto_vals)
        log.info("  automation installed and SWITCHED OFF (run `phase2 activate` after checking)")
    return product_ids


def _install_service_dropdown(odoo):
    """The Service dropdown on the CRM card: a pick from the quotation templates."""
    field_id = odoo.ref("p2field", SERVICE_FIELD)
    if not field_id:
        field_id, _ = odoo.upsert(
            "p2field", SERVICE_FIELD, "ir.model.fields",
            {
                "name": SERVICE_FIELD, "field_description": "Service",
                "model_id": _model_id(odoo, "crm.lead"), "model": "crm.lead",
                "ttype": "many2one", "relation": "sale.order.template",
                "state": "manual", "store": True, "on_delete": "set null",
            },
            update=False,
        )
        log.info("  Service dropdown created on the CRM lead")

    # Place it right after Case Type when that exists, else after the tags.
    anchors = ["//field[@name='x_case_type']", "//field[@name='tag_ids']", "//sheet"]
    parents = odoo.search_read(
        "ir.ui.view",
        [("model", "=", "crm.lead"), ("type", "=", "form"), ("inherit_id", "=", False)],
        ["id", "name"],
    )
    view_id = odoo.ref("p2view", "lead_service")
    for parent in parents:
        for xpath in anchors:
            position = "inside" if xpath == "//sheet" else "after"
            arch = (f'<data><xpath expr="{xpath}" position="{position}">'
                    f'<field name="{SERVICE_FIELD}" options="{{\'no_create\': True}}"/>'
                    "</xpath></data>")
            try:
                if view_id:
                    odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch})
                else:
                    view_id, _ = odoo.upsert("p2view", "lead_service", "ir.ui.view", {
                        "name": "crm.lead.form.service", "model": "crm.lead",
                        "inherit_id": parent["id"], "arch_db": arch, "priority": 99,
                    })
                log.info("  Service dropdown placed on the lead form at %s", xpath)
                return
            except OdooError:
                continue
    log.warning("  could not place the Service dropdown on the lead form — add it via the UI")


def _install_quote_button(odoo):
    """Put Odoo's "New Quotation" button back on the lead form.

    Studio-customised lead forms often drop it; the button is what turns a
    card with a Service into a pre-filled quotation (it asks for the
    customer first when the card has none).
    """
    parents = odoo.search_read(
        "ir.ui.view",
        [("model", "=", "crm.lead"), ("type", "=", "form"), ("inherit_id", "=", False)],
        ["id"],
    )
    view_id = odoo.ref("p2view", "lead_quote_button")
    arch = ('<data><xpath expr="//header" position="inside">'
            '<button name="action_sale_quotations_new" type="object" string="New Quotation" '
            'class="btn-primary" invisible="not active"/>'
            "</xpath></data>")
    for parent in parents:
        try:
            if view_id:
                odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch})
            else:
                view_id, _ = odoo.upsert("p2view", "lead_quote_button", "ir.ui.view", {
                    "name": "crm.lead.form.new_quotation", "model": "crm.lead",
                    "inherit_id": parent["id"], "arch_db": arch, "priority": 99,
                })
            log.info("  New Quotation button placed on the lead form")
            return
        except OdooError:
            continue
    log.warning("  could not place the New Quotation button — add it via Studio")


def _install_prefill_automation(odoo):
    action_vals = {
        "name": "Quotation from opportunity -> pre-fill from the picked Service",
        "model_id": _model_id(odoo, "sale.order"),
        "state": "code",
        "code": PREFILL_ACTION_CODE,
    }
    action_id = odoo.ref("p2action", "prefill")
    if action_id:
        odoo.write("ir.actions.server", [action_id], action_vals)
    else:
        action_id, _ = odoo.upsert("p2action", "prefill", "ir.actions.server", action_vals)
    auto_vals = {
        "name": "Phase 2: quotation from opportunity -> pre-fill from Service",
        "model_id": _model_id(odoo, "sale.order"),
        "trigger": "on_create",
        "filter_domain": "[('opportunity_id', '!=', False)]",
        "active": True,
    }
    if odoo.has_field("base.automation", "action_server_ids"):
        auto_vals["action_server_ids"] = [(6, 0, [action_id])]
    else:
        auto_vals.update({"state": "code", "code": PREFILL_ACTION_CODE})
    auto_id = odoo.ref("p2auto", "prefill")
    if auto_id:
        odoo.write("base.automation", [auto_id], auto_vals)
    else:
        odoo.upsert("p2auto", "prefill", "base.automation", auto_vals)


def set_active(odoo, active):
    signed = odoo.ref("p2auto", "signed")
    if not signed:
        raise OdooError("phase 2 not installed yet — run `phase2 install` first")
    if active:
        # The CRM-facing pieces: the Service dropdown and the quotation
        # pre-fill only exist once you activate.
        _install_service_dropdown(odoo)
        _install_quote_button(odoo)
        _install_prefill_automation(odoo)
    else:
        prefill = odoo.ref("p2auto", "prefill")
        if prefill:
            odoo.write("base.automation", [prefill], {"active": False})
    odoo.write("base.automation", [signed], {"active": active})
    log.info("phase 2 automations %s", "ACTIVE" if active else "switched off")
