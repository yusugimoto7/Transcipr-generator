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
    "TAX": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "DISCOUNT": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    "TOTAL": (T_TEXT, ROLE_COMPANY, 70, 12, "left"),
    # The payment plan: one line per instalment, up to 6 lines.
    "PAYPLAN": (T_TEXTAREA, ROLE_COMPANY, 470, 84, "left"),
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
             "DISCOUNT", "TAX", "TOTAL", "PAYPLAN", "GIVEN", "FAMILY", "ADDR2", "PHONE", "EMAIL"}
# The bilingual TR contract is two columns: multi-line fields must fit one column.
TR_COLUMN_WIDTH = 245
# Fields the Send Contract action fills (everything but signatures/dates).
PREFILLED = [n for n, s in FIELD_SPECS.items() if s[0] not in (T_SIGN, T_DATE)]

TEMPLATES = {"TR": "TR-retainer.pdf", "PR": "PR-retainer.pdf"}


def _spec(name):
    base = name[:-3] if name.endswith("_FA") else name
    return base, FIELD_SPECS[base]


def _items(doc, W, H, kind="TR"):
    """sign.item vals for every marker of one contract."""
    vals = []
    for name, pos in doc["tokens"].items():
        base, (ftype, role, w, h, align) = _spec(name)
        fa = name.endswith("_FA")
        if kind == "TR" and ftype == T_TEXTAREA:
            w = min(w, TR_COLUMN_WIDTH)
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


def _ensure_sign_admin(odoo):
    """Replacing template fields needs the Sign administrator group."""
    rows = odoo.search_read("ir.model.data", [("module", "=", "sign"), ("name", "=", "group_sign_manager")],
                            ["res_id"], limit=1)
    if rows:
        odoo.execute("res.users", "write", [odoo.uid], {"groups_id": [(4, rows[0]["res_id"])]})


def install_templates(odoo):
    _ensure_sign_admin(odoo)
    tokens = json.loads((CONTRACTS / "tokens.json").read_text(encoding="utf-8"))
    ids = {}
    names = {"TR": "Retainer Agreement – TR (EN/FA)", "PR": "Retainer Agreement – PR (EN)"}
    for kind, pdf in TEMPLATES.items():
        doc = tokens[kind]
        data = base64.b64encode((CONTRACTS / pdf).read_bytes()).decode()
        tmpl_id = odoo.ref("signtmpl", kind)
        if tmpl_id:
            used = odoo.search_read("sign.template", [("id", "=", tmpl_id)], ["has_sign_requests"],
                                    context={"active_test": False})
            if used and used[0]["has_sign_requests"]:
                # Odoo freezes a template once requests exist on it: keep it
                # (archived) for those requests and continue on a fresh copy.
                odoo.write("sign.template", [tmpl_id], {"active": False})
                att_id = odoo.execute("ir.attachment", "create", {
                    "name": pdf, "datas": data, "mimetype": "application/pdf", "res_model": "sign.template"})
                tmpl_id = odoo.execute("sign.template", "create", {
                    "attachment_id": att_id, "name": names[kind], "active": True})
                odoo.restamp("signtmpl", kind, tmpl_id)
                odoo.restamp("signpdf", kind, att_id)
                log.info("  sign template %s had requests: archived, replaced by a new version", kind)
            else:
                att_id, _ = odoo.upsert("signpdf", kind, "ir.attachment", {
                    "name": pdf, "datas": data, "mimetype": "application/pdf", "res_model": "sign.template"})
                odoo.write("sign.template", [tmpl_id], {"attachment_id": att_id, "name": names[kind]})
                old = odoo.search_read("sign.item", [("template_id", "=", tmpl_id)], ["id"])
                if old:
                    odoo.execute("sign.item", "unlink", [o["id"] for o in old])
        else:
            att_id, _ = odoo.upsert("signpdf", kind, "ir.attachment", {
                "name": pdf, "datas": data, "mimetype": "application/pdf", "res_model": "sign.template"})
            tmpl_id, _ = odoo.upsert("signtmpl", kind, "sign.template", {
                "attachment_id": att_id, "name": names[kind], "active": True})
        # The viewer fetches the PDF through the attachment: it must belong to the template.
        odoo.write("ir.attachment", [att_id], {"res_model": "sign.template", "res_id": tmpl_id})
        for item in _items(doc, doc["W"], doc["H"], kind):
            item["template_id"] = tmpl_id
            odoo.execute("sign.item", "create", item)
        ids[kind] = tmpl_id
        log.info("  sign template %s: %d fields", kind, len(doc["tokens"]))
    return ids


