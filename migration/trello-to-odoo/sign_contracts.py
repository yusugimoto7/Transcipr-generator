"""Retainer agreements as Odoo Sign templates, sent from a quotation.

The TR (bilingual) and PR retainer PDFs live in contracts/, with marker
coordinates in contracts/tokens.json (made by contracts/tokenize_docs.py).
`install()` uploads them as sign.template records with one sign.item per
marker, then adds the "Send Contract" button on quotations: a server action
that creates the sign request, pre-fills every field from the quotation and
the CRM card, and e-mails the client. A signed request confirms the
quotation (which moves the card to the payment stage) and files the PDF on
the card.
"""

import base64
import json
import logging
import pathlib

from odoo_client import OdooError

log = logging.getLogger(__name__)

HERE = pathlib.Path(__file__).resolve().parent
CONTRACTS = HERE / "contracts"

ROLE_CUSTOMER, ROLE_COMPANY = 1, 2           # sign.item.role ids shipped with Sign
T_SIGN, T_TEXT, T_TEXTAREA, T_CHECK, T_DATE = 1, 7, 8, 9, 11   # sign.item.type ids
PT = 1 / 72.0  # not used, page units are points already

# name -> (type, role, width_pt, height_pt, align)
FIELD_SPECS = {
    "FILENO": (T_TEXT, ROLE_COMPANY, 110, 12, "left"),
    "DATE": (T_TEXT, ROLE_COMPANY, 80, 12, "left"),
    "CLIENT": (T_TEXT, ROLE_COMPANY, 190, 12, "left"),
    "ADDR": (T_TEXT, ROLE_COMPANY, 250, 12, "left"),
    "CB_SP": (T_CHECK, ROLE_COMPANY, 11, 11, None),
    "CB_WP": (T_CHECK, ROLE_COMPANY, 11, 11, None),
    "CB_TRV": (T_CHECK, ROLE_COMPANY, 11, 11, None),
    "CB_EE": (T_CHECK, ROLE_COMPANY, 11, 11, None),
    "CB_PNP": (T_CHECK, ROLE_COMPANY, 11, 11, None),
    "CB_PNPEE": (T_CHECK, ROLE_COMPANY, 11, 11, None),
    "PROFEE": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "GOVFEE": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "BIOFEE": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "TAX": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "DISCOUNT": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "TOTAL": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "PAY1": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "PAY2": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "PAYNOTE": (T_TEXTAREA, ROLE_COMPANY, 470, 40, "left"),
    "GIVEN": (T_TEXT, ROLE_COMPANY, 180, 12, "left"),
    "FAMILY": (T_TEXT, ROLE_COMPANY, 180, 12, "left"),
    "ADDR2": (T_TEXT, ROLE_COMPANY, 250, 12, "left"),
    "PHONE": (T_TEXT, ROLE_COMPANY, 140, 12, "left"),
    "EMAIL": (T_TEXT, ROLE_COMPANY, 200, 12, "left"),
    "SIG_C": (T_SIGN, ROLE_CUSTOMER, 150, 40, None),
    "SIG_R": (T_SIGN, ROLE_COMPANY, 150, 40, None),
    "DATE_C": (T_DATE, ROLE_CUSTOMER, 80, 12, "left"),
    "DATE_R": (T_DATE, ROLE_COMPANY, 80, 12, "left"),
}
# Farsi twins of the fields on the TR contract: same value, right-aligned,
# grown to the left of the marker.
FA_FIELDS = {"FILENO", "DATE", "CLIENT", "ADDR", "CB_SP", "CB_WP", "CB_TRV", "PROFEE",
             "GOVFEE", "BIOFEE", "TAX", "TOTAL", "PAY1", "PAY2", "GIVEN", "FAMILY",
             "ADDR2", "PHONE", "EMAIL"}
# Fields the Send Contract action fills (everything but signatures/dates).
PREFILLED = [n for n, s in FIELD_SPECS.items() if s[0] not in (T_SIGN, T_DATE)]

TEMPLATES = {"TR": "TR-retainer.pdf", "PR": "PR-retainer.pdf"}


def _spec(name):
    base = name[:-3] if name.endswith("_FA") else name
    return base, FIELD_SPECS[base]


