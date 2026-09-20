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
import re

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

# Agreement kinds = product tags = qweb reports x_agreement.<kind> (contract_templates/agreements.py).
KINDS = ["TR", "PR", "SPON", "ENT", "PFL", "SB-A", "SB-C", "SB-D", "SB-E", "SB-F"]

# Scope bullets of the entrepreneur retainers (section 2), per service code.
ENT_SCOPE = {
    "BC-ENT": (["Expression of Interest (EOI): Preparation and submission to the BC PNP.",
                "Invitation to Apply (ITA) & Provincial Application: Managing the provincial application process upon receipt of an ITA, leading to a Performance Agreement.",
                "Work Permit application: Preparation and filing of the Work Permit application to IRCC (after receiving the Work Permit Support Letter from BC PNP) to allow the Client to move to British Columbia and start business operations."],
               ["باز کردن پروفایل استانی (EOI): آماده‌سازی و ارسال به برنامه مهاجرتی بریتیش کلمبیا (BC PNP).",
                "آماده‌سازی پرونده پس از دریافت دعوتنامه (ITA) استانی: مدیریت فرآیند درخواست استانی پس از دریافت دعوتنامه، که به توافق‌نامه عملکرد (Performance Agreement) منجر می‌شود.",
                "پرونده اجازه کار: آماده‌سازی و ارسال درخواست مجوز کار به اداره مهاجرت کانادا (IRCC) پس از دریافت نامه پشتیبانی مجوز کار از BC PNP، برای انتقال موکل به بریتیش کلمبیا و شروع فعالیت کسب‌وکار."]),
    "AB-ENT": (["Expression of Interest (EOI): Preparation and submission to the Alberta Advantage Immigration Program (AAIP).",
                "Nomination application: Managing the provincial application upon receipt of an Invitation, using the Letter of Recommendation from the designated agency, leading to a Business Performance Agreement.",
                "Work Permit application: Preparation and filing of the Work Permit application to IRCC (after receiving the Work Permit Support Letter from AAIP) to allow the Client to move to Alberta and start business operations."],
               ["باز کردن پروفایل استانی (EOI): آماده‌سازی و ارسال به برنامه مهاجرتی آلبرتا (AAIP).",
                "پرونده نامینیشن: مدیریت درخواست استانی پس از دریافت دعوتنامه، با استفاده از نامه توصیه (LoR) آژانس تعیین‌شده، که به توافق‌نامه عملکرد کسب‌وکار منجر می‌شود.",
                "پرونده اجازه کار: آماده‌سازی و ارسال درخواست مجوز کار به اداره مهاجرت کانادا (IRCC) پس از دریافت نامه پشتیبانی مجوز کار از AAIP، برای انتقال موکل به آلبرتا و شروع فعالیت کسب‌وکار."]),
}

# Signature / date boxes on the last page (fractions of the page). Kinds with
# a dedicated signature page use "page"; SPON adds the sponsor; the
# Sparkbridge retainers keep their tabular signature block ("sb_table").
SIGN_BOXES = {
    "page": {"client": (0.08, 0.135, 0.36, 0.06), "company": (0.50, 0.135, 0.36, 0.06),
             "client_date": (0.17, 0.222, 0.16, 0.03), "company_date": (0.59, 0.222, 0.16, 0.03)},
    "spon": {"client": (0.08, 0.135, 0.36, 0.06), "sponsor": (0.50, 0.135, 0.36, 0.06),
             "client_date": (0.17, 0.222, 0.16, 0.03), "sponsor_date": (0.59, 0.222, 0.16, 0.03),
             "company": (0.08, 0.315, 0.36, 0.06), "company_date": (0.17, 0.386, 0.16, 0.03)},
}


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
    "app1": ("one month after submitting the application", "یک ماه پس از ارسال درخواست"),
    "app2": ("two months after submitting the application", "دو ماه پس از ارسال درخواست"),
    "app3": ("three months after submitting the application", "سه ماه پس از ارسال درخواست"),
    "app4": ("four months after submitting the application", "چهار ماه پس از ارسال درخواست"),
    "announce": ("upon announcement of the program details for the coming year",
                 "پس از اعلام جزئیات برنامه سال آینده"),
    "m6": ("six months after signing the retainer agreement", "شش ماه پس از امضای قرارداد"),
    "lor": ("after receiving the Letter of Recommendation from the designated agency",
            "پس از دریافت نامه توصیه (LoR) از آژانس تعیین‌شده"),
    "phase2": ("at the start of Phase 2 of the business development services",
               "در شروع فاز ۲ خدمات توسعه کسب‌وکار"),
    "dsif": ("after the facilitator / DSIF approval", "پس از تأیید فسیلیتیتور / DSIF"),
    "sub_visa": ("before filing the visa application", "قبل از ثبت درخواست ویزا"),
    "adm": ("after receiving the admission letter", "پس از دریافت نامه پذیرش"),
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
    if not rows and lines:
        codes = [l.product_id.default_code or '' for l in lines
                 if l.product_uom_qty and (l.product_uom_qty * (l.price_unit or 0.0)) >= 0]
        main = codes[0] if codes else ''
        tags = order.order_line.mapped('product_id.product_tmpl_id.product_tag_ids.name')
        # The service's default plan ("share:amount:due;..." on the product),
        # taken from the first billable line that has one.
        spec = ''
        for l in lines:
            if l.product_uom_qty and (l.product_id.product_tmpl_id.x_default_plan or '').strip():
                spec = l.product_id.product_tmpl_id.x_default_plan.strip()
                break
        if spec:
            plan = []
            for part in spec.split(';'):
                share, amount, due = (part.split(':') + ['', ''])[:3]
                plan.append((share.strip() or 'custom', float(amount or 0), due.strip() or 'signing'))
        elif 'PR' in tags:
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



# --- Custom agreement (uploaded PDF) ---------------------------------------
# A quotation can carry its own agreement instead of a generated one: a PDF
# uploaded on the quotation (or a Google Docs / Drive link kept for reference;
# the PDF still has to be uploaded, server actions cannot fetch from Google).
# The PDF becomes a Sign template with signature and date boxes on its last
# page, and the Sign editor opens so the sender can move the boxes and press
# Send. Signing confirms the quotation exactly like a generated agreement.

SEND_CUSTOM_CODE = r"""
order = record
partner = order.partner_id
order.write({'x_pending_approval': False})
fname = order.x_custom_agreement_filename or 'agreement.pdf'
if not order.x_custom_agreement:
    raise UserError(
        "A link to the agreement was given but no PDF was uploaded. Open the document, "
        "download it as PDF (File > Download > PDF in Google Docs), upload it in "
        "'Custom agreement (PDF)' and send again.")
if not fname.lower().endswith('.pdf'):
    raise UserError("The custom agreement must be a PDF file, not %s." % fname)
if not b64decode(order.x_custom_agreement).startswith(b'%PDF'):
    raise UserError("The uploaded file is not a valid PDF. Re-download it and upload it again.")
previous = order.x_sign_request_id
if previous and previous.state not in ('signed', 'canceled'):
    previous.sudo().cancel()
att = env['ir.attachment'].sudo().create({
    'name': fname, 'datas': order.x_custom_agreement, 'mimetype': 'application/pdf',
    'res_model': 'sign.template'})
tmpl = env['sign.template'].sudo().create({
    'attachment_id': att.id,
    'name': '%s – Custom agreement – %s' % (order.client_order_ref or order.name, partner.name)})
att.write({'res_id': tmpl.id})
if not tmpl.num_pages:
    # Odoo's own PDF library could not read the page count, so the Sign
    # screen would fail to load ("0 of 0 pages") if this went out. It's an
    # uploaded file, so there's nothing of ours to re-render; ask for a
    # cleaner export instead of sending something that would break later.
    tmpl.sudo().unlink()
    att.sudo().unlink()
    raise UserError("The uploaded PDF looks intact but Odoo could not read its pages, so it would fail to "
                    "open on the signature screen. Re-export it (e.g. print to PDF instead of a direct "
                    "download) and upload it again. Nothing was sent.")
last = tmpl.num_pages
Item = env['sign.item'].sudo()
# Signature + date for the customer (left) and the company (right), bottom of
# the last page. Positions are fractions of the page; the editor lets the
# sender move them if the last page already has text there.
for role, x in ((1, 0.08), (2, 0.55)):
    Item.create({'template_id': tmpl.id, 'type_id': 1, 'responsible_id': role, 'required': True,
                 'page': last, 'posX': x, 'posY': 0.80, 'width': 0.32, 'height': 0.06})
    Item.create({'template_id': tmpl.id, 'type_id': 11, 'responsible_id': role, 'required': True,
                 'page': last, 'posX': x, 'posY': 0.87, 'width': 0.18, 'height': 0.025})
order.write({'x_custom_sign_template_id': tmpl.id, 'x_sign_request_id': False})
order.message_post(
    body='Custom agreement %s loaded into Sign as "%s". Check the signature boxes on the last page, '
         'then press Send in the Sign editor; the quotation is confirmed once everyone has signed.'
         % (fname, tmpl.name), message_type='comment', subtype_xmlid='mail.mt_note')
if order.opportunity_id:
    order.opportunity_id.sudo().message_post(body='Custom agreement prepared for signature: %s' % tmpl.name,
                                             message_type='comment', subtype_xmlid='mail.mt_note')
action = tmpl.go_to_custom_template()
""".strip()


# --- Send Contract ---------------------------------------------------------

