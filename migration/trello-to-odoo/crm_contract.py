"""Contract numbers on the CRM card.

One number, one owner. The professional fee shown on a card comes from the
quotation behind it whenever there is one, split per company the way the
instalment planner splits it (non-government lines, net of discount, before
tax; Sparkbridge lines are the ones whose product carries an SB- tag).
Cards with no quotation (the years before Odoo) get the figures once from the
finance sheets, marked as such. Government fees are never part of any number
here; euro contracts stay in euros.

Installs, through the external API:

- the "Contract" block of fields on crm.lead, shown under Service Agreement;
- an automation on quotations (and their lines) that pushes the numbers to
  the card on every change, so a lowered price lowers the card too;
- an automation on the card's stage so "Payment Receipt Sent" stamps the paid
  date and status.

Everything is stamped with external ids, so rerunning updates in place.
"""

import logging

from odoo_client import OdooError
from sign_contracts import PAID_STAGE_IDS, _field, _model_id, _server_action, _sync_selection, install_card_rules

log = logging.getLogger(__name__)

LEAD = "crm.lead"

STATUSES = [
    ("draft_sent", "Draft sent"),
    ("sent", "Contract sent"),
    ("signed", "Signed"),
    ("signed_partial", "Signed, partially paid"),
    ("paid", "Signed and paid"),
    ("paid_only", "Paid, not signed"),
    ("terminated", "Terminated"),
    ("other", "Other"),
]
SOURCES = [("odoo", "Quotation"), ("sheet", "Google Sheet"), ("manual", "Entered by hand")]
CURRENCIES = [("CAD", "CAD"), ("EUR", "EUR")]