# --- Payment plan ----------------------------------------------------------

# Odoo model behind the "Payment plan" table on the quotation: one row per
# instalment, an amount (typed, or a share of the contract total) and the
# milestone it is due at. The contract prints these rows.
PLAN_MODEL = "x_pay_plan"
PLAN_FIELD = "x_pay_plan_ids"

SHARES = [("100", "100% – full amount"), ("50", "50%"), ("33", "A third"),
          ("25", "25%"), ("custom", "Custom amount"), ("rest", "Remainder")]

# key -> (English label, Farsi label). Printed on the contract after the amount.
DUE = {
    "signing": ("upon signing the retainer agreement (within 7 business days)",
                "همزمان با امضای قرارداد (ظرف ۷ روز کاری)"),
    "m1": ("one month after signing the retainer agreement", "یک ماه پس از امضای قرارداد"),
    "m2": ("two months after signing the retainer agreement", "دو ماه پس از امضای قرارداد"),
    "m3": ("three months after signing the retainer agreement", "سه ماه پس از امضای قرارداد"),
    "loa": ("after receiving the letter of acceptance from the DLI", "پس از دریافت نامه پذیرش از دانشگاه/کالج"),
    "ita": ("after receiving the Invitation to Apply (ITA)", "پس از دریافت دعوت‌نامه اقدام (ITA)"),
    "ita1": ("one month after receiving the ITA", "یک ماه پس از دریافت ITA"),
    "ita2": ("two months after receiving the ITA", "دو ماه پس از دریافت ITA"),
    "ita3": ("three months after receiving the ITA", "سه ماه پس از دریافت ITA"),
    "nomination": ("after receiving the provincial nomination", "پس از دریافت نامینیشن استانی"),
    "sub_sp": ("before submitting the study permit application", "قبل از ارسال درخواست مجوز تحصیل"),
    "sub_wp": ("before submitting the work permit application", "قبل از ارسال درخواست مجوز کار"),
    "sub_trv": ("before submitting the visitor visa application", "قبل از ارسال درخواست ویزای ویزیتوری"),
    "sub_pr": ("before submitting the permanent residence application", "قبل از ارسال درخواست اقامت دائم"),
    "sub_app": ("before submitting the application", "قبل از ارسال درخواست"),
    "announce": ("upon announcement of the program details for the coming year",
                 "پس از اعلام جزئیات برنامه سال آینده"),
    "date": ("on {date}", "در تاریخ {date}"),
}
DUE_LABELS = [(k, v[0][0].upper() + v[0][1:]) for k, v in DUE.items()]

ORDINALS_EN = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"]
ORDINALS_FA = ["اول", "دوم", "سوم", "چهارم", "پنجم", "ششم", "هفتم", "هشتم"]