def _items(doc, W, H):
    """sign.item vals for every marker of one contract."""
    vals = []
    for name, pos in doc["tokens"].items():
        base, (ftype, role, w, h, align) = _spec(name)
        fa = name.endswith("_FA")
        # Grow from the marker: right/down for LTR, left/down for the Farsi twins.
        x0 = (pos["x1"] - w) if fa else pos["x0"]
        top = pos["top"] - 2
        if ftype == T_SIGN:
            top = pos["top"] - h + 12   # sit the signature box on the line
        x0 = max(0, min(x0, W - w))
        vals.append({
            "name": name, "type_id": ftype, "responsible_id": role,
            "required": ftype in (T_SIGN, T_DATE),
            "page": pos["page"],
            "posX": round(x0 / W, 4), "posY": round(top / H, 4),
            "width": round(w / W, 4), "height": round(h / H, 4),
            "alignment": ("right" if fa else align) if align else "center",
        })
    return vals


def install_templates(odoo):
    tokens = json.loads((CONTRACTS / "tokens.json").read_text(encoding="utf-8"))
    ids = {}
    for kind, pdf in TEMPLATES.items():
        doc = tokens[kind]
        data = base64.b64encode((CONTRACTS / pdf).read_bytes()).decode()
        att_id, _ = odoo.upsert("signpdf", kind, "ir.attachment", {
            "name": pdf, "datas": data, "mimetype": "application/pdf",
            "res_model": "sign.template",
        })
        tmpl_id = odoo.ref("signtmpl", kind)
        if tmpl_id:
            odoo.write("sign.template", [tmpl_id], {"attachment_id": att_id})
            old = odoo.search_read("sign.item", [("template_id", "=", tmpl_id)], ["id"])
            if old:
                odoo.execute("sign.item", "unlink", [o["id"] for o in old])
        else:
            tmpl_id, _ = odoo.upsert("signtmpl", kind, "sign.template", {
                "attachment_id": att_id,
                "name": {"TR": "Retainer Agreement – TR (EN/FA)",
                         "PR": "Retainer Agreement – PR (EN)"}[kind],
                "active": True,
            })
        for item in _items(doc, doc["W"], doc["H"]):
            item["template_id"] = tmpl_id
            odoo.execute("sign.item", "create", item)
        ids[kind] = tmpl_id
        log.info("  sign template %s: %d fields", kind, len(doc["tokens"]))
    return ids


# --- Send Contract ---------------------------------------------------------