SEND_CONTRACT_CODE = r"""
order = record
lead = order.opportunity_id
partner = order.partner_id
order.write({'x_pending_approval': False})
_acts = env['mail.activity'].sudo().search(['&', ('res_model', '=', 'sale.order'), ('res_id', '=', order.id),
                                            '|', ('summary', 'like', 'Approve and send'),
                                                 ('summary', 'like', 'returned for changes')])
if _acts:
    _acts.action_feedback(feedback='Contract sent by %s' % env.user.name)
if not partner.email:
    raise UserError("The customer has no e-mail address. Add it on the customer, then send again.")
if not partner.country_id:
    raise UserError("Set the customer's country (and province, for Canada): the sales tax on the contract depends on it.")
if partner.country_id.code == 'CA' and not partner.state_id:
    raise UserError("Set the customer's province: GST/HST on the contract depends on it.")
rcic_email = env['ir.config_parameter'].sudo().get_param('phase2.rcic_email') or ''
rcic_user = env['res.users'].sudo().search(['|', ('login', '=ilike', rcic_email), ('email', '=ilike', rcic_email)], limit=1) if rcic_email else env['res.users']
rcic = rcic_user.partner_id if rcic_user else env.user.partner_id
sb_email = env['ir.config_parameter'].sudo().get_param('phase2.sparkbridge_email') or ''
sb_user = env['res.users'].sudo().search(['|', ('login', '=ilike', sb_email), ('email', '=ilike', sb_email)], limit=1) if sb_email else env['res.users']
sb_signer = sb_user.partner_id if sb_user else (env['res.partner'].sudo().search([('email', '=ilike', sb_email)], limit=1) if sb_email else env['res.partner'])
if not sb_signer:
    sb_signer = env.user.partner_id

if order.x_custom_agreement or (order.x_custom_agreement_url or '').strip():
    action = env.ref('__trello__.p2action_send_custom').with_context(
        active_model='sale.order', active_id=order.id, active_ids=order.ids).run()
else:
    # Taxes for the customer's location, plan amounts from their shares.
    env.ref('__trello__.p2action_recalc_plan').with_context(active_model='sale.order', active_id=order.id, active_ids=order.ids).run()
    order.invalidate_recordset()

    KINDS = __KINDS__
    # A negative line is a discount, not a service: it carries no agreement tag,
    # and it belongs in the Discount row rather than in Professional Fees.
    def is_discount(l):
        return (l.product_uom_qty or 0.0) * (l.price_unit or 0.0) < 0
    billable = order.order_line.filtered(
        lambda l: not l.display_type and l.product_id and l.product_uom_qty
        and not is_discount(l)
        and not (l.product_id.default_code or '').startswith('GOV-'))
    kinds = []
    for l in billable:
        for t in l.product_id.product_tmpl_id.product_tag_ids.mapped('name'):
            if t in KINDS and t not in kinds:
                kinds.append(t)
    untagged = billable.filtered(lambda l: not (set(l.product_id.product_tmpl_id.product_tag_ids.mapped('name')) & set(KINDS)))
    if not kinds or untagged:
        raise UserError(
            "No agreement template is defined for: %s.\n\n"
            "Tag the product with its agreement (TR, PR, SPON, ENT, PFL, SB-A, SB-C, SB-D, SB-E or SB-F) under "
            "Sales > Products, or upload a custom agreement on this quotation. The contract was not sent."
            % ", ".join((untagged or billable).mapped('product_id.display_name')))

    # Amounts. Government fees are never on the contract.
    cur = order.currency_id.name
    def money(v):
        sv = '{:,.2f}'.format(v or 0.0)
        return ('$%s CAD' % sv) if cur == 'CAD' else ('€%s' % sv if cur == 'EUR' else '%s %s' % (sv, cur))
    def num(v):
        return '{:,.2f}'.format(v or 0.0)
    pro = disc = 0.0
    gov = 0.0
    codes = []
    for l in order.order_line:
        if l.display_type or not l.product_id:
            continue
        code = (l.product_id.default_code or '')
        if code.startswith('GOV-'):
            gov += l.price_subtotal
            continue
        gross = l.product_uom_qty * l.price_unit
        if gross < 0:
            disc += -gross
            continue
        if l.product_uom_qty:
            codes.append(code)
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
    plan_en, plan_fa, plan_fa_html = [], [], []
    for i, row in enumerate(rows):
        when_en, when_fa = due.get(row.x_due, due['sub_app'])
        if row.x_due == 'date':
            ds = row.x_due_date.strftime('%B %d, %Y') if row.x_due_date else '…'
            when_en, when_fa = when_en.format(date=ds), when_fa.format(date=ds)
        note = (' – ' + row.x_note) if row.x_note else ''
        plan_en.append('%s Payment – %s – %s%s' % (ord_en[i] if i < len(ord_en) else str(i + 1), money(row.x_amount), when_en, note))
        plan_fa.append('پرداخت %s – %s – %s%s' % (ord_fa[i] if i < len(ord_fa) else str(i + 1), money(row.x_amount), when_fa, note))
        # For the e-mail: the amount as an LTR run, so "$1,260.00 CAD" is not
        # reordered by the surrounding right-to-left text.
        plan_fa_html.append('پرداخت %s – <span dir="ltr">%s</span> – %s%s' % (ord_fa[i] if i < len(ord_fa) else str(i + 1), money(row.x_amount), when_fa, note))
    fee_rows_en, fee_rows_fa = [['Professional Fees', money(pro)]], [['هزینه‌های حرفه‌ای', money(pro)]]
    if gov:
        fee_rows_en.append(['Government Fees', money(gov)]); fee_rows_fa.append(['هزینه‌های دولتی', money(gov)])
    if disc:
        fee_rows_en.append(['Discount', '(%s)' % money(disc)]); fee_rows_fa.append(['تخفیف', '(%s)' % money(disc)])
    if tax:
        fee_rows_en.append(['Applicable Tax', money(tax)]); fee_rows_fa.append(['مالیات', money(tax)])
    if gov:
        fee_rows_en.append(['Total Professional Fees + Tax (excluding government fees)', money(total)])
        fee_rows_fa.append(['جمع حق‌الزحمه و مالیات (بدون هزینه‌های دولتی)', money(total)])

    # People. Names/addresses in Farsi come from the customer (or the card).
    def fa(rec, field, fallback):
        v = rec[field] if rec and field in rec._fields else False
        return v or fallback
    # The customer record is named "S26275 - Full Name" so the number shows up
    # in Odoo, the CRM and the finance sheet. The agreement is a legal document,
    # so it prints the person's name alone.
    def _no_file_no(text):
        t = (text or '').strip()
        if ' - ' in t:
            head, _sep, rest = t.partition(' - ')
            h = head.strip()
            if (h[:1] == 'S' and h[1:].isdigit()) or (h[:6] in ('SB0000', 'SG0000') and h[6:].isdigit()):
                return rest.strip()
        return t
    client_name = _no_file_no(partner.name)
    names = client_name.split(' ', 1)
    address = ', '.join(x for x in [partner.street, partner.street2, partner.city, partner.state_id.name, partner.zip, partner.country_id.name] if x)
    client_fa = _no_file_no(fa(partner, 'x_name_fa', client_name))
    addr_fa = fa(partner, 'x_address_fa', address)
    fam = env['x_family'].sudo().search([('x_lead_id', '=', lead.id)], order='x_sequence, id') if lead else env['x_family'].sudo()
    spouse = fam.filtered(lambda f: f.x_relation == 'spouse')[:1]
    kids = fam.filtered(lambda f: f.x_relation == 'child')
    comps = fam.filtered(lambda f: f.x_relation in ('spouse', 'child', 'companion'))
    # The English half of the agreement prints the customer's name as stored on the
    # customer record. A Farsi name there lands in the English section of the PDF.
    def _has_farsi(t):
        for ch in (t or ''):
            if u'\u0600' <= ch <= u'\u06FF' or u'\uFB50' <= ch <= u'\uFEFF':
                return True
        return False
    def _has_latin(t):
        for ch in (t or ''):
            if ('a' <= ch <= 'z') or ('A' <= ch <= 'Z'):
                return True
        return False
    if _has_farsi(client_name) or not _has_latin(client_name):
        raise UserError(
            "The customer is saved as \"%s\". The agreement prints that name in its English "
            "section, so it has to be the English spelling.\n\nOpen the customer and write the "
            "name in English. The Farsi spelling belongs in 'Name (Farsi)' on the CRM card, "
            "Address & family tab." % (partner.name or ''))
    # Family members named on the CRM card must be complete before a draft is generated.
    BILINGUAL = {'TR', 'PFL', 'ENT', 'SB-A', 'SB-C', 'SB-D', 'SB-E'}
    need_fa = any(k in BILINGUAL for k in kinds)
    missing = []
    for f in fam:
        if f.x_relation in ('spouse', 'child', 'companion'):
            label = {'spouse': 'Spouse', 'child': 'Child', 'companion': 'Companion'}[f.x_relation]
            if not (f.x_name_en or '').strip():
                missing.append('%s: name in English' % label)
            if need_fa and not (f.x_name_fa or '').strip():
                missing.append('%s %s: name in Farsi' % (label, (f.x_name_en or '').strip()))
    if need_fa and 'x_name_fa' in partner._fields and not (partner.x_name_fa or '').strip():
        missing.append("Client %s: name in Farsi (on the CRM card, Address & family tab)" % client_name)
    if missing:
        raise UserError("The draft was not generated. Complete the family members on the CRM card "
                        "(Address & family tab):\n- " + "\n- ".join(missing))
    parties_en = 'the Client, %s' % client_name
    parties_fa = 'متقاضی، %s' % client_fa
    if spouse:
        parties_en += ', and the accompanying spouse, %s' % spouse.x_name_en
        parties_fa += '، و همسر همراه، %s' % (spouse.x_name_fa or spouse.x_name_en)
    if kids:
        parties_en += (', and the dependent child, ' if len(kids) == 1 else ', and the dependent children, ') + ' and '.join(kids.mapped('x_name_en'))
        parties_fa += ('، و فرزند وابسته، ' if len(kids) == 1 else '، و فرزندان وابسته، ') + ' و '.join([k.x_name_fa or k.x_name_en for k in kids])
    services = [l.product_id.name for l in billable]
    services_en = [n.split(' · ')[0].strip() for n in services]
    services_fa = [n.split(' · ')[1].strip() if ' · ' in n else n for n in services]
    main = codes[0] if codes else ''
    if main.startswith(('SP', 'PGWP')):
        bio_en, bio_fa = 'Give biometrics on time as required for the study permit application.', 'ارائه بیومتریک به‌موقع، طبق نیاز برای درخواست مجوز تحصیل.'
    elif main.startswith(('WP', 'LMIA', 'OWP', 'IN-WP', 'PERMIT')):
        bio_en, bio_fa = 'Give biometrics on time as required for the work permit application.', 'ارائه بیومتریک به‌موقع، طبق نیاز برای درخواست مجوز کار.'
    elif main.startswith(('EE', 'PNP', 'SPON', 'HC')):
        bio_en, bio_fa = 'Give biometrics on time as required for PR application.', 'ارائه بیومتریک به‌موقع، طبق نیاز برای درخواست اقامت دائم.'
    else:
        bio_en, bio_fa = 'Give biometrics on time as required for the application.', 'ارائه بیومتریک به‌موقع، طبق نیاز برای درخواست.'
    today = datetime.date.today()
    date_en = today.strftime('%B %d, %Y')
    subject_en = (order.x_agr_subject or '').strip() or (services_en[0] if services_en else '')
    subject_fa = (order.x_agr_subject_fa or '').strip() or (services_fa[0] if services_fa else '')
    sponsor = order.x_sponsor_id
    def phone_no(v):
        # The CRM card keeps a leading 9 so the VoIP bar can grab an outside
        # line. The contract must print the real number, so drop it.
        t = (v or '').strip()
        if t.startswith('90'):
            t = t[1:]
        return t
    client_phone = phone_no(partner.mobile or partner.phone or '')
    contact_en = ['Full Name: %s' % client_name, 'Residential Address: %s' % address,
                  'Telephone/Cellphone Number: %s' % client_phone, 'E-mail: %s' % (partner.email or '')]
    if 'SPON' in kinds:
        contact_en = ['Principal Applicant’s name: %s' % client_name, 'Sponsor’s name: %s' % _no_file_no(sponsor.name if sponsor else '')] + contact_en[1:]
    contact_fa = ['نام و نام خانوادگی: %s' % client_fa, 'آدرس محل سکونت: %s' % addr_fa,
                  'شماره تلفن/موبایل: %s' % client_phone, 'ایمیل: %s' % (partner.email or '')]
    scope = __SCOPE__
    sc = scope.get(main, scope.get('BC-ENT'))
    d = {
        'file_no': '', 'date_en': date_en, 'date_fa': date_en,
        'client_en': client_name, 'client_fa': client_fa, 'addr_en': address, 'addr_fa': addr_fa,
        'phone': client_phone, 'email': partner.email or '',
        'nid': fa(partner, 'x_national_id', '—'),
        'parties_en': parties_en, 'parties_fa': parties_fa,
        'services_en': services_en, 'services_fa': services_fa,
        'currency_en': 'Canadian Dollars' if cur == 'CAD' else ('Euros' if cur == 'EUR' else cur),
        'currency_fa': 'دلار کانادا' if cur == 'CAD' else ('یورو' if cur == 'EUR' else cur),
        'fee_rows_en': fee_rows_en, 'fee_rows_fa': fee_rows_fa, 'total': money(total + gov) if gov else money(total),
        'schedule_en': plan_en, 'schedule_fa': plan_fa,
        'contact_en': contact_en, 'contact_fa': contact_fa, 'rcic_email': env['ir.config_parameter'].sudo().get_param('phase2.rcic_contract_email') or 'Legal@sugimotovisa.com',
        'bio_en': bio_en, 'bio_fa': bio_fa,
        'program_en': subject_en, 'program_fa': subject_fa, 'subject_en': subject_en, 'subject_fa': subject_fa,
        'ref': order.x_agr_ref or '', 'letter_date': order.x_agr_date.strftime('%B %d, %Y') if order.x_agr_date else '',
        'deadline': order.x_agr_deadline.strftime('%B %d, %Y') if order.x_agr_deadline else '',
        'internal_deadline': order.x_agr_deadline2.strftime('%B %d, %Y') if order.x_agr_deadline2 else '',
        'scope_en': sc[0], 'scope_fa': sc[1],
        'sponsor_en': sponsor.name if sponsor else '',
        'country_en': order.x_agr_subject or partner.country_id.name or '', 'country_fa': order.x_agr_subject_fa or '',
        'companions_en': ', '.join(comps.mapped('x_name_en')) or '—', 'companions_fa': '، '.join([c.x_name_fa or c.x_name_en for c in comps]) or '—',
        'fee_total': num(pro - disc), 'p1': num(rows[0].x_amount) if rows else '', 'p2': num(rows[1].x_amount) if len(rows) > 1 else '',
        'inst_en': ['%s Euro %s' % (num(r.x_amount), due.get(r.x_due, due['sub_app'])[0]) for r in rows],
        'inst_fa': ['مبلغ %s یورو %s' % (num(r.x_amount), due.get(r.x_due, due['sub_app'])[1]) for r in rows],
    }
    if 'PR' in kinds and not order.x_agr_subject:
        d['program_en'] = 'Permanent Residence Application by following the program: %s' % (services_en[0] if services_en else '')
    if 'SPON' in kinds:
        if not sponsor:
            raise UserError("Choose the Sponsor on the quotation (Agreement details) before sending a sponsorship agreement.")
        if not order.x_agr_subject:
            d['program_en'] = 'the Permanent Residence Application under the %s program' % (services_en[0] if services_en else 'sponsorship')
    if 'PFL' in kinds and not (order.x_agr_date and order.x_agr_deadline and order.x_agr_deadline2 and order.x_agr_subject):
        raise UserError("For a PFL agreement fill in Agreement details on the quotation: the application concerned (EN and FA), IRCC reference, letter date, IRCC deadline and the internal document deadline.")

    # Contract number: Sparkbridge files count on the Sparkbridge sequence
    # (SB0000yyNNN); a combined entrepreneur file carries SG0000yyNNN with the
    # same digits on the Sugimoto part; everything else on the Sugimoto
    # sequence (SyyNNN). Assigned once, kept on re-sends.
    if not (order.client_order_ref or '').strip():
        seq_code = 'x_sparkbridge_contract' if any(k.startswith('SB-') for k in kinds) else 'x_sugimoto_file'
        number = env['ir.sequence'].sudo().next_by_code(seq_code)
        if not number:
            raise UserError("The contract number sequence %s is not set up." % seq_code)
        order.write({'client_order_ref': number})
    file_no = order.client_order_ref.strip()
    def file_no_for(kind):
        if kind == 'ENT' and file_no.startswith('SB0000'):
            return 'SG0000' + file_no[6:]
        return file_no

    # One agreement per kind (the entrepreneur streams send two: Sugimoto + Sparkbridge).
    for prev in [order.x_sign_request_id, order.x_sign_request2_id]:
        if prev and prev.state not in ('signed', 'canceled'):
            prev.sudo().cancel()
    boxes = __BOXES__
    # The agents on the file are copied: they cannot be CC'd on the client's own
    # e-mail (each signer gets a private signing link), so they get their own
    # copy of the very same PDF below, and they are on "Copy to" of the
    # signature request so Odoo sends them the signed original automatically.
    agents = []
    for u in [order.user_id, lead.user_id if lead else False]:
        if u and u.id != env.user.id and u.id not in [a.id for a in agents]:
            agents.append(u)
    cc_ids = [u.partner_id.id for u in agents if u.partner_id]
    # The agents on the file also go on CC of the client's own e-mail and on
    # its Reply-To (picked up by the "contract e-mail CC" automation while the
    # mail is being created), so the client sees them and a reply reaches them.
    cc_emails = []
    for u in [order.user_id, lead.user_id if lead else False]:
        if u and u.email and u.email.lower() not in [e.lower() for e in cc_emails]:
            cc_emails.append(u.email)
    requests = []
    sent_atts = []
    for kind in kinds:
        is_sb = kind.startswith('SB-')
        company_name = 'Sparkbridge Incubator Ltd.' if is_sb else 'Sugimoto Visa'
        d['title'] = 'Service Agreement' if kind in ('SB-A', 'SB-F') else ('Retainer Agreement' if kind != 'ENT' else 'Retainer Agreement / قرارداد مشاوره')
        d['file_no'] = file_no_for(kind)
        d['file_label'] = ('Contract No %s' % d['file_no']) if is_sb else ('RCIC R713046 · Client File %s' % d['file_no'])
        def _render():
            pdf, _t = env['ir.actions.report'].sudo()._render_qweb_pdf('x_agreement.' + kind, [order.id], data={'d': d})
            if not pdf or not bytes(pdf).startswith(b'%PDF') or not bytes(pdf).rstrip().endswith(b'%%EOF'):
                raise UserError("The %s agreement for %s did not render into a valid PDF. Nothing was sent; "
                                "try again, or tell IT." % (kind, order.name))
            return pdf
        fname = '%s - %s - %s.pdf' % (d['file_no'], d['title'], client_name)
        pdf = _render()
        att = env['ir.attachment'].sudo().create({'name': fname, 'datas': b64encode(pdf), 'mimetype': 'application/pdf', 'res_model': 'sign.template'})
        tmpl = env['sign.template'].sudo().create({'attachment_id': att.id, 'name': '%s – %s – %s' % (d['file_no'], kind, client_name)})
        att.write({'res_id': tmpl.id})
        if not tmpl.num_pages:
            # Odoo's own PDF library could not read the page count, which is
            # exactly what makes the Sign screen fail to load later ("0 of 0
            # pages"). Rather than send a document that will break in the
            # signer's browser, discard it and render once more before
            # giving up with a clear, retryable error.
            tmpl.sudo().unlink()
            att.sudo().unlink()
            pdf = _render()
            att = env['ir.attachment'].sudo().create({'name': fname, 'datas': b64encode(pdf), 'mimetype': 'application/pdf', 'res_model': 'sign.template'})
            tmpl = env['sign.template'].sudo().create({'attachment_id': att.id, 'name': '%s – %s – %s' % (d['file_no'], kind, client_name)})
            att.write({'res_id': tmpl.id})
            if not tmpl.num_pages:
                tmpl.sudo().unlink()
                att.sudo().unlink()
                raise UserError("The %s agreement for %s rendered, but Odoo could not read its pages, so it "
                                "would fail to open on the signature screen. Nothing was sent; try Send "
                                "Contract again, or tell IT." % (kind, order.name))
        last = tmpl.num_pages
        # A plain, verified copy on the quotation itself: if the signature
        # screen ever fails to load the document, the agent or RCIC can
        # still open the identical PDF straight from the quotation's
        # attachments without depending on the Sign app at all.
        sent_atts.append(env['ir.attachment'].sudo().create({
            'name': 'SENT %s' % fname, 'datas': b64encode(pdf), 'mimetype': 'application/pdf',
            'res_model': 'sale.order', 'res_id': order.id}))
        Item = env['sign.item'].sudo()
        layout = boxes['spon'] if kind == 'SPON' else boxes['page']
        role_of = {'client': 1, 'client_date': 1, 'sponsor': __SPONSOR_ROLE__, 'sponsor_date': __SPONSOR_ROLE__, 'company': 2, 'company_date': 2}
        for key, (x, y, w, h) in layout.items():
            Item.create({'template_id': tmpl.id, 'type_id': 11 if key.endswith('_date') else 1, 'responsible_id': role_of[key],
                         'required': True, 'page': last, 'posX': x, 'posY': y, 'width': w, 'height': h})
        signer = sb_signer if is_sb else rcic
        items = [(0, 0, {'partner_id': partner.id, 'role_id': 1, 'mail_sent_order': 1}),
                 (0, 0, {'partner_id': signer.id, 'role_id': 2, 'mail_sent_order': 2})]
        if kind == 'SPON':
            items.append((0, 0, {'partner_id': sponsor.id, 'role_id': __SPONSOR_ROLE__, 'mail_sent_order': 1}))
        # Odoo Sign builds the signer's e-mail from the request's author: the
        # From address and, more importantly, the Reply-To. Authoring it as the
        # legal@ / contract@ identity is what makes a client's reply come back
        # to a mailbox Odoo reads instead of to whoever pressed Send.
        sender_email = env['ir.config_parameter'].sudo().get_param(
            'phase2.sb_mail_from' if is_sb else 'phase2.sg_mail_from') or ''
        sender = env['res.users'].sudo().with_context(active_test=False).search(
            ['|', ('login', '=ilike', sender_email), ('email', '=ilike', sender_email)], limit=1) if sender_email else env['res.users']
        Request = env['sign.request'].with_user(sender.id).sudo() if sender else env['sign.request'].sudo()
        # Existing contacts may still be on Farsi: Odoo's mail frame around the
        # e-mail is only half translated, so the client's mail language is English.
        if partner.lang != 'en_US':
            partner.sudo().write({'lang': 'en_US'})
        # The client's e-mail (template C2 of the e-mail catalogue). Odoo Sign
        # renders it as the body of the signing e-mail, above the Sign button;
        # the layout around it is the __trello__ override of the Sign template.
        if is_sb:
            signer_fa = 'شرکت <span dir="ltr">Sparkbridge Incubator Ltd.</span>'
            signer_en = 'Sparkbridge Incubator Ltd.'
        else:
            signer_fa = 'جناب آقای حامد سوگیموتو، مشاور رسمی مهاجرت کانادا (RCIC R713046)'
            signer_en = 'Hamed Sugimoto, RCIC R713046'
        service_fa = ' و '.join(services_fa)
        service_en = ', '.join(services_en)
        msg = (
            '<div dir="rtl" style="text-align:right; line-height:1.9;">'
            '<p>سرکار خانم / جناب آقای %(client_fa)s<br/>با سلام و احترام،</p>'
            '<p>قرارداد شماره <b dir="ltr">%(no)s</b> برای خدمت «%(service_fa)s» آماده امضای الکترونیکی شماست.</p>'
            '<p>لطفاً روی دکمه «امضای قرارداد» در همین ایمیل کلیک کرده، قرارداد را مطالعه و به‌صورت آنلاین امضا بفرمایید. '
            'نیازی به چاپ، اسکن یا ارسال مجدد فایل نیست. پس از امضای شما، قرارداد از سوی %(signer_fa)s امضا می‌شود و '
            'نسخه نهایی امضاشده به‌صورت خودکار برای شما ایمیل خواهد شد.</p>'
            '<p><b>مبلغ قرارداد:</b> <span dir="ltr">%(total)s</span><br/><b>برنامه پرداخت:</b></p><ul>%(plan_fa)s</ul>'
            '<p>نکته: اگر صفحه امضا در مرورگر شما باز نشد، لطفاً با مرورگر Chrome امتحان کنید یا با پاسخ به همین ایمیل به ما اطلاع دهید.</p>'
            '<p>در صورت هرگونه سؤال، با پاسخ به همین ایمیل در خدمت شما هستیم.</p>'
            '</div>'
            '<hr style="border:none; border-top:1px solid #ddd; margin:16px 0;"/>'
            '<div dir="ltr" style="text-align:left; line-height:1.6; color:#444;">'
            '<p>Dear %(client_en)s,</p>'
            '<p>Your %(title)s No. <b>%(no)s</b> for "%(service_en)s" is ready for your electronic signature. '
            'Click "Sign document" below to review and sign it online; there is nothing to print or scan. '
            'After you sign, %(signer_en)s countersigns and the final signed copy is e-mailed to you automatically.</p>'
            '<p><b>Contract amount:</b> %(total)s<br/><b>Payment plan:</b></p><ul>%(plan_en)s</ul>'
            '<p>If the signing page does not open, please try Google Chrome or reply to this e-mail.</p>'
            '</div>'
            '%(pay)s'
        ) % {
            # Payment instructions live in a system parameter (Settings >
            # Technical > Parameters) so finance can change them without IT.
            'pay': env['ir.config_parameter'].sudo().get_param(
                'phase2.sb_payment_html' if is_sb else 'phase2.sg_payment_html') or '',
            'client_fa': client_fa, 'client_en': client_name, 'no': d['file_no'], 'title': d['title'],
            'service_fa': service_fa, 'service_en': service_en, 'signer_fa': signer_fa, 'signer_en': signer_en,
            'total': money(total),
            'plan_fa': ''.join('<li>%s</li>' % p for p in plan_fa_html),
            'plan_en': ''.join('<li>%s</li>' % p for p in plan_en),
        }
        req = Request.with_context(no_sign_mail=True).create({
            'template_id': tmpl.id,
            'reference': '%s – %s – %s' % (d['file_no'], d['title'], client_name),
            'subject': '%s with %s – please review and sign' % (d['title'], company_name),
            'message': msg,
            'request_item_ids': items,
        })
        # "Copy to" on a signature request is read-only: Odoo computes it from the
        # followers, minus the signers. Following the request is therefore what
        # puts the agents on it, and gets them the signed original.
        if cc_ids:
            req.sudo().message_subscribe(partner_ids=cc_ids)
        mail_ctx = {}
        if cc_emails:
            mail_ctx = {'p2_mail_cc': ', '.join(cc_emails),
                        'p2_mail_reply_to': ', '.join(([sender.email_formatted] if sender and sender.email else []) + cc_emails)}
        req.with_context(**mail_ctx).send_signature_accesses()
        requests.append(req)
    order.write({'x_sign_request_id': requests[0].id, 'x_sign_request2_id': requests[1].id if len(requests) > 1 else False,
                 'x_agreement_kinds': ', '.join(kinds)})
    # The finance sheet's row, worked out here rather than in n8n so the fee and
    # payment-plan logic lives in exactly one place. n8n reads these fields and
    # pushes the row; it clears nothing and recomputes nothing.
    relation_label = {'spouse': 'Couple', 'child': 'Child', 'companion': 'Companion'}
    n_spouse = len(fam.filtered(lambda f: f.x_relation == 'spouse'))
    n_kids = len(fam.filtered(lambda f: f.x_relation == 'child'))
    if not n_spouse and not n_kids:
        accompanying = 'Single'
    elif n_spouse and not n_kids:
        accompanying = 'Couple'
    elif n_spouse and n_kids:
        accompanying = 'Couple + %dKid%s' % (n_kids, '' if n_kids == 1 else 's')
    else:
        accompanying = 'Single + %dKid%s' % (n_kids, '' if n_kids == 1 else 's')
    kids = fam.filtered(lambda f: f.x_relation == 'child')
    spouse_row = fam.filtered(lambda f: f.x_relation == 'spouse')[:1]
    plan_short = ' + '.join('%s %s' % (num(r.x_amount), due.get(r.x_due, due['sub_app'])[0]) for r in rows)
    order.sudo().write({
        'x_sheet_pro': pro, 'x_sheet_gov': gov, 'x_sheet_disc': disc,
        'x_sheet_tax': tax, 'x_sheet_total': total,
        'x_sheet_plan': plan_short[:255],
        'x_sheet_kinds': ', '.join(kinds),
        'x_sheet_accompanying': accompanying,
        'x_sheet_type': (codes[0] if codes else ''),
        'x_sheet_rcic': rcic.name or '',
        'x_sheet_spouse': (spouse_row.x_name_en or spouse_row.x_name_fa or '') if spouse_row else '',
        'x_sheet_child1': (kids[0].x_name_en or kids[0].x_name_fa or '') if len(kids) > 0 else '',
        'x_sheet_child2': (kids[1].x_name_en or kids[1].x_name_fa or '') if len(kids) > 1 else '',
        'x_sheet_child3': (kids[2].x_name_en or kids[2].x_name_fa or '') if len(kids) > 2 else '',
        'x_sheet_sent_date': datetime.date.today(),
        # A positive marker rather than an empty value: the sync job filters on
        # this, and Odoo does not match '' against an empty text column.
        'x_sheet_synced': 'pending',
        # The rest of the row, so the sync job needs one read and one write and
        # never has to reassemble a client from four models.
        'x_sheet_company': 'SB' if any(k.startswith('SB-') for k in kinds) else 'SG',
        'x_sheet_contract_no': file_no,
        'x_sheet_display': partner.name or '',
        'x_sheet_name': names[0] if names else '',
        'x_sheet_family': names[1] if len(names) > 1 else '',
        'x_sheet_email': partner.email or '',
        'x_sheet_phone': client_phone or '',
        'x_sheet_address': address or '',
        'x_sheet_name_fa': client_fa or '',
        'x_sheet_address_fa': addr_fa or '',
        'x_sheet_agent': (lead.user_id.name if lead and lead.user_id else (order.user_id.name or '')),
        'x_sheet_country': partner.country_id.name or '',
        'x_sheet_passport': (partner.x_national_id or '') if 'x_national_id' in partner._fields else '',
        'x_sheet_spouse_fa': (spouse_row.x_name_fa or '') if spouse_row else '',
        'x_sheet_child1_fa': (kids[0].x_name_fa or '') if len(kids) > 0 else '',
        'x_sheet_child2_fa': (kids[1].x_name_fa or '') if len(kids) > 1 else '',
    })

    summary = 'Professional fees %s, discount %s, tax %s, contract total %s (government fees %s, excluded). Payment plan: %s' % (
        money(pro), money(disc), money(tax), money(total), money(gov), '; '.join(plan_en))
    order.message_post(body='Agreement(s) %s generated and sent for signature (the client signs first, then %s): %s. %s' % (
        ', '.join(kinds), rcic.name, '; '.join(r.reference for r in requests), summary), message_type='comment', subtype_xmlid='mail.mt_note')
    # A copy for the agents who own the file, with the same PDF the client got.
    if agents:
        base_url = env['ir.config_parameter'].sudo().get_param('web.base.url') or ''
        agent_body = ('<p>The %s for <strong>%s</strong> (%s) has been e-mailed to '
                      '<strong>%s</strong> for signature.</p>'
                      '<p>The client signs first, then %s. The signed original will reach you '
                      'automatically once everyone has signed.</p>'
                      '<p>Attached is the very same document the client received.</p>'
                      '<p><a href="%s/web#id=%s&model=sale.order&view_type=form">Open %s</a></p>') % (
                         ' and '.join(r.reference for r in requests), client_name, file_no,
                         partner.email or 'the client', rcic.name, base_url, order.id, order.name)
        for u in agents:
            if not u.email:
                continue
            env['mail.mail'].sudo().create({
                'subject': 'Contract sent to %s (%s)' % (client_name, file_no),
                'body_html': agent_body, 'email_to': u.email, 'auto_delete': False,
                'model': 'sale.order', 'res_id': order.id,
                'attachment_ids': [(6, 0, [a.id for a in sent_atts])],
            }).send()
    if lead:
        lead.sudo().message_post(body='Agreement sent for signature: %s' % '; '.join(r.reference for r in requests),
                                 message_type='comment', subtype_xmlid='mail.mt_note')
        # The client is the first signer, so the agreement is in their inbox now:
        # move the card on to "13- Draft Contract Sent". Forward only, so
        # resending never rewinds a card that is already signed or further along.
        sent_stage = env['crm.stage'].sudo().search([('name', '=like', '13-%')], limit=1)
        if sent_stage and lead.stage_id and lead.stage_id.sequence < sent_stage.sequence:
            lead.sudo().with_context(skip_stage_gate=True).write({'stage_id': sent_stage.id})
    action = {'type': 'ir.actions.act_window', 'res_model': 'sign.request', 'res_id': requests[0].id,
              'view_mode': 'form', 'views': [[False, 'form']], 'target': 'current'}
""".strip().replace("__DUE__", repr(DUE)).replace("__ORD_EN__", repr(ORDINALS_EN)).replace("__ORD_FA__", repr(ORDINALS_FA)).replace("__KINDS__", repr(KINDS)).replace("__SCOPE__", repr(ENT_SCOPE)).replace("__BOXES__", repr(SIGN_BOXES))