# Shared by the Recalculate and Send Contract actions: applies the fiscal
# position for the customer's location to the lines, returns the contract
# total (professional fees after discount, plus tax; government fees are never
# part of the contract), and fills the amounts of the plan rows from their
# shares. When the plan is empty it proposes one from the service.
RECALC_CODE = r"""
def is_gov(line):
    return (line.product_id.default_code or '').startswith('GOV-')

for order in records:
    partner = order.partner_id
    # 1. Fiscal position from the customer's country/province (auto-apply rules).
    FP = env['account.fiscal.position'].sudo()
    fpos = FP.browse()
    country = partner.country_id
    if country:
        for cand in FP.search([('company_id', '=', order.company_id.id), ('auto_apply', '=', True)], order='sequence, id'):
            if cand.country_id and cand.country_id != country:
                continue
            if cand.country_group_id and country not in cand.country_group_id.country_ids:
                continue
            if not cand.country_id and not cand.country_group_id:
                continue
            if cand.state_ids and partner.state_id not in cand.state_ids:
                continue
            fpos = cand
            break
    if order.fiscal_position_id != fpos:
        order.write({'fiscal_position_id': fpos.id})
    for line in order.order_line:
        if line.display_type or not line.product_id:
            continue
        taxes = line.product_id.taxes_id.filtered(lambda t: t.company_id == order.company_id)
        if is_gov(line):
            taxes = taxes.browse()
        elif fpos:
            taxes = fpos.map_tax(taxes)
        if set(line.tax_id.ids) != set(taxes.ids):
            line.write({'tax_id': [(6, 0, taxes.ids)]})

    # 2. Contract total: everything but government fees.
    lines = order.order_line.filtered(lambda l: not l.display_type and not is_gov(l))
    total = round(sum(lines.mapped('price_total')), 2)

    # 3. A default plan when there is none yet.
    Plan = env['x_pay_plan'].sudo()
    rows = Plan.search([('x_order_id', '=', order.id)], order='x_sequence, id')
    if not rows:
        codes = [l.product_id.default_code or '' for l in lines if l.product_uom_qty]
        main = codes[0] if codes else ''
        tags = order.order_line.mapped('product_id.product_tmpl_id.product_tag_ids.name')
        if 'PR' in tags:
            due2 = 'ita' if main in ('EE', 'PNP-EE') else 'sub_pr'
            plan = [('custom', min(1500.0, total), 'signing'), ('rest', 0.0, due2)]
        elif main.startswith(('SP', 'PGWP')):
            plan = [('33', 0.0, 'signing'), ('33', 0.0, 'loa'), ('rest', 0.0, 'sub_sp')]
        elif total >= 2500:
            due2 = 'sub_wp' if main.startswith(('WP', 'LMIA', 'OWP', 'IN-WP', 'PERMIT')) else (
                'sub_trv' if main.startswith(('TRV', 'BV', 'SUPERVISA', 'VR', 'IN-TRV')) else 'sub_app')
            plan = [('50', 0.0, 'signing'), ('rest', 0.0, due2)]
        else:
            plan = [('100', 0.0, 'signing')]
        for i, (share, amount, due) in enumerate(plan, start=1):
            Plan.create({'x_order_id': order.id, 'x_sequence': i, 'x_share': share,
                         'x_amount': amount, 'x_due': due})
        rows = Plan.search([('x_order_id', '=', order.id)], order='x_sequence, id')

    # 4. Amounts from the shares; "Remainder" rows split what is left.
    fixed = 0.0
    rest = []
    for row in rows:
        share = row.x_share or 'custom'
        if share == 'rest':
            rest.append(row)
            continue
        amount = row.x_amount if share == 'custom' else round(total / 3.0 if share == '33' else total * float(share) / 100.0, 2)
        if row.x_amount != amount:
            row.write({'x_amount': amount})
        fixed += amount
    if rest:
        remaining = round(total - fixed, 2)
        each = round(remaining / len(rest), 2)
        for i, row in enumerate(rest):
            amount = each if i < len(rest) - 1 else round(remaining - each * (len(rest) - 1), 2)
            if row.x_amount != amount:
                row.write({'x_amount': amount})
""".strip()


# --- Send Contract ---------------------------------------------------------