FIELDS = [
    ("x_contract_no_sg", {"field_description": "Contract no. (Sugimoto)", "ttype": "char"}),
    ("x_contract_no_sb", {"field_description": "Contract no. (Sparkbridge)", "ttype": "char"}),
    ("x_fee_sg", {"field_description": "Professional fee (Sugimoto)", "ttype": "float"}),
    ("x_fee_sb", {"field_description": "Professional fee (Sparkbridge)", "ttype": "float"}),
    # Kept as a plain field and summed by an automation: creating a computed
    # manual field on crm.lead reloads the registry for longer than the proxy
    # allows on this database.
    ("x_fee_total", {"field_description": "Professional fee (total)", "ttype": "float"}),
    ("x_fee_currency", {"field_description": "Fee currency", "ttype": "selection",
                        "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(CURRENCIES)]}),
    ("x_fee_source", {"field_description": "Fee source", "ttype": "selection",
                      "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(SOURCES)]}),
    ("x_contract_status", {"field_description": "Contract status", "ttype": "selection",
                           "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(STATUSES)]}),
    ("x_contract_sent_on", {"field_description": "Contract sent on", "ttype": "date"}),
    ("x_contract_signed_on", {"field_description": "Signed on", "ttype": "date"}),
    ("x_contract_paid_on", {"field_description": "Paid on", "ttype": "date"}),
    ("x_contract_order_id", {"field_description": "Quotation behind the numbers", "ttype": "many2one",
                             "relation": "sale.order", "on_delete": "set null"}),
]

# Runs for a quotation or for its lines; always ends up on the card.
PUSH_CODE = r"""
orders = records
if records._name == 'sale.order.line':
    orders = records.mapped('order_id')
today = datetime.date.today()
for order in orders:
    lead = order.opportunity_id
    if not lead:
        continue
    # The card follows the newest live quotation of the card; an older or
    # cancelled one must not overwrite it.
    live = lead.order_ids.filtered(lambda o: o.state != 'cancel').sorted(lambda o: (o.date_order or o.create_date, o.id))
    if live and order != live[-1]:
        continue
    fee = {'sg': 0.0, 'sb': 0.0}
    for l in order.order_line:
        if l.display_type or not l.product_id or (l.product_id.default_code or '').startswith('GOV-'):
            continue
        tags = l.product_id.product_tmpl_id.product_tag_ids.mapped('name')
        c = 'sb' if any(t.startswith('SB-') for t in tags) else 'sg'
        fee[c] += l.price_subtotal
    fee = {c: round(v, 2) for c, v in fee.items()}
    kinds = order.x_agreement_kinds or ''
    both = fee['sg'] and fee['sb']
    no_sg = (order.x_sugimoto_no or '').strip() if both else ((order.client_order_ref or '').strip() if fee['sg'] else '')
    no_sb = (order.client_order_ref or '').strip() if fee['sb'] else ''
    if fee['sg'] and not fee['sb'] and not no_sg:
        no_sg = (order.client_order_ref or '').strip()
    cur = order.currency_id.name if order.currency_id.name in ('CAD', 'EUR') else 'CAD'
    vals = {
        'x_fee_sg': fee['sg'], 'x_fee_sb': fee['sb'], 'x_fee_total': round(fee['sg'] + fee['sb'], 2), 'x_fee_currency': cur,
        'x_fee_source': 'odoo', 'x_contract_order_id': order.id,
        'x_contract_no_sg': no_sg or lead.x_contract_no_sg or False,
        'x_contract_no_sb': no_sb or lead.x_contract_no_sb or False,
    }
    if cur == 'CAD':
        vals['expected_revenue'] = fee['sg'] + fee['sb']
    status = lead.x_contract_status
    if order.x_sheet_sent_date:
        vals['x_contract_sent_on'] = lead.x_contract_sent_on or order.x_sheet_sent_date
        if status in (False, 'draft_sent'):
            status = 'sent'
    elif not status:
        status = 'draft_sent'
    if order.state == 'sale':
        if not lead.x_contract_signed_on:
            vals['x_contract_signed_on'] = today
        if status in (False, 'draft_sent', 'sent'):
            status = 'signed'
        if status == 'paid_only':
            status = 'paid'
    if lead.stage_id.id in %(paid_stages)r and status in ('signed', 'signed_partial'):
        status = 'paid'
        if not lead.x_contract_paid_on:
            vals['x_contract_paid_on'] = today
    vals['x_contract_status'] = status
    lead.sudo().write(vals)
""" % {"paid_stages": PAID_STAGE_IDS}



def _automation(odoo, key, vals):
    auto = odoo.ref("p2auto", key)
    if auto:
        odoo.write("base.automation", [auto], vals)
        return auto
    auto, _ = odoo.upsert("p2auto", key, "base.automation", vals)
    return auto


def _field_ids(odoo, model, names):
    rows = odoo.search_read("ir.model.fields", [("model", "=", model), ("name", "in", names)], ["id"])
    return [r["id"] for r in rows]


def install_fields(odoo):
    for name, vals in FIELDS:
        _field(odoo, LEAD, name, vals)
    _sync_selection(odoo, LEAD, "x_fee_currency", CURRENCIES)
    _sync_selection(odoo, LEAD, "x_fee_source", SOURCES)
    _sync_selection(odoo, LEAD, "x_contract_status", STATUSES)
    log.info("  contract fields on the card")


def install_form(odoo):
    parent = odoo.search_read("ir.ui.view", [("model", "=", LEAD), ("type", "=", "form"),
                                             ("arch_db", "like", "x_service"), ("inherit_id", "!=", False)],
                              ["id"], limit=1)
    # Our own Service Agreement view is the anchor; fall back to the base form.
    anchor = "//field[@name='x_service']" if parent else "//field[@name='user_id']"
    base = odoo.search_read("ir.ui.view", [("model", "=", LEAD), ("type", "=", "form"), ("inherit_id", "=", False),
                                           ("name", "=", "crm.lead.form")], ["id"], limit=1)[0]["id"]
    arch = (
        '<data>'
        '<xpath expr="%s" position="after">'
        '<field name="x_contract_status" widget="badge"'
        ' decoration-info="x_contract_status in (\'draft_sent\',\'sent\')"'
        ' decoration-warning="x_contract_status in (\'signed\',\'signed_partial\',\'paid_only\')"'
        ' decoration-success="x_contract_status == \'paid\'"'
        ' decoration-danger="x_contract_status == \'terminated\'"/>'
        '<field name="x_contract_no_sg"/>'
        '<field name="x_contract_no_sb"/>'
        '<label for="x_fee_sg" string="Professional fee (Sugimoto)"/>'
        '<div class="o_row"><field name="x_fee_sg"/><field name="x_fee_currency" class="oe_inline"/></div>'
        '<field name="x_fee_sb"/>'
        '<field name="x_fee_total"/>'
        '<field name="x_contract_sent_on"/>'
        '<field name="x_contract_signed_on"/>'
        '<field name="x_contract_paid_on"/>'
        '<field name="x_fee_source"/>'
        '<field name="x_contract_order_id" readonly="1" invisible="not x_contract_order_id"/>'
        '</xpath>'
        '</data>') % anchor
    vals = {"name": "crm.lead.form.contract", "model": LEAD, "inherit_id": base, "arch_db": arch, "priority": 210}
    vid = odoo.ref("p2view", "lead_contract")
    if vid:
        odoo.write("ir.ui.view", [vid], vals)
    else:
        odoo.upsert("p2view", "lead_contract", "ir.ui.view", vals)
    log.info("  Contract block placed under Service Agreement")


def install_automations(odoo):
    so_model = _model_id(odoo, "sale.order")
    push = _server_action(odoo, "contract_push", {
        "name": "Quotation -> contract numbers on the card", "model_id": so_model,
        "state": "code", "code": PUSH_CODE, "binding_model_id": False})
    _automation(odoo, "contract_push", {
        "name": "Phase 2: quotation -> card contract numbers", "model_id": so_model,
        "trigger": "on_create_or_write", "filter_domain": "[]",
        "trigger_field_ids": [(6, 0, _field_ids(odoo, "sale.order", [
            "order_line", "state", "x_sheet_sent_date", "client_order_ref", "x_sugimoto_no",
            "currency_id", "opportunity_id", "x_agreement_kinds"]))],
        "action_server_ids": [(6, 0, [push])], "active": True})
    # Line edits from the quotation form do not always touch the order's own
    # write(); listen on the lines as well.
    sol_model = _model_id(odoo, "sale.order.line")
    push_line = _server_action(odoo, "contract_push_line", {
        "name": "Quotation line -> contract numbers on the card", "model_id": sol_model,
        "state": "code", "code": PUSH_CODE, "binding_model_id": False})
    _automation(odoo, "contract_push_line", {
        "name": "Phase 2: quotation line -> card contract numbers", "model_id": sol_model,
        "trigger": "on_create_or_write", "filter_domain": "[]",
        "trigger_field_ids": [(6, 0, _field_ids(odoo, "sale.order.line", [
            "price_unit", "product_uom_qty", "discount", "product_id"]))],
        "action_server_ids": [(6, 0, [push_line])], "active": True})
    # A server action belongs to one automation only (base_automation_id), so
    # the unlink trigger needs its own copy of the action.
    push_unlink = _server_action(odoo, "contract_push_line_unlink", {
        "name": "Quotation line removed -> contract numbers on the card", "model_id": sol_model,
        "state": "code", "code": PUSH_CODE, "binding_model_id": False})
    _automation(odoo, "contract_push_line_unlink", {
        "name": "Phase 2: quotation line removed -> card contract numbers", "model_id": sol_model,
        "trigger": "on_unlink", "filter_domain": "[]",
        "action_server_ids": [(6, 0, [push_unlink])], "active": True})

    # The card side (total follows the fees, payment stage stamps the paid
    # date) lives in the card-rules dispatcher: every extra automation on the
    # card multiplies the cost of each save (see CARD_RULES_CODE), and two of
    # them took a card save from 1 s to 9 s on production.
    for key in ("contract_total", "contract_stage"):
        auto = odoo.ref("p2auto", key)
        if auto:
            odoo.write("base.automation", [auto], {"active": False})
            log.info("  retired the separate %s automation", key)
    install_card_rules(odoo)
    log.info("  quotation -> card automations active; card rules carry the total and paid date")
    return push


def refresh_all(odoo):
    """Run the push over every live quotation once (first install / repair)."""
    push = odoo.ref("p2action", "contract_push")
    ids = [r["id"] for r in odoo.search_read("sale.order", [("opportunity_id", "!=", False), ("state", "!=", "cancel")], ["id"])]
    n = 0
    for oid in ids:
        try:
            odoo.execute("ir.actions.server", "run", [push],
                         context={"active_model": "sale.order", "active_id": oid, "active_ids": [oid]})
            n += 1
        except OdooError as exc:
            log.warning("  order %s: %s", oid, str(exc)[-160:])
    log.info("  card numbers refreshed from %d quotations", n)
    return n


def install(odoo):
    install_fields(odoo)
    install_form(odoo)
    install_automations(odoo)
    refresh_all(odoo)