# When everyone has signed: confirm the quotation (the existing automation
# then moves the card) and file the signed PDF on the card and the quotation.
SIGNED_CODE = r"""
for req in records:
    if req.state != 'signed':
        continue
    order = env['sale.order'].sudo().search([('x_sign_request_id', '=', req.id)], limit=1)
    if not order and req.template_id:
        order = env['sale.order'].sudo().search([('x_custom_sign_template_id', '=', req.template_id.id)], limit=1)
        if order:
            order.write({'x_sign_request_id': req.id})
    if not order:
        continue
    attachments = req.completed_document_attachment_ids
    for target in [order] + ([order.opportunity_id] if order.opportunity_id else []):
        for att in attachments:
            copy = att.sudo().copy({'res_model': target._name, 'res_id': target.id})
            target.sudo().message_post(body='Signed retainer agreement: %s' % req.reference,
                                       attachment_ids=[copy.id], message_type='comment',
                                       subtype_xmlid='mail.mt_note')
    others = [r for r in [order.x_sign_request_id, order.x_sign_request2_id] if r and r.id != req.id]
    if any(o.state != 'signed' for o in others):
        continue
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


# --- Preview Agreement -----------------------------------------------------
# The approver has to read the draft before approving it. Preview reuses the
# send action's data-building half verbatim (so the PDF is byte-identical to
# what would be sent), then renders to an attachment instead of creating a
# Sign request. It never draws a contract number and never touches the client.

PREVIEW_TAIL = r"""
    file_no = (order.client_order_ref or '').strip() or 'DRAFT'
    def file_no_for(kind):
        if kind == 'ENT' and file_no.startswith('SB0000'):
            return 'SG0000' + file_no[6:]
        return file_no

    _att = env['ir.attachment'].sudo()
    made = []
    for kind in kinds:
        is_sb = kind.startswith('SB-')
        d['title'] = 'Service Agreement' if kind in ('SB-A', 'SB-F') else ('Retainer Agreement' if kind != 'ENT' else 'Retainer Agreement / قرارداد مشاوره')
        d['file_no'] = file_no_for(kind)
        d['file_label'] = ('Contract No %s' % d['file_no']) if is_sb else ('RCIC R713046 · Client File %s' % d['file_no'])
        pdf, _t = env['ir.actions.report'].sudo()._render_qweb_pdf('x_agreement.' + kind, [order.id], data={'d': d})
        if not pdf or not bytes(pdf).startswith(b'%PDF'):
            raise UserError("The %s agreement did not render into a valid PDF." % kind)
        name = 'PREVIEW %s - %s - %s.pdf' % (d['file_no'], d['title'], client_name)
        old = _att.search([('res_model', '=', 'sale.order'), ('res_id', '=', order.id), ('name', '=', name)])
        if old:
            old.unlink()
        made.append(_att.create({'name': name, 'datas': b64encode(pdf), 'mimetype': 'application/pdf',
                                 'res_model': 'sale.order', 'res_id': order.id}))
    if len(made) == 1:
        action = {'type': 'ir.actions.act_url', 'target': 'new',
                  # No download parameter: Odoo treats *any* value of `download` as true
                  # (the string 'false' is truthy), which sets Content-Disposition:
                  # attachment and makes the browser download instead of display.
                  'url': '/web/content/%s' % made[0].id}
    else:
        order.message_post(body='Draft agreements attached for review: %s' % ', '.join(m.name for m in made),
                           attachment_ids=[m.id for m in made], message_type='comment', subtype_xmlid='mail.mt_note')
        action = {'type': 'ir.actions.act_url', 'target': 'new',
                  # No download parameter: Odoo treats *any* value of `download` as true
                  # (the string 'false' is truthy), which sets Content-Disposition:
                  # attachment and makes the browser download instead of display.
                  'url': '/web/content/%s' % made[0].id}