SEND_CONTRACT_CODE = r"""
order = record
lead = order.opportunity_id
partner = order.partner_id
if not partner.email:
    raise UserError("The customer has no e-mail address. Add it on the customer, then send again.")
if not partner.country_id:
    raise UserError("Set the customer's country (and province, for Canada): the sales tax on the contract depends on it.")
if partner.country_id.code == 'CA' and not partner.state_id:
    raise UserError("Set the customer's province: GST/HST on the contract depends on it.")
rcic_email = env['ir.config_parameter'].sudo().get_param('phase2.rcic_email') or ''
rcic_user = env['res.users'].sudo().search(['|', ('login', '=ilike', rcic_email), ('email', '=ilike', rcic_email)], limit=1) if rcic_email else env['res.users']
rcic = rcic_user.partner_id if rcic_user else env.user.partner_id

# Taxes for the customer's location, plan amounts from their shares.
env.ref('__trello__.p2action_recalc_plan').with_context(active_model='sale.order', active_id=order.id, active_ids=order.ids).run()
order.invalidate_recordset()

# TR or PR contract, from the tags on the quotation's products.
tags = order.order_line.mapped('product_id.product_tmpl_id.product_tag_ids.name')
kind = 'PR' if 'PR' in tags else 'TR'
template = env.ref('__trello__.signtmpl_' + kind, raise_if_not_found=False)
if not template:
    raise UserError("Sign template %s is not installed." % kind)

# Amounts from the lines. Government fees are never on the contract.
cur = order.currency_id.name
def money(v):
    s = '{:,.2f}'.format(v or 0.0)
    return s if cur == 'CAD' else '%s %s' % (cur, s)
pro = disc = 0.0
codes = []
for l in order.order_line:
    if l.display_type or not l.product_id:
        continue
    code = (l.product_id.default_code or '')
    if code.startswith('GOV-'):
        continue
    if l.product_uom_qty:
        codes.append(code)
    gross = l.product_uom_qty * l.price_unit
    pro += gross
    disc += gross * (l.discount or 0.0) / 100.0
tax = sum(l.price_tax for l in order.order_line if not l.display_type and not (l.product_id.default_code or '').startswith('GOV-'))
total = round(pro - disc + tax, 2)

rows = env['x_pay_plan'].sudo().search([('x_order_id', '=', order.id)], order='x_sequence, id')
if not rows:
    raise UserError("The payment plan is empty. Add at least one instalment on the Payment plan tab.")
if abs(sum(rows.mapped('x_amount')) - total) > 0.05:
    raise UserError("The payment plan adds up to %s but the contract total is %s. Fix the amounts on the Payment plan tab (or use 'Remainder' on the last row)." % (money(sum(rows.mapped('x_amount'))), money(total)))
due = __DUE__
ord_en = __ORD_EN__
ord_fa = __ORD_FA__
plan_en, plan_fa = [], []
for i, row in enumerate(rows):
    when_en, when_fa = due.get(row.x_due, due['sub_app'])
    if row.x_due == 'date':
        d = row.x_due_date.strftime('%B %d, %Y') if row.x_due_date else '…'
        when_en, when_fa = when_en.format(date=d), when_fa.format(date=d)
    note = (' – ' + row.x_note) if row.x_note else ''
    plan_en.append('%s Payment – %s CAD – %s%s' % (ord_en[i] if i < len(ord_en) else str(i + 1), money(row.x_amount), when_en, note))
    plan_fa.append('پرداخت %s – %s دلار کانادا – %s%s' % (ord_fa[i] if i < len(ord_fa) else str(i + 1), money(row.x_amount), when_fa, note))

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
    'PROFEE': money(pro), 'DISCOUNT': money(disc), 'TAX': money(tax), 'TOTAL': money(total),
    'PAYPLAN': '\n'.join(plan_en),
    'PAYPLAN_FA': '\n'.join(plan_fa),
    'GIVEN': names[0], 'FAMILY': names[1] if len(names) > 1 else '',
    'ADDR2': address, 'PHONE': partner.phone or partner.mobile or '', 'EMAIL': partner.email or '',
}

# Re-sending: the previous agreement, unless already signed, is cancelled so
# only the newest one is open for signature.
previous = order.x_sign_request_id
if previous and previous.state not in ('signed', 'canceled'):
    previous.sudo().cancel()
request = env['sign.request'].sudo().with_context(no_sign_mail=True).create({
    'template_id': template.id,
    'reference': '%s – Retainer Agreement – %s' % (order.client_order_ref or order.name, partner.name),
    'subject': 'Retainer agreement with Sugimoto Visa – please review and sign',
    # The RCIC signs first: their view shows the pre-filled values (still
    # editable), and once they sign the client sees them filled and locked.
    'request_item_ids': [
        (0, 0, {'partner_id': rcic.id, 'role_id': 2, 'mail_sent_order': 1}),
        (0, 0, {'partner_id': partner.id, 'role_id': 1, 'mail_sent_order': 2}),
    ],
})
company_item = request.request_item_ids.filtered(lambda r: r.role_id.id == 2)
ItemValue = env['sign.request.item.value'].sudo()
for item in template.sign_item_ids:
    base = item.name[:-3] if item.name.endswith('_FA') else item.name
    if item.type_id.item_type == 'checkbox':
        val = 'on' if checks.get(base) else ''
    else:
        val = values.get(item.name) if item.name in values else values.get(base)
    if val:
        ItemValue.create({'sign_request_id': request.id, 'sign_item_id': item.id,
                          'sign_request_item_id': company_item.id, 'value': val})
request.send_signature_accesses()
order.write({'x_sign_request_id': request.id})
summary = 'Professional fees %s, discount %s, tax %s, contract total %s (government fees excluded). Payment plan: %s' % (
    money(pro), money(disc), money(tax), money(total), '; '.join(plan_en))
order.message_post(body=('Updated retainer agreement' if previous else 'Retainer agreement') + ' (%s) sent to %s for review and signature; the client is e-mailed once the RCIC has signed: %s. %s' % (kind, rcic.name, request.reference, summary),
                   message_type='comment', subtype_xmlid='mail.mt_note')
if lead:
    lead.sudo().message_post(body='Retainer agreement sent for signature: %s' % request.reference,
                             message_type='comment', subtype_xmlid='mail.mt_note')
action = {'type': 'ir.actions.act_window', 'res_model': 'sign.request', 'res_id': request.id,
          'view_mode': 'form', 'views': [[False, 'form']], 'target': 'current'}
""".strip().replace("__DUE__", repr(DUE)).replace("__ORD_EN__", repr(ORDINALS_EN)).replace("__ORD_FA__", repr(ORDINALS_FA))


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