SEND_CONTRACT_CODE = r"""
order = record
lead = order.opportunity_id
partner = order.partner_id
if not partner.email:
    raise UserError("The customer has no e-mail address. Add it on the customer, then send again.")
rcic_email = env['ir.config_parameter'].sudo().get_param('phase2.rcic_email') or ''
rcic = env['res.partner'].sudo().search([('email', '=ilike', rcic_email)], limit=1) if rcic_email else env['res.partner']
if not rcic:
    rcic = env.user.partner_id

# TR or PR contract, from the tags on the quotation's products.
tags = order.order_line.mapped('product_id.product_tmpl_id.product_tag_ids.name')
kind = 'PR' if 'PR' in tags else 'TR'
template = env.ref('__trello__.signtmpl_' + kind, raise_if_not_found=False)
if not template:
    raise UserError("Sign template %s is not installed." % kind)

# Amounts from the lines.
def money(v):
    return '{:,.2f}'.format(v or 0.0)
pro = gov = bio = disc = 0.0
codes = []
for l in order.order_line:
    if l.display_type:
        continue
    code = (l.product_id.default_code or '')
    if l.product_uom_qty:
        codes.append(code)
    if code == 'GOV-BIO':
        bio += l.price_subtotal
    elif code.startswith('GOV-'):
        gov += l.price_subtotal
    else:
        pro += l.price_subtotal
    disc += l.product_uom_qty * l.price_unit * (l.discount or 0.0) / 100.0
cur = order.currency_id.name
first = order.x_pay1 if order.x_pay1 else round(pro / 2.0, 2)
second = order.x_pay2 if order.x_pay2 else round(pro - first, 2)
main = codes[0] if codes else ''
checks = {
    'CB_SP': main.startswith(('SP', 'PGWP')),
    'CB_WP': main.startswith(('WP', 'LMIA', 'OWP', 'IN-WP', 'PERMIT')),
    'CB_TRV': main.startswith(('TRV', 'BV', 'SUPERVISA', 'VR', 'IN-TRV')),
    'CB_EE': main == 'EE',
    'CB_PNP': main == 'PNP',
    'CB_PNPEE': main == 'PNP-EE',
}
names = (partner.name or '').split(' ', 1)
address = ', '.join(p for p in [partner.street, partner.street2, partner.city,
                                partner.state_id.name, partner.zip, partner.country_id.name] if p)
values = {
    'FILENO': order.client_order_ref or order.name,
    'DATE': datetime.date.today().strftime('%d/%m/%Y'),
    'CLIENT': partner.name or '',
    'ADDR': address,
    'PROFEE': money(pro), 'GOVFEE': money(gov), 'BIOFEE': money(bio),
    'TAX': money(order.amount_tax), 'DISCOUNT': money(disc), 'TOTAL': money(order.amount_total),
    'PAY1': money(first), 'PAY2': money(second),
    'PAYNOTE': order.x_pay_note or '',
    'GIVEN': names[0], 'FAMILY': names[1] if len(names) > 1 else '',
    'ADDR2': address, 'PHONE': partner.phone or partner.mobile or '', 'EMAIL': partner.email or '',
}

request = env['sign.request'].sudo().with_context(no_sign_mail=True).create({
    'template_id': template.id,
    'reference': '%s – Retainer Agreement – %s' % (order.client_order_ref or order.name, partner.name),
    'subject': 'Your retainer agreement with Sugimoto Visa',
    'request_item_ids': [
        (0, 0, {'partner_id': partner.id, 'role_id': 1, 'mail_sent_order': 1}),
        (0, 0, {'partner_id': rcic.id, 'role_id': 2, 'mail_sent_order': 2}),
    ],
})
company_item = request.request_item_ids.filtered(lambda r: r.role_id.id == 2)
ItemValue = env['sign.request.item.value'].sudo()
for item in template.sign_item_ids:
    base = item.name[:-3] if item.name.endswith('_FA') else item.name
    if item.type_id.item_type == 'checkbox':
        val = 'on' if checks.get(base) else ''
    else:
        val = values.get(base)
    if val:
        ItemValue.create({'sign_request_id': request.id, 'sign_item_id': item.id,
                          'sign_request_item_id': company_item.id, 'value': val})
request.send_signature_accesses()
order.write({'x_sign_request_id': request.id})
order.message_post(body='Retainer agreement (%s) sent for signature: %s' % (kind, request.reference),
                   message_type='comment', subtype_xmlid='mail.mt_note')
if lead:
    lead.sudo().message_post(body='Retainer agreement sent for signature: %s' % request.reference,
                             message_type='comment', subtype_xmlid='mail.mt_note')
action = {'type': 'ir.actions.act_window', 'res_model': 'sign.request', 'res_id': request.id,
          'view_mode': 'form', 'views': [[False, 'form']], 'target': 'current'}
""".strip()


# When everyone has signed: confirm the quotation (the existing automation
# then moves the card) and file the signed PDF on the card and the quotation.
SIGNED_CODE = r"""
for req in records:
    if req.state != 'signed':
        continue
    order = env['sale.order'].sudo().search([('x_sign_request_id', '=', req.id)], limit=1)
    if not order:
        continue
    attachments = req.completed_document_attachment_ids
    for target in [order] + ([order.opportunity_id] if order.opportunity_id else []):
        for att in attachments:
            copy = att.sudo().copy({'res_model': target._name, 'res_id': target.id})
            target.sudo().message_post(body='Signed retainer agreement: %s' % req.reference,
                                       attachment_ids=[copy.id], message_type='comment',
                                       subtype_xmlid='mail.mt_note')
    if order.state in ('draft', 'sent'):
        order.sudo().action_confirm()
""".strip()


def _model_id(odoo, model):
    return odoo.search_read("ir.model", [("model", "=", model)], ["id"], limit=1)[0]["id"]


def _field(odoo, model, name, vals):
    fid = odoo.ref("p2field", f"{model}.{name}")
    if fid:
        return fid
    fid, _ = odoo.upsert("p2field", f"{model}.{name}", "ir.model.fields",
                         dict(vals, name=name, model_id=_model_id(odoo, model), model=model,
                              state="manual"), update=False)
    return fid