""".rstrip()


def _preview_code(sponsor_role):
    """Build the Preview action from the send action's data-building half."""
    lines = SEND_CONTRACT_CODE.replace("__SPONSOR_ROLE__", str(int(sponsor_role))).split("\n")
    cut = next(i for i, l in enumerate(lines) if "# Contract number:" in l)
    head = "\n".join(lines[:cut])
    # Drop the parts that only make sense when actually sending.
    for gone in ("order.write({'x_pending_approval': False})\n",):
        head = head.replace(gone, "")
    a = head.index("_acts = env['mail.activity']")
    b = head.index("if not partner.email:")
    head = head[:a] + head[b:]
    # A custom upload has nothing to render: point at the file on the form.
    fork_old = ("if order.x_custom_agreement or (order.x_custom_agreement_url or '').strip():\n"
                "    action = env.ref('__trello__.p2action_send_custom').with_context(\n"
                "        active_model='sale.order', active_id=order.id, active_ids=order.ids).run()\n"
                "else:")
    fork_new = ("if order.x_custom_agreement:\n"
                "    raise UserError(\"This quotation uses a custom agreement. Open the 'Custom agreement (PDF)' \"\n"
                "                    \"field on this form to read it.\")\n"
                "if False:\n"
                "    pass\n"
                "else:")
    assert fork_old in head, "custom-agreement fork not found"
    head = head.replace(fork_old, fork_new, 1)
    return head + PREVIEW_TAIL


def _sync_selection(odoo, model, name, options):
    """Add missing options to an existing manual selection field (in order)."""
    fid = odoo.search_read("ir.model.fields", [("model", "=", model), ("name", "=", name)], ["id"], limit=1)
    if not fid:
        return
    fid = fid[0]["id"]
    have = {r["value"]: r["id"] for r in odoo.search_read("ir.model.fields.selection", [("field_id", "=", fid)], ["value"])}
    for i, (value, label) in enumerate(options):
        if value in have:
            odoo.write("ir.model.fields.selection", [have[value]], {"name": label, "sequence": i})
        else:
            odoo.execute("ir.model.fields.selection", "create", {"field_id": fid, "value": value, "name": label, "sequence": i})


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
    _sync_selection(odoo, PLAN_MODEL, "x_share", SHARES)
    _sync_selection(odoo, PLAN_MODEL, "x_due", DUE_LABELS)
    _field(odoo, PLAN_MODEL, "x_due_date", {"field_description": "Date", "ttype": "date"})
    _field(odoo, PLAN_MODEL, "x_note", {"field_description": "Note (printed)", "ttype": "char"})
    _field(odoo, "sale.order", PLAN_FIELD, {
        "field_description": "Payment plan", "ttype": "one2many", "relation": PLAN_MODEL,
        "relation_field": "x_order_id", "copied": True})
    _field(odoo, "product.template", "x_default_plan", {
        "field_description": "Default payment plan",
        "help": "Proposed on new quotations: share:amount:due per instalment, separated by ';'. "
                "share = percentage, rest or custom; due = a key of the plan's Due list.",
        "ttype": "char"})
    group = odoo.search_read("ir.model.data", [("module", "=", "base"), ("name", "=", "group_user")],
                             ["res_id"], limit=1)[0]["res_id"]
    odoo.upsert("p2access", PLAN_MODEL, "ir.model.access", {
        "name": "x_pay_plan user", "model_id": model_id, "group_id": group,
        "perm_read": True, "perm_write": True, "perm_create": True, "perm_unlink": True})
    recalc = _server_action(odoo, "recalc_plan", {
        "name": "Recalculate payment plan", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": RECALC_CODE, "binding_model_id": False})
    # A quotation built from a quotation template gets the service's default
    # plan right away (the Recalculate action only fills an empty plan).
    tmpl_field = odoo.search_read("ir.model.fields", [("model", "=", "sale.order"),
                                                      ("name", "=", "sale_order_template_id")], ["id"], limit=1)
    if tmpl_field:
        auto_vals = {"name": "Phase 2: quotation template chosen -> default payment plan",
                     "model_id": _model_id(odoo, "sale.order"), "trigger": "on_create_or_write",
                     "trigger_field_ids": [(6, 0, [tmpl_field[0]["id"]])],
                     "filter_domain": "[('sale_order_template_id', '!=', False), ('state', 'in', ('draft', 'sent'))]",
                     "action_server_ids": [(6, 0, [recalc])], "active": True}
        auto = odoo.ref("p2auto", "default_plan")
        if auto:
            odoo.write("base.automation", [auto], auto_vals)
        else:
            odoo.upsert("p2auto", "default_plan", "base.automation", auto_vals)
    return recalc


SPARKBRIDGE_SIGNER = "ken@sparkbridge.ca"   # signs the Sparkbridge agreements


# Contract team: only these logins may press Send/Resend Contract. Everyone
# else gets "Submit for Approval" instead — it notifies this group and does
# not itself send anything to the client.
APPROVERS = [
    ("z.ghasemi.sugimoto@gmail.com", "Zeinab Ghasemi"),
    ("iman.alinejad.einalou@gmail.com", "Iman Alinejad"),
    ("aban.teymouri@sparkbridge.ca", "Aban Teymoury"),
    ("l.fathi@team.sugimotogroup.org", "Leila Fathi"),
    ("yusugimoto7@gmail.com", "Yu Sugimoto"),
    ("sugimoto.ken@gmail.com", "Ken Sugimoto"),
    ("nima@sparkbridge.ca", "Nima"),
]

# Of the approvers above, only these get an e-mail when a contract is
# submitted. The rest still get the Odoo to-do activity and the chatter
# message, so the request is waiting for them when they next open Odoo,
# but their inbox stays quiet.
EMAIL_APPROVERS = [
    "z.ghasemi.sugimoto@gmail.com",   # Zeinab Ghasemi
    "iman.alinejad.einalou@gmail.com",  # Iman Alinejad
    "aban.teymouri@sparkbridge.ca",   # Aban Teymoury
    "l.fathi@team.sugimotogroup.org",  # Leila Fathi
]

SUBMIT_APPROVAL_CODE = r"""
order = record
partner = order.partner_id
if not partner.email:
    raise UserError("The customer has no e-mail address. Add it on the customer, then submit again.")
if not partner.country_id:
    raise UserError("Set the customer's country (and province, for Canada) before submitting for approval.")
if partner.country_id.code == 'CA' and not partner.state_id:
    raise UserError("Set the customer's province before submitting for approval.")
billable = order.order_line.filtered(lambda l: not l.display_type and l.product_id and l.product_uom_qty
    and (l.product_uom_qty or 0.0) * (l.price_unit or 0.0) >= 0
    and not (l.product_id.default_code or '').startswith('GOV-'))
has_custom = bool(order.x_custom_agreement) or bool((order.x_custom_agreement_url or '').strip())
if not billable and not has_custom:
    raise UserError("Add at least one service line, or upload a custom agreement, before submitting for approval.")
if billable and not has_custom:
    tags = set(billable.mapped('product_id.product_tmpl_id.product_tag_ids.name'))
    known = {'TR', 'PR', 'SPON', 'ENT', 'PFL', 'SB-A', 'SB-C', 'SB-D', 'SB-E', 'SB-F'}
    if not (tags & known):
        raise UserError("No agreement template is defined for this service. Tag the product under Sales > "
                         "Products, or upload a custom agreement on this quotation.")
    if not env['x_pay_plan'].sudo().search_count([('x_order_id', '=', order.id)]):
        raise UserError("Add a payment plan before submitting for approval.")
    kinds = sorted(tags & known)
    lead = order.opportunity_id
    fam = env['x_family'].sudo().search([('x_lead_id', '=', lead.id)], order='x_sequence, id') if lead else env['x_family'].sudo()
    # The customer record is named "S26275 - Full Name"; the check below is about
    # the person's name, so strip the file number first.
    def _no_file_no(text):
        t = (text or '').strip()
        if ' - ' in t:
            head, _sep, rest = t.partition(' - ')
            h = head.strip()
            if (h[:1] == 'S' and h[1:].isdigit()) or (h[:6] in ('SB0000', 'SG0000') and h[6:].isdigit()):
                return rest.strip()
        return t
    client_name = _no_file_no(partner.name)
    # The English half of the agreement prints the customer's name as stored on the
    # customer record. A Farsi name there lands in the English section of the PDF.
    def _has_farsi(t):
        for ch in (t or ''):
            if u'\u0600' <= ch <= u'\u06FF' or u'\uFB50' <= ch <= u'\uFEFF':
                return True
        return False
    def _has_latin(t):
        for ch in (t or ''):
            if ('a' <= ch <= 'z') or ('A' <= ch <= 'Z'):
                return True
        return False
    if _has_farsi(client_name) or not _has_latin(client_name):
        raise UserError(
            "The customer is saved as \"%s\". The agreement prints that name in its English "
            "section, so it has to be the English spelling.\n\nOpen the customer and write the "
            "name in English. The Farsi spelling belongs in 'Name (Farsi)' on the CRM card, "
            "Address & family tab." % (partner.name or ''))
    # Family members named on the CRM card must be complete before a draft is generated.
    BILINGUAL = {'TR', 'PFL', 'ENT', 'SB-A', 'SB-C', 'SB-D', 'SB-E'}
    need_fa = any(k in BILINGUAL for k in kinds)
    missing = []
    for f in fam:
        if f.x_relation in ('spouse', 'child', 'companion'):
            label = {'spouse': 'Spouse', 'child': 'Child', 'companion': 'Companion'}[f.x_relation]
            if not (f.x_name_en or '').strip():
                missing.append('%s: name in English' % label)
            if need_fa and not (f.x_name_fa or '').strip():
                missing.append('%s %s: name in Farsi' % (label, (f.x_name_en or '').strip()))
    if need_fa and 'x_name_fa' in partner._fields and not (partner.x_name_fa or '').strip():
        missing.append("Client %s: name in Farsi (on the CRM card, Address & family tab)" % client_name)
    if missing:
        raise UserError("The draft was not generated. Complete the family members on the CRM card "
                        "(Address & family tab):\n- " + "\n- ".join(missing))

approvers = env['res.groups'].sudo().search([('name', '=', 'Contract Approvers')]).users
if not approvers:
    raise UserError("The Contract Approvers group has no members. Ask IT to add the contract team.")

# Re-submitting after the agent corrected the fees or the payment plan
# (whether it was returned first or edited while still pending).
round_no = (order.x_approval_round or 0) + 1
revision = round_no > 1
order.write({'x_pending_approval': True, 'x_approval_round': round_no})

plan = env['x_pay_plan'].sudo().search([('x_order_id', '=', order.id)], order='x_sequence, id')
plan_txt = '; '.join('%s %s' % (order.currency_id.symbol or '', r.x_amount) for r in plan) or 'not set'
base = env['ir.config_parameter'].sudo().get_param('web.base.url') or ''
link = '%s/web#id=%s&model=sale.order&view_type=form' % (base, order.id)
lead_word = 'revised and re-submitted' if revision else 'submitted'
title = ('Contract approval needed (revised): %s - %s' if revision else
         'Contract approval needed: %s - %s') % (order.name, partner.name or '')
body = ('<p>%s %s this quotation for contract approval.</p>'
        '<p>Customer: <strong>%s</strong><br/>Amount when submitted: %s %s'
        '<br/>Payment plan when submitted: %s</p>'
        '<p>The contract is always built from the quotation as it stands when you press Send, '
        'not from the figures above \u2014 if the address or the fees changed since, the amounts '
        'differ. Check them with <strong>Preview Agreement</strong>, then press '
        '<strong>Send Contract</strong> to send it to the client:<br/>'
        '<a href="%s">%s</a></p>') % (env.user.name, lead_word, partner.name or '',
                                      order.currency_id.symbol or '', order.amount_total, plan_txt,
                                      link, order.name)

# Refresh the activities so the note always shows the current figures.
Activity = env['mail.activity'].sudo()
model_id = env['ir.model'].sudo()._get_id('sale.order')
Activity.search(['&', ('res_model_id', '=', model_id), ('res_id', '=', order.id),
                 '|', ('summary', 'like', 'Approve and send'),
                      ('summary', 'like', 'returned for changes')]).unlink()
act_type = env.ref('mail.mail_activity_data_todo', raise_if_not_found=False)
for user in approvers:
    Activity.create({
        'res_model_id': model_id, 'res_id': order.id, 'user_id': user.id,
        'activity_type_id': act_type.id if act_type else False,
        'summary': 'Approve and send the contract' + (' (revision %s)' % round_no if revision else ''),
        'note': body,
        'date_deadline': datetime.date.today(),
    })

Mail = env['mail.mail'].sudo()
mail_logins = __EMAIL_APPROVERS__
for user in approvers:
    if user.id == env.user.id or not user.email:
        continue
    # Everyone gets the Odoo to-do above; only the contract team gets an e-mail.
    if (user.login or '').strip().lower() not in mail_logins:
        continue
    Mail.create({
        'subject': title, 'body_html': body, 'email_to': user.email,
        'auto_delete': False, 'model': 'sale.order', 'res_id': order.id,
    }).send()

order.message_post(body=body, message_type='comment', subtype_xmlid='mail.mt_note')
if order.opportunity_id:
    order.opportunity_id.sudo().message_post(
        body='Quotation %s %s for contract approval.' % (order.name, lead_word),
        message_type='comment', subtype_xmlid='mail.mt_note')
""".strip().replace("__EMAIL_APPROVERS__", repr([e.lower() for e in EMAIL_APPROVERS]))


# --- Return to agent -------------------------------------------------------
# The other half of the loop: an approver hands the draft back with a reason,
# the agent fixes the fees or the plan and re-submits.
RETURN_TO_AGENT_CODE = r"""
order = record
if not order.x_pending_approval:
    raise UserError("This quotation is not waiting for approval.")
order.write({'x_pending_approval': False})
model_id = env['ir.model'].sudo()._get_id('sale.order')
env['mail.activity'].sudo().search([('res_model_id', '=', model_id), ('res_id', '=', order.id),
                                    ('summary', 'like', 'Approve and send')]).unlink()
agent = order.user_id or order.create_uid
base = env['ir.config_parameter'].sudo().get_param('web.base.url') or ''
link = '%s/web#id=%s&model=sale.order&view_type=form' % (base, order.id)
body = ('<p>%s sent this contract back for changes. Correct the fees or the payment plan and press '
        '<strong>Resubmit for Approval</strong>.</p><p><a href="%s">%s</a></p>') % (env.user.name, link, order.name)
if agent:
    act_type = env.ref('mail.mail_activity_data_todo', raise_if_not_found=False)
    env['mail.activity'].sudo().create({
        'res_model_id': model_id, 'res_id': order.id, 'user_id': agent.id,
        'activity_type_id': act_type.id if act_type else False,
        'summary': 'Contract returned for changes',
        'note': body, 'date_deadline': datetime.date.today(),
    })
    if agent.email and agent.id != env.user.id:
        env['mail.mail'].sudo().create({
            'subject': 'Contract returned for changes: %s' % order.name,
            'body_html': body, 'email_to': agent.email, 'auto_delete': False,
            'model': 'sale.order', 'res_id': order.id,
        }).send()
order.message_post(body=body, message_type='comment', subtype_xmlid='mail.mt_note')
""".strip()


def install_approval_filter(odoo):
    """A filter so the contract team can find what is waiting for them:
    Sales > Quotations > Filters > Pending contract approval."""
    parents = odoo.search_read("ir.ui.view", [("model", "=", "sale.order"), ("type", "=", "search"),
                                              ("inherit_id", "=", False)], ["id", "name"])
    if not parents:
        log.warning("  no sale.order search view found — approval filter not installed")
        return
    arch = ('<data><xpath expr="//search" position="inside">'
            '<separator/>'
            '<filter name="x_pending_approval" string="Pending contract approval" '
            'domain="[(\'x_pending_approval\', \'=\', True)]"/>'
            '<filter name="x_contract_sent" string="Contract sent for signature" '
            'domain="[(\'x_sign_request_id\', \'!=\', False)]"/>'
            '</xpath></data>')
    view_id = odoo.ref("p2view", "so_approval_filter")
    for parent in parents:
        try:
            if view_id:
                odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch, "priority": 200})
            else:
                view_id, _ = odoo.upsert("p2view", "so_approval_filter", "ir.ui.view", {
                    "name": "sale.order.search.approval", "model": "sale.order",
                    "inherit_id": parent["id"], "arch_db": arch, "priority": 200})
            log.info("  'Pending contract approval' filter added to the quotation search")
            return
        except OdooError as exc:
            log.warning("  quotation search view: %s", str(exc)[-200:])