def _server_action(odoo, key, vals):
    act_id = odoo.ref("p2action", key)
    if act_id:
        odoo.write("ir.actions.server", [act_id], vals)
    else:
        act_id, _ = odoo.upsert("p2action", key, "ir.actions.server", vals)
    return act_id


def install_pay_plan(odoo):
    """The payment-plan table: its model, fields, access, and the Recalculate action."""
    model_id = odoo.ref("p2model", PLAN_MODEL)
    if not model_id:
        model_id, _ = odoo.upsert("p2model", PLAN_MODEL, "ir.model",
                                  {"name": "Payment plan line", "model": PLAN_MODEL, "state": "manual"},
                                  update=False)
        log.info("  payment plan model created")
    _field(odoo, PLAN_MODEL, "x_order_id", {
        "field_description": "Quotation", "ttype": "many2one", "relation": "sale.order",
        "on_delete": "cascade", "required": True, "index": True})
    _field(odoo, PLAN_MODEL, "x_sequence", {"field_description": "Sequence", "ttype": "integer"})
    _field(odoo, PLAN_MODEL, "x_share", {
        "field_description": "Share", "ttype": "selection", "required": True,
        "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(SHARES)]})
    _field(odoo, PLAN_MODEL, "x_amount", {"field_description": "Amount", "ttype": "float"})
    _field(odoo, PLAN_MODEL, "x_due", {
        "field_description": "Due", "ttype": "selection", "required": True,
        "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(DUE_LABELS)]})
    _field(odoo, PLAN_MODEL, "x_due_date", {"field_description": "Date", "ttype": "date"})
    _field(odoo, PLAN_MODEL, "x_note", {"field_description": "Note (printed)", "ttype": "char"})
    _field(odoo, "sale.order", PLAN_FIELD, {
        "field_description": "Payment plan", "ttype": "one2many", "relation": PLAN_MODEL,
        "relation_field": "x_order_id", "copied": True})
    group = odoo.search_read("ir.model.data", [("module", "=", "base"), ("name", "=", "group_user")],
                             ["res_id"], limit=1)[0]["res_id"]
    odoo.upsert("p2access", PLAN_MODEL, "ir.model.access", {
        "name": "x_pay_plan user", "model_id": model_id, "group_id": group,
        "perm_read": True, "perm_write": True, "perm_create": True, "perm_unlink": True})
    return _server_action(odoo, "recalc_plan", {
        "name": "Recalculate payment plan", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": RECALC_CODE, "binding_model_id": False})


def install_send_button(odoo, rcic_email):
    odoo.execute("ir.config_parameter", "set_param", "phase2.rcic_email", rcic_email or "")
    _field(odoo, "sale.order", "x_sign_request_id", {
        "field_description": "Retainer agreement", "ttype": "many2one",
        "relation": "sign.request", "on_delete": "set null"})
    recalc_id = install_pay_plan(odoo)
    act_id = _server_action(odoo, "send_contract", {
        "name": "Send Contract", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": SEND_CONTRACT_CODE, "binding_model_id": False})

    parents = odoo.search_read("ir.ui.view", [("model", "=", "sale.order"), ("type", "=", "form"),
                                              ("inherit_id", "=", False), ("name", "=", "sale.order.form")],
                               ["id"]) or odoo.search_read(
        "ir.ui.view", [("model", "=", "sale.order"), ("type", "=", "form"), ("inherit_id", "=", False)], ["id"])
    arch = ('<data>'
            '<xpath expr="//header" position="inside">'
            f'<button name="{act_id}" type="action" string="Send Contract" class="btn-primary" '
            'invisible="x_sign_request_id or state == \'cancel\'"/>'
            f'<button name="{act_id}" type="action" string="Resend Contract" class="btn-secondary" '
            'invisible="not x_sign_request_id or state == \'cancel\'" '
            'confirm="This sends a new agreement built from the current quotation. The previous one is cancelled unless it was already signed. Continue?"/>'
            '</xpath>'
            '<xpath expr="//field[@name=\'payment_term_id\']" position="after">'
            '<field name="x_sign_request_id" readonly="1"/>'
            '</xpath>'
            '<xpath expr="//notebook" position="inside">'
            '<page string="Payment plan" name="pay_plan">'
            '<div class="text-muted mb-2">Instalments printed on the retainer agreement. '
            'Government fees are never part of the contract. A share is a percentage of the contract total '
            '(professional fees after discount, plus tax); Remainder takes whatever is left. '
            'Amounts are recalculated when the contract is sent.</div>'
            f'<button name="{recalc_id}" type="action" string="Recalculate amounts" class="btn-secondary mb-2"/>'
            f'<field name="{PLAN_FIELD}" nolabel="1">'
            '<tree editable="bottom">'
            '<field name="x_sequence" widget="handle"/>'
            '<field name="x_share"/>'
            '<field name="x_amount" sum="Total"/>'
            '<field name="x_due"/>'
            '<field name="x_due_date" invisible="x_due != \'date\'"/>'
            '<field name="x_note" optional="hide"/>'
            '</tree></field>'
            '</page>'
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
            log.info("  Send Contract button and Payment plan tab placed on the quotation form")
            break
        except OdooError as exc:
            log.warning("  quotation form: %s", str(exc)[-200:])

    # The old fixed fields (1st/2nd payment, note) are replaced by the plan.
    for old in ("x_pay1", "x_pay2", "x_pay_note"):
        fid = odoo.ref("p2field", f"sale.order.{old}")
        if fid:
            try:
                odoo.execute("ir.model.fields", "unlink", [fid])
                log.info("  removed the old %s field", old)
            except OdooError as exc:
                log.warning("  could not remove %s: %s", old, str(exc)[-120:])

    sact = _server_action(odoo, "contract_signed", {
        "name": "Retainer signed -> confirm quotation", "model_id": _model_id(odoo, "sign.request"),
        "state": "code", "code": SIGNED_CODE})
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


def install_state_dropdown(odoo):
    """State dropdowns offer Canadian provinces until a country is picked.

    Odoo lists every state of every country while the country field is
    empty; almost every address typed here is Canadian or has no province.
    """
    domain = "[('country_id', '=', country_id)] if country_id else [('country_id.code', '=', 'CA')]"
    for model, key in (("res.partner", "partner_state"), ("crm.lead", "lead_state")):
        parents = odoo.search_read("ir.ui.view", [("model", "=", model), ("type", "=", "form"),
                                                  ("inherit_id", "=", False)], ["id"])
        arch = (f'<data><xpath expr="//field[@name=\'state_id\']" position="attributes">'
                f'<attribute name="domain">{domain}</attribute></xpath></data>')
        view_id = odoo.ref("p2view", key)
        for parent in parents:
            try:
                if view_id:
                    odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch})
                else:
                    view_id, _ = odoo.upsert("p2view", key, "ir.ui.view", {
                        "name": f"{model}.form.state_canada", "model": model,
                        "inherit_id": parent["id"], "arch_db": arch, "priority": 99})
                log.info("  %s: State dropdown limited to Canadian provinces", model)
                break
            except OdooError as exc:
                log.warning("  %s state dropdown: %s", model, str(exc)[-160:])


def prune_states(odoo, dry_run=False):
    """Delete every state that is not a Canadian province (destructive).

    Contacts using a foreign state keep their country; the state is cleared.
    """
    canada = odoo.search_read("res.country", [("code", "=", "CA")], ["id"], limit=1)[0]["id"]
    others = [s["id"] for s in odoo.search_read("res.country.state", [("country_id", "!=", canada)], ["id"])]
    used = odoo.search_read("res.partner", [("state_id", "in", others)], ["name"], context={"active_test": False})
    log.info("%d non-Canadian states, used by %d contacts", len(others), len(used))
    if dry_run:
        return len(others)
    if used:
        odoo.write("res.partner", [u["id"] for u in used], {"state_id": False})
    for i in range(0, len(others), 200):
        odoo.execute("res.country.state", "unlink", others[i:i + 200])
    log.info("deleted %d states; %d remain", len(others), odoo.execute("res.country.state", "search_count", []))
    return len(others)


def install(odoo, rcic_email):
    ids = install_templates(odoo)
    install_send_button(odoo, rcic_email)
    install_state_dropdown(odoo)
    return ids