def install_send_button(odoo, rcic_email):
    odoo.execute("ir.config_parameter", "set_param", "phase2.rcic_email", rcic_email or "")
    _field(odoo, "sale.order", "x_sign_request_id", {
        "field_description": "Retainer agreement", "ttype": "many2one",
        "relation": "sign.request", "on_delete": "set null"})
    _field(odoo, "sale.order", "x_pay1", {"field_description": "1st payment", "ttype": "float"})
    _field(odoo, "sale.order", "x_pay2", {"field_description": "2nd payment", "ttype": "float"})
    _field(odoo, "sale.order", "x_pay_note", {"field_description": "Payment plan (on the contract)",
                                              "ttype": "text"})

    act_vals = {"name": "Send Contract", "model_id": _model_id(odoo, "sale.order"),
                "state": "code", "code": SEND_CONTRACT_CODE, "binding_model_id": False}
    act_id = odoo.ref("p2action", "send_contract")
    if act_id:
        odoo.write("ir.actions.server", [act_id], act_vals)
    else:
        act_id, _ = odoo.upsert("p2action", "send_contract", "ir.actions.server", act_vals)

    parents = odoo.search_read("ir.ui.view", [("model", "=", "sale.order"), ("type", "=", "form"),
                                              ("inherit_id", "=", False), ("name", "=", "sale.order.form")],
                               ["id"]) or odoo.search_read(
        "ir.ui.view", [("model", "=", "sale.order"), ("type", "=", "form"), ("inherit_id", "=", False)], ["id"])
    arch = ('<data>'
            '<xpath expr="//header" position="inside">'
            f'<button name="{act_id}" type="action" string="Send Contract" class="btn-primary" '
            'invisible="x_sign_request_id or state not in (\'draft\', \'sent\')"/>'
            '</xpath>'
            '<xpath expr="//field[@name=\'payment_term_id\']" position="after">'
            '<field name="x_sign_request_id" readonly="1"/>'
            '<field name="x_pay1"/><field name="x_pay2"/>'
            '</xpath>'
            '<xpath expr="//field[@name=\'note\']" position="before">'
            '<field name="x_pay_note" placeholder="Payment plan printed on the retainer agreement"/>'
            '</xpath>'
            '</data>')
    view_id = odoo.ref("p2view", "so_send_contract")
    for parent in parents:
        try:
            if view_id:
                odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch})
            else:
                view_id, _ = odoo.upsert("p2view", "so_send_contract", "ir.ui.view", {
                    "name": "sale.order.form.send_contract", "model": "sale.order",
                    "inherit_id": parent["id"], "arch_db": arch, "priority": 99})
            log.info("  Send Contract button placed on the quotation form")
            break
        except OdooError as exc:
            log.warning("  quotation form: %s", str(exc)[-200:])

    signed_vals = {"name": "Retainer signed -> confirm quotation", "model_id": _model_id(odoo, "sign.request"),
                   "state": "code", "code": SIGNED_CODE}
    sact = odoo.ref("p2action", "contract_signed")
    if sact:
        odoo.write("ir.actions.server", [sact], signed_vals)
    else:
        sact, _ = odoo.upsert("p2action", "contract_signed", "ir.actions.server", signed_vals)
    state_field = odoo.search_read("ir.model.fields", [("model", "=", "sign.request"), ("name", "=", "state")],
                                   ["id"], limit=1)[0]["id"]
    auto_vals = {"name": "Phase 2: retainer signed -> confirm quotation",
                 "model_id": _model_id(odoo, "sign.request"), "trigger": "on_write",
                 "trigger_field_ids": [(6, 0, [state_field])],
                 "filter_domain": "[('state', '=', 'signed')]", "action_server_ids": [(6, 0, [sact])],
                 "active": True}
    auto = odoo.ref("p2auto", "contract_signed")
    if auto:
        odoo.write("base.automation", [auto], auto_vals)
    else:
        odoo.upsert("p2auto", "contract_signed", "base.automation", auto_vals)
    log.info("  signed-contract automation active")


def install(odoo, rcic_email):
    ids = install_templates(odoo)
    install_send_button(odoo, rcic_email)
    return ids