def install_contract_approval(odoo):
    """Only the Contract Approvers group may press Send/Resend Contract;
    everyone else can only submit the quotation for their review."""
    group_id, created = odoo.upsert("p2group", "contract_approvers", "res.groups", {
        "name": "Contract Approvers",
        "comment": "Can send a generated or custom agreement to the client for signature.",
    }, update=False)
    if created:
        log.info("  Contract Approvers group created")
    users = []
    for login, label in APPROVERS:
        u = odoo.search_read("res.users", ["|", ("login", "=ilike", login), ("email", "=ilike", login)], ["id"], limit=1)
        if u:
            users.append(u[0]["id"])
        else:
            log.warning("  approver not found (no login matching %s): %s", login, label)
    if users:
        odoo.write("res.groups", [group_id], {"users": [(6, 0, users)]})
    log.info("  Contract Approvers: %d of %d configured members found", len(users), len(APPROVERS))
    _field(odoo, "sale.order", "x_pending_approval", {
        "field_description": "Pending contract approval", "ttype": "boolean"})
    _field(odoo, "sale.order", "x_approval_round", {
        "field_description": "Approval round", "ttype": "integer",
        "help": "How many times this quotation has been submitted for contract approval."})
    submit_id = _server_action(odoo, "submit_approval", {
        "name": "Submit for Approval", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": SUBMIT_APPROVAL_CODE, "binding_model_id": False})
    return_id = _server_action(odoo, "return_to_agent", {
        "name": "Return to Agent", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": RETURN_TO_AGENT_CODE, "binding_model_id": False})
    return group_id, submit_id, return_id


def install_send_button(odoo, rcic_email):
    odoo.execute("ir.config_parameter", "set_param", "phase2.rcic_email", rcic_email or "")
    if not odoo.execute("ir.config_parameter", "get_param", "phase2.sparkbridge_email"):
        odoo.execute("ir.config_parameter", "set_param", "phase2.sparkbridge_email", SPARKBRIDGE_SIGNER)
    _field(odoo, "sale.order", "x_sign_request_id", {
        "field_description": "Retainer agreement", "ttype": "many2one",
        "relation": "sign.request", "on_delete": "set null"})
    _field(odoo, "sale.order", "x_custom_agreement", {
        "field_description": "Custom agreement (PDF)", "ttype": "binary", "copied": False})
    _field(odoo, "sale.order", "x_custom_agreement_filename", {
        "field_description": "Custom agreement file name", "ttype": "char"})
    _field(odoo, "sale.order", "x_custom_agreement_url", {
        "field_description": "Custom agreement link", "ttype": "char"})
    _field(odoo, "sale.order", "x_custom_sign_template_id", {
        "field_description": "Custom agreement in Sign", "ttype": "many2one",
        "relation": "sign.template", "on_delete": "set null", "copied": False})
    recalc_id = install_pay_plan(odoo)
    install_agreements(odoo)
    approver_group_id, submit_id, return_id = install_contract_approval(odoo)
    install_approval_filter(odoo)
    sponsor_role = odoo.execute("ir.config_parameter", "get_param", "phase2.sponsor_role") or "3"
    _server_action(odoo, "send_custom", {
        "name": "Send custom agreement", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": SEND_CUSTOM_CODE, "binding_model_id": False})
    act_id = _server_action(odoo, "send_contract", {
        "name": "Send Contract", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": SEND_CONTRACT_CODE.replace("__SPONSOR_ROLE__", str(int(sponsor_role))), "binding_model_id": False})
    preview_id = _server_action(odoo, "preview_agreement", {
        "name": "Preview Agreement", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": _preview_code(sponsor_role), "binding_model_id": False})

    parents = odoo.search_read("ir.ui.view", [("model", "=", "sale.order"), ("type", "=", "form"),
                                              ("inherit_id", "=", False), ("name", "=", "sale.order.form")],
                               ["id"]) or odoo.search_read(
        "ir.ui.view", [("model", "=", "sale.order"), ("type", "=", "form"), ("inherit_id", "=", False)], ["id"])
    arch = ('<data>'
            '<xpath expr="//header" position="inside">'
            f'<button name="{act_id}" type="action" string="Send Contract" class="btn-primary" '
            'invisible="x_sign_request_id or state == \'cancel\'" groups="__trello__.p2group_contract_approvers"/>'
            f'<button name="{act_id}" type="action" string="Resend Contract" class="btn-secondary" '
            'invisible="not x_sign_request_id or state == \'cancel\'" '
            'groups="__trello__.p2group_contract_approvers" '
            'confirm="This sends a new agreement built from the current quotation. The previous one is cancelled unless it was already signed. Continue?"/>'
            f'<button name="{submit_id}" type="action" string="Submit for Approval" class="btn-primary" '
            'invisible="x_sign_request_id or x_pending_approval or state == \'cancel\'" '
            'groups="!__trello__.p2group_contract_approvers"/>'
            f'<button name="{submit_id}" type="action" string="Resubmit for Approval" class="btn-primary" '
            'invisible="x_sign_request_id or not x_pending_approval or state == \'cancel\'" '
            'groups="!__trello__.p2group_contract_approvers"/>'
            f'<button name="{return_id}" type="action" string="Return to Agent" class="btn-secondary" '
            'invisible="x_sign_request_id or not x_pending_approval or state == \'cancel\'" '
            'groups="__trello__.p2group_contract_approvers"/>'
            f'<button name="{preview_id}" type="action" string="Preview Agreement" class="btn-secondary" '
            'invisible="state == \'cancel\'"/>'
            '</xpath>'
            # The native quotation buttons are redundant with (and confusing next
            # to) the ones above: "Send by Email" skips the approval/agreement/
            # sign flow entirely, and "Preview" shows the bare quotation instead
            # of the generated agreement. Hide both; leave Confirm and Cancel.
            '<xpath expr="//button[@name=\'action_quotation_send\'][@id=\'send_by_email_primary\']" position="attributes">'
            '<attribute name="invisible">1</attribute>'
            '</xpath>'
            '<xpath expr="//button[@name=\'action_quotation_send\'][@id=\'send_by_email\']" position="attributes">'
            '<attribute name="invisible">1</attribute>'
            '</xpath>'
            '<xpath expr="//button[@name=\'action_preview_sale_order\']" position="attributes">'
            '<attribute name="invisible">1</attribute>'
            '</xpath>'
            '<xpath expr="//field[@name=\'payment_term_id\']" position="after">'
            '<field name="x_sign_request_id" readonly="1"/>'
            '<field name="x_pending_approval" readonly="1" invisible="not x_pending_approval"/>'
            '<field name="x_custom_agreement_url" widget="url" placeholder="Google Docs / Drive link (reference only)"/>'
            '<field name="x_custom_agreement_filename" invisible="1"/>'
            '<field name="x_custom_agreement" widget="binary" filename="x_custom_agreement_filename" '
            'help="Upload a PDF here to send it instead of the generated agreement. '
            'Leave empty to generate the agreement from the quotation."/>'
            '<field name="x_custom_sign_template_id" readonly="1" invisible="not x_custom_sign_template_id"/>'
            '</xpath>'
            '<xpath expr="//notebook" position="inside">'
            '<page string="Agreement details" name="agreement_details">'
            '<group><group>'
            '<field name="x_agr_subject"/><field name="x_agr_subject_fa"/><field name="x_sponsor_id"/>'
            '<field name="x_agreement_kinds" readonly="1"/><field name="x_sign_request2_id" readonly="1"/>'
            '</group><group string="Procedural fairness letter">'
            '<field name="x_agr_ref"/><field name="x_agr_date"/><field name="x_agr_deadline"/><field name="x_agr_deadline2"/>'
            '</group></group>'
            '</page>'
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


LEAD_SYNC_CODE = r"""
# CRM card -> customer: the card is where agents type; the agreement prints the customer.
for lead in records:
    p = lead.partner_id
    if not p:
        continue
    vals = {}
    for f in ('street', 'street2', 'city', 'zip', 'x_name_fa', 'x_address_fa', 'x_national_id'):
        if lead[f] and lead[f] != p[f]:
            vals[f] = lead[f]
    for f in ('state_id', 'country_id'):
        if lead[f] and lead[f] != p[f]:
            vals[f] = lead[f].id
    # A province only belongs on a Canadian address. Leaving one on a foreign
    # address makes Odoo pick a Canadian fiscal position, which puts GST on the
    # order and then silently removes it again once the country is filled in --
    # that is what made a submitted amount differ from the contract total.
    country = lead.country_id or p.country_id
    if country and country.code != 'CA' and (p.state_id or vals.get('state_id')):
        vals['state_id'] = False
    if vals:
        p.sudo().write(vals)
""".strip()

FAMILY_MODEL = "x_family"
RELATIONS = [("spouse", "Accompanying spouse"), ("child", "Dependent child"), ("companion", "Companion"),
             ("guardian", "Parent / guardian"), ("sponsor", "Sponsor")]


def _inherit_view(odoo, model, key, name, arch, priority=99):
    """priority must beat any Studio customisation on the same model to stick
    (Studio views on this instance run at priority 160, not the usual 16)."""
    parents = odoo.search_read("ir.ui.view", [("model", "=", model), ("type", "=", "form"), ("inherit_id", "=", False)], ["id", "name"])
    parents.sort(key=lambda v: (v["name"] not in (f"{model}.form", "crm.lead.form", "res.partner.form", "sale.order.form")))
    view_id = odoo.ref("p2view", key)
    for parent in parents:
        try:
            if view_id:
                odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch, "priority": priority})
            else:
                view_id, _ = odoo.upsert("p2view", key, "ir.ui.view", {
                    "name": name, "model": model, "inherit_id": parent["id"], "arch_db": arch, "priority": priority})
            return view_id
        except OdooError as exc:
            log.warning("  %s view %s: %s", model, key, str(exc)[-200:])
    return None


def install_agreements(odoo):
    """Generated agreements: fields, family table, CRM address, sync, reports."""
    import sys
    sys.path.insert(0, str(HERE / "contract_templates"))
    import agreements

    # Customer + CRM card: Farsi name/address, national id (Sparkbridge retainers).
    for model in ("res.partner", "crm.lead"):
        _field(odoo, model, "x_name_fa", {"field_description": "Name (Farsi)", "ttype": "char"})
        _field(odoo, model, "x_address_fa", {"field_description": "Residential address (Farsi)", "ttype": "char"})
        _field(odoo, model, "x_national_id", {"field_description": "National ID / passport no.", "ttype": "char"})
    # Family members on the card (printed on the agreement after the applicant).
    model_id = odoo.ref("p2model", FAMILY_MODEL)
    if not model_id:
        model_id, _ = odoo.upsert("p2model", FAMILY_MODEL, "ir.model",
                                  {"name": "Family member", "model": FAMILY_MODEL, "state": "manual"}, update=False)
    _field(odoo, FAMILY_MODEL, "x_lead_id", {"field_description": "Card", "ttype": "many2one", "relation": "crm.lead",
                                            "on_delete": "cascade", "required": True, "index": True})
    _field(odoo, FAMILY_MODEL, "x_sequence", {"field_description": "Sequence", "ttype": "integer"})
    _field(odoo, FAMILY_MODEL, "x_relation", {"field_description": "Relation", "ttype": "selection", "required": True,
        "selection_ids": [(0, 0, {"value": v, "name": n, "sequence": i}) for i, (v, n) in enumerate(RELATIONS)]})
    _sync_selection(odoo, FAMILY_MODEL, "x_relation", RELATIONS)
    _field(odoo, FAMILY_MODEL, "x_name_en", {"field_description": "Name (English)", "ttype": "char", "required": True})
    _field(odoo, FAMILY_MODEL, "x_name_fa", {"field_description": "Name (Farsi)", "ttype": "char"})
    _field(odoo, FAMILY_MODEL, "x_passport", {"field_description": "Passport no.", "ttype": "char"})
    _field(odoo, FAMILY_MODEL, "x_birthdate", {"field_description": "Date of birth", "ttype": "date"})
    _field(odoo, "crm.lead", "x_family_ids", {"field_description": "Family members", "ttype": "one2many",
                                             "relation": FAMILY_MODEL, "relation_field": "x_lead_id"})
    group = odoo.search_read("ir.model.data", [("module", "=", "base"), ("name", "=", "group_user")], ["res_id"], limit=1)[0]["res_id"]
    odoo.upsert("p2access", FAMILY_MODEL, "ir.model.access", {
        "name": "x_family user", "model_id": model_id, "group_id": group,
        "perm_read": True, "perm_write": True, "perm_create": True, "perm_unlink": True})

    # Quotation: agreement details + second request (entrepreneur streams send two).
    _field(odoo, "sale.order", "x_sign_request2_id", {"field_description": "Second agreement", "ttype": "many2one",
                                                     "relation": "sign.request", "on_delete": "set null"})
    _field(odoo, "sale.order", "x_agreement_kinds", {"field_description": "Agreement templates sent", "ttype": "char"})
    _field(odoo, "sale.order", "x_agr_subject", {"field_description": "Application / program (English)", "ttype": "char",
        "help": "Printed in section 2. PR: the program line; PFL: the application the letter concerns; EU: the destination country. Empty = the service name."})
    _field(odoo, "sale.order", "x_agr_subject_fa", {"field_description": "Application / program (Farsi)", "ttype": "char"})
    _field(odoo, "sale.order", "x_agr_ref", {"field_description": "IRCC application no.", "ttype": "char"})
    _field(odoo, "sale.order", "x_agr_date", {"field_description": "Letter date", "ttype": "date"})
    _field(odoo, "sale.order", "x_agr_deadline", {"field_description": "IRCC deadline", "ttype": "date"})
    _field(odoo, "sale.order", "x_agr_deadline2", {"field_description": "Documents due from client", "ttype": "date"})
    _field(odoo, "sale.order", "x_sponsor_id", {"field_description": "Sponsor", "ttype": "many2one", "relation": "res.partner"})

    # Sponsor signing role.
    role = odoo.search_read("sign.item.role", [("name", "=", "Sponsor")], ["id"], limit=1)
    role_id = role[0]["id"] if role else odoo.execute("sign.item.role", "create", {"name": "Sponsor"})
    odoo.execute("ir.config_parameter", "set_param", "phase2.sponsor_role", str(role_id))

    # Views.
    _inherit_view(odoo, "res.partner", "partner_fa", "res.partner.form.farsi",
        '<data><xpath expr="//field[@name=\'vat\']" position="after">'
        '<field name="x_name_fa"/><field name="x_address_fa"/><field name="x_national_id"/></xpath></data>')
    _inherit_view(odoo, "crm.lead", "lead_address", "crm.lead.form.address",
        '<data>'
        '<xpath expr="//page[@name=\'extra\']" position="before">'
        '<page string="Address &amp; family" name="address_family">'
        '<div class="alert alert-info" role="status">'
        'Fill every field on this tab <strong>in English</strong>. Only the fields labelled '
        '<strong>(Farsi)</strong> take Farsi text \u2014 they are printed on the Farsi side of '
        'bilingual agreements. A province belongs to a Canadian address only.'
        '</div>'
        '<group><group string="Residential address in English (printed on the agreement)">'
        '<label for="street" string="Address"/>'
        '<div class="o_address_format">'
        '<field name="street" placeholder="Street..." class="o_address_street"/>'
        '<field name="street2" placeholder="Street 2..." class="o_address_street"/>'
        '<field name="city" placeholder="City" class="o_address_city"/>'
        '<field name="state_id" class="o_address_state" placeholder="Province" options="{\'no_open\': True}"/>'
        '<field name="zip" placeholder="Postal code" class="o_address_zip"/>'
        '<field name="country_id" placeholder="Country" class="o_address_country" options="{\'no_open\': True, \'no_create\': True}"/>'
        '</div>'
        '<field name="x_address_fa"/>'
        '</group><group string="Farsi / identification">'
        '<field name="x_name_fa"/><field name="x_national_id"/>'
        '</group></group>'
        '<separator string="Family members (named on the agreement after the applicant)"/>'
        '<field name="x_family_ids" nolabel="1"><tree editable="bottom">'
        '<field name="x_sequence" widget="handle"/><field name="x_relation"/><field name="x_name_en"/>'
        '<field name="x_name_fa"/><field name="x_passport"/><field name="x_birthdate" optional="hide"/>'
        '</tree></field>'
        '</page></xpath></data>')

    # Card -> customer sync.
    _server_action(odoo, "lead_sync", {"name": "CRM card -> customer address", "model_id": _model_id(odoo, "crm.lead"),
                                       "state": "code", "code": LEAD_SYNC_CODE, "binding_model_id": False})
    # The automation that runs it is the shared one from install_card_rules.

    # Paper format + the ten reports.
    pf = odoo.search_read("report.paperformat", [("name", "=", "Contracts - US Letter")], ["id"], limit=1)
    pf_id = pf[0]["id"] if pf else odoo.execute("report.paperformat", "create", {
        "name": "Contracts - US Letter", "format": "Letter", "orientation": "Portrait", "margin_top": 30,
        "margin_bottom": 26, "margin_left": 16, "margin_right": 16, "header_spacing": 22, "dpi": 90})
    done = agreements.install(odoo, pf_id)
    log.info("  agreement reports installed: %s", ", ".join(done))
    return done


# Contract number sequences, seeded from the two Google Sheets (last numbers
# read on 2026-09-10): Sugimoto "ALL Numbers" tab and Sparkbridge "Customer
# Info" tab. Both restart at 001 every year.
SEQUENCES = {
    "x_sugimoto_file": {"name": "Sugimoto Visa client file number", "prefix": "S%(y)s", "padding": 3},
    "x_sparkbridge_contract": {"name": "Sparkbridge contract number", "prefix": "SB0000%(y)s", "padding": 3},
}


def install_sequences(odoo, seed=None):
    """Create the two yearly sequences; seed = {code: next_number} for the current year."""
    import datetime
    year = datetime.date.today().year
    for code, spec in SEQUENCES.items():
        seq = odoo.search_read("ir.sequence", [("code", "=", code)], ["id"], limit=1)
        vals = dict(spec, code=code, use_date_range=True, implementation="no_gap", number_increment=1)
        if seq:
            sid = seq[0]["id"]; odoo.write("ir.sequence", [sid], vals)
        else:
            sid = odoo.execute("ir.sequence", "create", vals)
        if seed and code in seed:
            rng = odoo.search_read("ir.sequence.date_range", [("sequence_id", "=", sid), ("date_from", "<=", f"{year}-12-31"), ("date_to", ">=", f"{year}-01-01")], ["id"], limit=1)
            if rng:
                odoo.write("ir.sequence.date_range", [rng[0]["id"]], {"number_next_actual": seed[code]})
            else:
                rid = odoo.execute("ir.sequence.date_range", "create", {"sequence_id": sid, "date_from": f"{year}-01-01", "date_to": f"{year}-12-31"})
                odoo.write("ir.sequence.date_range", [rid], {"number_next_actual": seed[code]})
        log.info("  sequence %s ready (%s)", code, spec["prefix"])


def fix_crm_fields(odoo):
    """Budget is optional; Service Agreement is required and sits above the
    renamed Execution team field (was Case Type)."""
    _inherit_view(odoo, "crm.lead", "lead_budget_optional", "crm.lead.form.budget.optional",
        "<data><xpath expr=\"//field[@name='x_budget']\" position=\"attributes\">"
        "<attribute name=\"required\">0</attribute></xpath></data>", priority=200)
    for name, label in (("x_case_type", "Execution team"), ("x_service", "Service Agreement")):
        f = odoo.search_read("ir.model.fields", [("model", "=", "crm.lead"), ("name", "=", name)], ["id"], limit=1)
        if f:
            odoo.write("ir.model.fields", [f[0]["id"]], {"field_description": label})
    log.info("  Budget is optional; Case Type -> Execution team, Service -> Service Agreement")
    # Move Service Agreement above Execution team. It is NOT required to save
    # the card — only to create a quotation (New Quotation checks it) or to
    # move the card to "Need to Receive Draft Contract" (the stage gate
    # checks it), so agents can still create and save a fresh card first.
    view_id = odoo.ref("p2view", "lead_service")
    if view_id:
        parent = odoo.search_read("ir.ui.view", [("id", "=", view_id)], ["inherit_id"])[0]["inherit_id"]
        arch = ("<data><xpath expr=\"//field[@name='x_case_type']\" position=\"before\">"
                "<field name=\"x_service\" options=\"{'no_create': True}\"/></xpath></data>")
        try:
            odoo.write("ir.ui.view", [view_id], {"inherit_id": parent[0], "arch_db": arch, "priority": 200})
            log.info("  Service Agreement moved above Execution team (not required to save the card)")
        except OdooError as exc:
            log.warning("  could not reorder Service Agreement / Execution team: %s", str(exc)[-200:])
    else:
        log.warning("  Service Agreement view not found — run phase2 install first")


STAGE_GATE_CODE = r"""
# Two gates, one per stage.
#   12- Need to Receive Draft Contract : the client's file must be complete.
#   13- Draft Contract Sent            : a contract must really have gone out.
# The system's own move to 13 (right after Send Contract) passes
# skip_stage_gate, because by then the contract has demonstrably been sent.
if not env.context.get('skip_stage_gate'):
    Lead = env['crm.lead'].sudo()
    s12 = env['crm.stage'].sudo().search([('name', '=like', '12-%')], limit=1)
    s13 = env['crm.stage'].sudo().search([('name', '=like', '13-%')], limit=1)
    for lead in records:
        stage = lead.stage_id
        p = lead.partner_id
        if s12 and stage == s12:
            missing = []
            if not p:
                missing.append("the customer: pick or create one in the Customer field")
            elif len((p.name or '').split()) < 2:
                missing.append("the customer's full name (first and last name), currently \"%s\"" % (p.name or ''))
            if not (lead.phone or lead.mobile or (p and (p.phone or p.mobile))):
                missing.append("a phone number")
            street = lead.street or (p and p.street)
            city = lead.city or (p and p.city)
            country = lead.country_id or (p and p.country_id)
            if not (street and city and country):
                missing.append("the residential address: street, city and country (Address & family tab)")
            # Counted, not read: the image itself can be several megabytes.
            if not Lead.search_count([('id', '=', lead.id), ('x_studio_copy_pass_info', '!=', False)]):
                missing.append("the passport copy (Passport Image (Main Applicant))")
            if missing:
                raise UserError(
                    "This card cannot move to '%s' until the client's information is complete.\n\n"
                    "Still missing:\n- %s" % (stage.name, "\n- ".join(missing)))
        if s13 and stage == s13:
            if not lead.x_service:
                raise UserError("This card cannot move to '%s' until the Service Agreement is set." % stage.name)
            orders = env['sale.order'].sudo().search([('opportunity_id', '=', lead.id)])
            sent = orders.filtered(lambda o: o.x_sign_request_id or o.x_sign_request2_id or o.x_custom_sign_template_id)
            if not sent:
                raise UserError(
                    "This card cannot move to '%s' until a contract has been sent to the client. Fill in the payment "
                    "plan on a quotation, and press Send Contract (or have it approved and sent by the contract team) "
                    "first." % stage.name)
""".strip()


def install_stage_gate(odoo):
    """Stage 12 needs a complete client file; stage 13 needs a sent agreement."""
    act_id = _server_action(odoo, "stage_gate", {
        "name": "Stage gates: client file for 12, sent contract for 13",
        "model_id": _model_id(odoo, "crm.lead"), "state": "code",
        "code": STAGE_GATE_CODE, "binding_model_id": False})
    log.info("  stage gate action ready (run by the shared card-rules automation)")
    return act_id


ADDRESS_FIELDS = ["street", "street2", "city", "zip", "state_id", "country_id",
                  "x_name_fa", "x_address_fa", "x_national_id"]

# One automation for every Phase-2 rule on the card, plus the customer's
# stage-22 handoff.  Odoo 17's automation engine writes date_automation_last
# on every automation it runs, and that write re-triggers every *other*
# automation on the record, so the work per save grows factorially with the
# number of automations that match (4 -> ~2 s, 5 -> ~12 s, 6 -> over a
# minute, which nginx cuts off).  Three separate automations therefore cost
# far more than one that dispatches to the same three actions.
CARD_RULES_CODE = r"""
old_values = env.context.get('old_values') or {}
Action = env['ir.actions.server'].sudo()
for lead in records:
    changed = old_values.get(lead.id)   # None on create: everything counts as changed
    ctx = {'active_model': 'crm.lead', 'active_id': lead.id, 'active_ids': [lead.id]}
    # Card -> customer address (only when the customer or an address field changed).
    if lead.partner_id and (changed is None or 'partner_id' in changed or any(f in changed for f in __ADDRESS_FIELDS__)):
        Action.browse(__SYNC__).with_context(**ctx).run()
    if changed is not None and 'stage_id' in changed and changed['stage_id'] != lead.stage_id:
        # Stage gate: a contract must be sent before Need to Receive Draft Contract.
        Action.browse(__GATE__).with_context(**ctx).run()
        # Execution handoff: the card just arrived in 22- Sent to Execution Team.
        if lead.stage_id.id == __EXEC_STAGE__:
            Action.browse(__ROUTE__).with_context(**ctx).run()
    elif changed is None and lead.stage_id.id == __EXEC_STAGE__:
        Action.browse(__ROUTE__).with_context(**ctx).run()
""".strip()


def install_card_rules(odoo):
    """The single automation behind the card rules (see CARD_RULES_CODE)."""
    sync = odoo.ref("p2action", "lead_sync")
    gate = odoo.ref("p2action", "stage_gate")
    stage = odoo.search_read("crm.stage", [("name", "ilike", "Sent to Execution Team")], ["id"], limit=1)
    route = odoo.search_read("base.automation", [("model_id.model", "=", "crm.lead"), ("trigger", "=", "on_stage_set"),
                                                 ("name", "ilike", "Sent to Execution Team")], ["id", "action_server_ids"], limit=1)
    if not (sync and gate and stage and route and route[0]["action_server_ids"]):
        log.warning("  card rules not installed: sync=%s gate=%s stage=%s route=%s", sync, gate, stage, route)
        return
    code = (CARD_RULES_CODE.replace("__ADDRESS_FIELDS__", repr(ADDRESS_FIELDS)).replace("__SYNC__", str(sync))
            .replace("__GATE__", str(gate)).replace("__EXEC_STAGE__", str(stage[0]["id"]))
            .replace("__ROUTE__", str(route[0]["action_server_ids"][0])))
    act_id = _server_action(odoo, "card_rules", {"name": "CRM card rules", "model_id": _model_id(odoo, "crm.lead"),
                                                 "state": "code", "code": code, "binding_model_id": False})
    fields = odoo.search_read("ir.model.fields", [("model", "=", "crm.lead"),
                                                  ("name", "in", ADDRESS_FIELDS + ["partner_id", "stage_id"])], ["id"])
    auto_vals = {"name": "Phase 2: CRM card rules", "model_id": _model_id(odoo, "crm.lead"),
                 "trigger": "on_create_or_write", "trigger_field_ids": [(6, 0, [f["id"] for f in fields])],
                 "filter_domain": "[]", "action_server_ids": [(6, 0, [act_id])], "active": True}
    auto = odoo.ref("p2auto", "card_rules")
    if auto:
        odoo.write("base.automation", [auto], auto_vals)
    else:
        odoo.upsert("p2auto", "card_rules", "base.automation", auto_vals)
    # The three automations it replaces must not run alongside it.
    retired = [odoo.ref("p2auto", "lead_sync"), odoo.ref("p2auto", "stage_gate"), route[0]["id"]]
    retired = [r for r in retired if r]
    active = odoo.search_read("base.automation", [("id", "in", retired), ("active", "=", True)], ["id"])
    if active:
        odoo.write("base.automation", [a["id"] for a in active], {"active": False})
    log.info("  card rules automation active; retired %d separate automations", len(active))


CONTRACT_SENT_STAGE_CODE = r"""
# The custom-agreement route: the Sign request is created in the Sign editor,
# after the order already points at its template, so creation is the moment the
# agreement goes out. (The standard Send Contract button moves the card itself,
# because there the order is linked only after the request exists.)
# Forward only, so a card already further along is never rewound.
stage = env['crm.stage'].sudo().search([('name', '=like', '13-%')], limit=1)
if stage:
    Order = env['sale.order'].sudo()
    for req in records:
        if not req.template_id:
            continue
        for order in Order.search([('x_custom_sign_template_id', '=', req.template_id.id)]):
            lead = order.opportunity_id
            if not lead or not lead.stage_id or lead.stage_id.sequence >= stage.sequence:
                continue
            lead.sudo().with_context(skip_stage_gate=True).write({'stage_id': stage.id})
            lead.sudo().message_post(
                body='Moved to "%s": the agreement was sent to the client (%s).' % (stage.name, req.reference or order.name),
                message_type='comment', subtype_xmlid='mail.mt_note')
""".strip()


def install_contract_sent_stage(odoo):
    """Sending an agreement moves the card to "13- Draft Contract Sent"."""
    stage = odoo.search_read("crm.stage", [("name", "=like", "13-%")], ["id", "name"], limit=1)
    if not stage:
        log.warning("  no '13-' stage found — contract-sent automation not installed")
        return
    act_id = _server_action(odoo, "contract_sent_stage", {
        "name": "Agreement sent -> card to Draft Contract Sent",
        "model_id": _model_id(odoo, "sign.request"), "state": "code",
        "code": CONTRACT_SENT_STAGE_CODE, "binding_model_id": False})
    state_field = odoo.search_read("ir.model.fields", [("model", "=", "sign.request"), ("name", "=", "state")], ["id"], limit=1)
    auto_vals = {"name": "Phase 2: agreement sent -> Draft Contract Sent",
                 "model_id": _model_id(odoo, "sign.request"), "trigger": "on_create_or_write",
                 "trigger_field_ids": [(6, 0, [state_field[0]["id"]])] if state_field else [(5, 0, 0)],
                 "filter_domain": "[('state', '=', 'sent')]",
                 "action_server_ids": [(6, 0, [act_id])], "active": True}
    auto = odoo.ref("p2auto", "contract_sent_stage")
    if auto:
        odoo.write("base.automation", [auto], auto_vals)
    else:
        odoo.upsert("p2auto", "contract_sent_stage", "base.automation", auto_vals)
    log.info("  sending an agreement now moves the card to %r", stage[0]["name"])


def install_card_tidy(odoo):
    """Surface the Customer field; retire the duplicate fields on Extra Information.

    Studio had set partner_id invisible, so there was no way to put a customer
    on a card at all. Address / Postal Code / Contract Type on the Extra
    Information tab duplicate the Address & family tab and the Service
    Agreement, so they are hidden -- and their "required" expressions cleared
    with them, or the card could not be saved once they are out of sight.
    """
    parents = odoo.search_read("ir.ui.view", [("model", "=", "crm.lead"), ("type", "=", "form"),
                                              ("inherit_id", "=", False)], ["id"])
    hide = ("x_studio_address", "x_studio_postal_code", "x_studio_contract_type_1")
    arch = ("<data>"
            "<xpath expr=\"//group[@name='opportunity_partner']/field[@name='partner_id']\" position=\"attributes\">"
            "<attribute name=\"invisible\">0</attribute>"
            "<attribute name=\"string\">Customer</attribute>"
            "</xpath>"
            + "".join(
                "<xpath expr=\"//field[@name='%s']\" position=\"attributes\">"
                "<attribute name=\"invisible\">1</attribute>"
                "<attribute name=\"required\">0</attribute>"
                "</xpath>" % name for name in hide)
            + "</data>")
    view_id = odoo.ref("p2view", "card_tidy")
    for parent in parents:
        try:
            if view_id:
                odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch})
            else:
                view_id, _ = odoo.upsert("p2view", "card_tidy", "ir.ui.view", {
                    "name": "crm.lead.form.card.tidy", "model": "crm.lead",
                    "inherit_id": parent["id"], "arch_db": arch, "priority": 210})
            log.info("  Customer field shown; %s hidden on Extra Information", ", ".join(hide))
            return view_id
        except OdooError:
            continue
    log.warning("  could not adjust the lead form — check the Extra Information tab by hand")


def install_line_discounts(odoo):
    """Let every internal user set a discount on a quotation line.

    Odoo hides the "Disc.%" column behind the "Discount on lines" group, which
    only one user had, so nobody could record an agreed discount. Implying the
    group from the base Internal User group is exactly what the Settings
    toggle does, and it reaches everyone at once. The agreements already print
    a Discount / تخفیف row whenever the figure is non-zero.
    """
    ref = odoo.execute("ir.model.data", "check_object_reference", "product", "group_discount_per_so_line")
    disc_gid = ref[1]
    base_gid = odoo.execute("ir.model.data", "check_object_reference", "base", "group_user")[1]
    base = odoo.search_read("res.groups", [("id", "=", base_gid)], ["implied_ids"])[0]
    if disc_gid in base["implied_ids"]:
        log.info("  line discounts already available to every internal user")
        return disc_gid
    odoo.write("res.groups", [base_gid], {"implied_ids": [(4, disc_gid)]})
    have = odoo.execute("res.users", "search_count", [("groups_id", "in", [disc_gid])])
    log.info("  line discounts enabled for every internal user (%d users have it now)", have)
    return disc_gid


def relax_partner_accounting(odoo):
    """Contacts must be savable without a receivable/payable account.

    The Accounting app makes both fields required on the contact form, but no
    chart of accounts is installed (invoicing happens outside Odoo), so there
    is nothing to pick and saving an address fails with "Invalid fields".
    They stay on the form, just no longer mandatory.
    """
    arch = ('<data>'
            '<xpath expr="//field[@name=\'property_account_receivable_id\']" position="attributes">'
            '<attribute name="required">0</attribute></xpath>'
            '<xpath expr="//field[@name=\'property_account_payable_id\']" position="attributes">'
            '<attribute name="required">0</attribute></xpath>'
            '</data>')
    if _inherit_view(odoo, "res.partner", "partner_account_optional",
                     "res.partner.form.account.optional", arch):
        log.info("  contacts: Account Receivable/Payable are no longer required")


def migrate_lead_address(odoo):
    """One-time copy of the Studio Address / Postal Code fields into the native address."""
    if not odoo.has_field("crm.lead", "x_studio_address"):
        return 0
    leads = odoo.search_read("crm.lead", ["|", ("x_studio_address", "!=", False), ("x_studio_postal_code", "!=", False)],
                             ["street", "zip", "x_studio_address", "x_studio_postal_code"], context={"active_test": False})
    n = 0
    for l in leads:
        vals = {}
        if l["x_studio_address"] and not l["street"]:
            vals["street"] = l["x_studio_address"][:128]
        if l.get("x_studio_postal_code") and not l["zip"]:
            vals["zip"] = l["x_studio_postal_code"]
        if vals:
            odoo.write("crm.lead", [l["id"]], vals); n += 1
    log.info("  address copied from the Studio fields on %d cards", n)
    return n


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


SIGN_MAIL_REQUEST_ARCH = """<data>
  <xpath expr="//table" position="replace">
    <div style="font-family: Arial, Tahoma, sans-serif; font-size: 14px; color: #222; max-width: 640px;">
      <t t-if="body"><t t-out="body"/></t>
      <t t-else="">
        <p>Hello <t t-esc="record.partner_id.name"/>,</p>
        <p><t t-esc="record.create_uid.name"/> has requested your signature on the document
          <t t-esc="record.sign_request_id.reference"/>.</p>
      </t>
      <div style="margin: 24px auto; text-align: center;">
        <a t-att-href="link" style="display: inline-block; padding: 12px 28px; border-radius: 4px; background-color: #1f4e79; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 15px;">
          امضای قرارداد &#160;·&#160; Sign document
        </a>
      </div>
      <t t-if="show_validity">
        <p dir="rtl" style="text-align:right;">مهلت امضای این سند تا <span dir="ltr"><t t-out="record.sign_request_id.validity"/></span> است.</p>
        <p>You have until <t t-out="record.sign_request_id.validity"/> to sign the document.</p>
      </t>
      <div style="opacity: 0.75; font-size: 12px; line-height: 1.6;">
        <p dir="rtl" style="text-align:right;">توجه: این ایمیل را برای دیگران ارسال نکنید. لینک امضا شخصی است و هر کسی که آن را داشته باشد می‌تواند به‌جای شما امضا کند. آدرس IP و موقعیت شما به امضا پیوست می‌شود.</p>
        <p><strong>Warning:</strong> do not forward this e-mail. The signing link is personal: whoever has it can sign as you. Your IP address and location are attached to your signature.</p>
        <p><small>If you do not wish to receive further reminders about this document,
          <a t-att-href="'%s/sign/sign_ignore/%s/%s' % (record.get_base_url(), record.id, record.access_token)" style="color: #000000; text-decoration: none;">click here</a>.</small></p>
      </div>
    </div>
  </xpath>
</data>"""

SIGN_MAIL_COMPLETED_ARCH = """<data>
  <xpath expr="//table" position="replace">
    <div style="font-family: Arial, Tahoma, sans-serif; font-size: 14px; color: #222; max-width: 640px;">
      <div dir="rtl" style="text-align: right; line-height: 1.9;">
        <p>سرکار خانم / جناب آقای <t t-esc="recipient_name"/><br/>با سلام و احترام،</p>
        <p>ضمن تشکر از همکاری شما، قرارداد «<span dir="ltr"><t t-esc="record.reference"/></span>» توسط همه طرفین امضا شد و نسخه نهایی امضاشده به پیوست تقدیم می‌گردد. لطفاً این نسخه را برای مراجعات بعدی نزد خود نگه دارید.</p>
      </div>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;"/>
      <div dir="ltr" style="text-align: left; line-height: 1.6; color: #444;">
        <p>Dear <t t-esc="recipient_name"/>,</p>
        <p>Thank you. The document "<t t-esc="record.reference"/>" has been signed by all parties and the final signed copy is attached. Please keep it for your records.</p>
      </div>
      <div style="margin: 24px auto; text-align: center;">
        <a t-att-href="link" style="display: inline-block; padding: 12px 28px; border-radius: 4px; background-color: #1f4e79; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 15px;">
          سند امضاشده &#160;·&#160; Signed document
        </a>
      </div>
    </div>
  </xpath>
</data>"""

# Signature blocks of the two sending identities (legal@ / contract@), from the
# e-mail catalogue. Odoo Sign appends the sender's signature under the message.
MAIL_SIGNATURES = {
    "phase2.sg_mail_from": (
        '<div style="font-family: Arial, Tahoma, sans-serif; font-size: 13px; color: #333; line-height: 1.5;">'
        '<div dir="rtl">گروه قراردادها</div>'
        '<div>Legal Department<br/><b>Sugimoto Visa Inc.</b><br/>'
        '501 - 3292 Production Way, Burnaby<br/>Greater Vancouver, BC V5A 4R4<br/>'
        'Office: +1 (778) 200-8856<br/>'
        '<a href="mailto:legal@sugimotovisa.com">legal@sugimotovisa.com</a> · '
        '<a href="https://www.sugimotovisa.com">www.sugimotovisa.com</a></div></div>'),
    "phase2.sb_mail_from": (
        '<div style="font-family: Arial, Tahoma, sans-serif; font-size: 13px; color: #333; line-height: 1.5;">'
        '<div dir="rtl">گروه قراردادها</div>'
        '<div>Contracts Department<br/><b>Sparkbridge Incubator Ltd.</b><br/>'
        '250 - 997 Seymour St., Vancouver, BC<br/>'
        'Office: +1 (604) 364-9012<br/>'
        '<a href="mailto:contract@sparkbridge.ca">contract@sparkbridge.ca</a> · '
        '<a href="https://www.sparkbridge.ca">www.sparkbridge.ca</a></div></div>'),
}


# The finance-sheet row, staged on the quotation by Send Contract and pushed
# to Google Sheets by the n8n job "Odoo contracts to finance sheets".
SHEET_FIELDS = [
    ("x_sheet_pro", "float", "Sheet: professional fee"), ("x_sheet_gov", "float", "Sheet: government fee"),
    ("x_sheet_disc", "float", "Sheet: discount"), ("x_sheet_tax", "float", "Sheet: tax"),
    ("x_sheet_total", "float", "Sheet: total"), ("x_sheet_plan", "char", "Sheet: payment plan"),
    ("x_sheet_kinds", "char", "Sheet: agreement"), ("x_sheet_accompanying", "char", "Sheet: accompanying"),
    ("x_sheet_type", "char", "Sheet: service code"), ("x_sheet_rcic", "char", "Sheet: RCIC"),
    ("x_sheet_spouse", "char", "Sheet: spouse"), ("x_sheet_child1", "char", "Sheet: child 1"),
    ("x_sheet_child2", "char", "Sheet: child 2"), ("x_sheet_child3", "char", "Sheet: child 3"),
    ("x_sheet_sent_date", "date", "Sheet: contract sent on"),
    ("x_sheet_synced", "char", "Sheet: written to Google Sheet at"),
    ("x_sheet_company", "char", "Sheet: company (SG/SB)"), ("x_sheet_contract_no", "char", "Sheet: contract no"),
    ("x_sheet_display", "char", "Sheet: contract name"), ("x_sheet_name", "char", "Sheet: first name"),
    ("x_sheet_family", "char", "Sheet: family name"), ("x_sheet_email", "char", "Sheet: email"),
    ("x_sheet_phone", "char", "Sheet: phone"), ("x_sheet_address", "char", "Sheet: address"),
    ("x_sheet_name_fa", "char", "Sheet: name (Farsi)"), ("x_sheet_address_fa", "char", "Sheet: address (Farsi)"),
    ("x_sheet_agent", "char", "Sheet: agent"), ("x_sheet_country", "char", "Sheet: country"),
    ("x_sheet_passport", "char", "Sheet: passport/ID"), ("x_sheet_spouse_fa", "char", "Sheet: spouse (Farsi)"),
    ("x_sheet_child1_fa", "char", "Sheet: child 1 (Farsi)"), ("x_sheet_child2_fa", "char", "Sheet: child 2 (Farsi)"),
]


def install_sheet_fields(odoo):
    for name, ttype, label in SHEET_FIELDS:
        _field(odoo, "sale.order", name, {"field_description": label, "ttype": ttype})


def _payment_html(company_en, company_fa, etransfer, eur=False):
    """Template P1 of the e-mail catalogue, as the block under the contract e-mail."""
    exchange = 'Quebec Money Exchange — 740 Blvd de la Côte-Vertu, #182, Montréal, QC H4L 5C8 — +1 (514) 806-7603'
    # One LTR run in the Farsi text, or the address is reordered around the dashes.
    exchange_fa = '<span dir="ltr">%s</span>' % exchange
    cad_fa = 'پرداخت به دلار کانادا' + (' (یا یورو، برای قراردادهای یورویی)' if eur else '')
    cad_en = 'Payment in Canadian dollars' + (' (or euros, for contracts in euros)' if eur else '')
    return (
        '<div style="margin:16px 0; padding:12px 16px; background:#f4f6f8; border-radius:4px; line-height:1.8;">'
        '<div dir="rtl" style="text-align:right;">'
        '<p><b>راهنمای پرداخت</b></p><ul>'
        '<li><b>%(cad_fa)s:</b> از طریق Interac e-Transfer به ایمیل <span dir="ltr"><b>%(et)s</b></span> '
        '(واریز خودکار به نام <span dir="ltr">%(co_en)s</span>). در صورت پرداخت از داخل خاک کانادا، مالیات مطابق قوانین '
        'استان مربوطه به صورت‌حساب اضافه می‌شود.</li>'
        '<li><b>پرداخت ریالی:</b> از طریق صرافی %(ex_fa)s. لطفاً هنگام تماس، شماره قرارداد خود را اعلام بفرمایید.</li>'
        '<li>جهت اطمینان از ایمن بودن تراکنش‌ها، از پرداخت از طریق سایر روش‌ها یا صرافی‌های دیگر خودداری فرمایید.</li>'
        '<li>لطفاً پس از واریز، تصویر رسید را در پاسخ به همین ایمیل ارسال بفرمایید.</li>'
        '</ul></div>'
        '<div dir="ltr" style="text-align:left; color:#444;">'
        '<p><b>How to pay</b></p><ul>'
        '<li><b>%(cad_en)s:</b> Interac e-Transfer to <b>%(et)s</b> (auto-deposit, registered to %(co_en)s). '
        'If you pay from inside Canada, the applicable provincial tax is added to the invoice.</li>'
        '<li><b>Payment in rials:</b> through %(ex)s. Please quote your contract number.</li>'
        '<li>For your own security, do not pay through any other method or exchange.</li>'
        '<li>After paying, please reply to this e-mail with a picture of the receipt.</li>'
        '</ul></div></div>'
    ) % {'cad_fa': cad_fa, 'cad_en': cad_en, 'et': etransfer, 'co_en': company_en, 'co_fa': company_fa, 'ex': exchange, 'ex_fa': exchange_fa}


PAYMENT_DEFAULTS = {
    "phase2.sg_payment_html": _payment_html("SUGIMOTO VISA INC.", "سوگیموتو ویزا", "info@sugimotovisa.com"),
    "phase2.sb_payment_html": _payment_html("SPARKBRIDGE INCUBATOR LTD.", "اسپارک‌بریج", "finance@sparkbridge.ca", eur=True),
}


def install_payment_blocks(odoo, reset=False):
    """Seed the payment instructions; finance's later edits are kept unless reset."""
    for key, html in PAYMENT_DEFAULTS.items():
        if reset or not odoo.execute("ir.config_parameter", "get_param", key):
            odoo.execute("ir.config_parameter", "set_param", key, html)
            log.info("  payment block %s set", key)


def install_sign_mail(odoo):
    install_payment_blocks(odoo)
    """Replace Odoo Sign's stock client e-mails (which render half-translated
    when the client's language is Farsi) with the catalogue's C2 / C5 texts."""
    for key, parent_key, name, arch in [
            ("sign_mail_request", "sign.sign_template_mail_request", "Contract signing e-mail (Sugimoto / Sparkbridge)", SIGN_MAIL_REQUEST_ARCH),
            ("sign_mail_completed", "sign.sign_template_mail_completed", "Signed contract e-mail (Sugimoto / Sparkbridge)", SIGN_MAIL_COMPLETED_ARCH)]:
        parent = odoo.search_read("ir.ui.view", [("key", "=", parent_key)], ["id"])
        if not parent:
            log.warning("  Sign mail template %s not found; e-mail layout not installed", parent_key)
            continue
        view_id, created = odoo.upsert("p2view", key, "ir.ui.view", {
            "name": name, "type": "qweb", "mode": "extension", "inherit_id": parent[0]["id"],
            "arch_db": arch, "priority": 99, "key": "__trello__.%s" % key})
        log.info("  %s e-mail template: view %s (%s)", parent_key, view_id, "created" if created else "updated")
    for param, signature in MAIL_SIGNATURES.items():
        email = odoo.execute("ir.config_parameter", "get_param", param) or ""
        users = odoo.search_read("res.users", ["|", ("login", "=ilike", email), ("email", "=ilike", email)], ["id"],
                                 context={"active_test": False}) if email else []
        if users:
            odoo.write("res.users", [u["id"] for u in users], {"signature": signature})
            log.info("  signature set on %s (%s)", email, [u["id"] for u in users])
        else:
            log.warning("  no identity user for %s (%s); signature not set", param, email)



# Studio made Description and Nationality mandatory from "12- Need to Receive
# Draft Contract" onwards, which blocks a card the moment it reaches drafting
# even though neither value is used in the agreement. The requirement is
# dropped (client's request, 2026-09-20); the fields stay on the card.
RELAXED_CARD_FIELDS = ["x_studio_description", "x_studio_nationality_1"]


def relax_card_required(odoo, fields=None):
    """Drop the stage-driven required= on the card fields listed in RELAXED_CARD_FIELDS."""
    fields = fields or RELAXED_CARD_FIELDS
    views = odoo.search_read("ir.ui.view", [("model", "=", "crm.lead"), ("type", "=", "form")], ["id", "name"])
    touched = 0
    for v in views:
        arch = odoo.search_read("ir.ui.view", [("id", "=", v["id"])], ["arch_db"])[0]["arch_db"] or ""
        new = arch
        for name in fields:
            # Only the required attribute of that one field tag; everything
            # else on the tag (options, invisible, widget) is left alone.
            for m in re.finditer(r'<field name="%s"[^>]*?/?>' % re.escape(name), new):
                tag = m.group(0)
                stripped = re.sub(r'\s+required="[^"]*"', '', tag)
                if stripped != tag:
                    new = new.replace(tag, stripped)
        if new != arch:
            odoo.write("ir.ui.view", [v["id"]], {"arch_db": new})
            touched += 1
            log.info("  required= dropped for %s in view %s (%s)", ", ".join(fields), v["id"], v["name"])
    if not touched:
        log.info("  no view required %s any more", ", ".join(fields))
    return touched


# A quotation's taxes follow the customer's province through the fiscal
# position, but Odoo only picks the fiscal position when the customer is set
# on the order. Correcting the province afterwards (on the card, which the
# card rules copy to the customer, or on the customer directly) left GST on
# an Ontario file and HST on a BC one. This keeps every open quotation of the
# customer in step with the address.
TAX_REFRESH_CODE = r"""
Order = env['sale.order'].sudo()
FP = env['account.fiscal.position'].sudo()
for partner in records:
    orders = Order.search([('partner_id', '=', partner.id), ('state', 'in', ('draft', 'sent'))])
    for order in orders:
        fpos = FP.with_company(order.company_id)._get_fiscal_position(order.partner_id, order.partner_shipping_id)
        before = {l.id: l.tax_id.ids for l in order.order_line}
        if order.fiscal_position_id != fpos:
            order.write({'fiscal_position_id': fpos.id})
        order.order_line.filtered(lambda l: not l.display_type)._compute_tax_id()
        changed = [l for l in order.order_line if before.get(l.id) != l.tax_id.ids]
        if changed:
            where = ', '.join(filter(None, [partner.state_id.name or '', partner.country_id.name or ''])) or 'no address'
            order.message_post(
                body='Taxes updated to match the customer\'s address (%s): %s.' % (
                    where, '; '.join('%s: %s' % (l.name, ', '.join(l.tax_id.mapped('name')) or 'no tax') for l in changed)),
                message_type='comment', subtype_xmlid='mail.mt_note')
""".strip()


def install_tax_refresh(odoo):
    """Re-map the taxes of open quotations when the customer's province or country changes."""
    act_id = _server_action(odoo, "tax_refresh", {
        "name": "Quotation taxes follow the customer's address",
        "model_id": _model_id(odoo, "res.partner"), "state": "code",
        "code": TAX_REFRESH_CODE, "binding_model_id": False})
    fields = odoo.search_read("ir.model.fields", [("model", "=", "res.partner"),
                                                  ("name", "in", ["state_id", "country_id"])], ["id"])
    auto_vals = {"name": "Phase 2: quotation taxes follow the customer's address",
                 "model_id": _model_id(odoo, "res.partner"), "trigger": "on_write",
                 "trigger_field_ids": [(6, 0, [f["id"] for f in fields])],
                 "filter_domain": "[]", "action_server_ids": [(6, 0, [act_id])], "active": True}
    auto = odoo.ref("p2auto", "tax_refresh")
    if auto:
        odoo.write("base.automation", [auto], auto_vals)
    else:
        odoo.upsert("p2auto", "tax_refresh", "base.automation", auto_vals)
    log.info("  tax refresh automation active (res.partner state/country -> open quotations)")


# Odoo Sign writes the client's e-mail itself (From, To and Reply-To come from
# the request's author) and sends it at once, so there is no template to put
# a CC on. Send Contract therefore passes the agents' addresses in the context
# of send_signature_accesses(); this automation runs inside mail.mail.create(),
# before the mail leaves, and adds them as CC and to the Reply-To. A client's
# "Reply" then reaches the legal@/contract@ mailbox and the agents together.
MAIL_CC_CODE = r"""
cc = env.context.get('p2_mail_cc')
if cc:
    reply_to = env.context.get('p2_mail_reply_to')
    for mail in records:
        vals = {}
        if not mail.email_cc:
            vals['email_cc'] = cc
        if reply_to:
            vals['reply_to'] = reply_to
        if vals:
            mail.sudo().write(vals)
""".strip()


def install_mail_cc(odoo):
    """CC the agents on the client's contract e-mail (see MAIL_CC_CODE)."""
    act_id = _server_action(odoo, "mail_cc", {
        "name": "Contract e-mail: CC the agents", "model_id": _model_id(odoo, "mail.mail"),
        "state": "code", "code": MAIL_CC_CODE, "binding_model_id": False})
    auto_vals = {"name": "Phase 2: contract e-mail CC", "model_id": _model_id(odoo, "mail.mail"),
                 "trigger": "on_create", "filter_domain": "[]",
                 "action_server_ids": [(6, 0, [act_id])], "active": True}
    auto = odoo.ref("p2auto", "mail_cc")
    if auto:
        odoo.write("base.automation", [auto], auto_vals)
    else:
        odoo.upsert("p2auto", "mail_cc", "base.automation", auto_vals)
    log.info("  contract e-mail CC automation active")


def install(odoo, rcic_email):
    ids = {}
    install_send_button(odoo, rcic_email)
    install_sheet_fields(odoo)
    install_sign_mail(odoo)
    relax_partner_accounting(odoo)
    migrate_lead_address(odoo)
    fix_crm_fields(odoo)
    install_stage_gate(odoo)
    install_contract_sent_stage(odoo)
    install_card_tidy(odoo)
    install_line_discounts(odoo)
    install_card_rules(odoo)
    install_state_dropdown(odoo)
    install_tax_refresh(odoo)
    install_mail_cc(odoo)
    relax_card_required(odoo)
    return ids
