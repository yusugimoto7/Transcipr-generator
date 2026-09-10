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
        codes = [l.product_id.default_code or '' for l in lines if l.product_uom_qty]
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
fname = order.x_custom_agreement_filename or 'agreement.pdf'
if not order.x_custom_agreement:
    raise UserError(
        "A link to the agreement was given but no PDF was uploaded. Open the document, "
        "download it as PDF (File > Download > PDF in Google Docs), upload it in "
        "'Custom agreement (PDF)' and send again.")
if not fname.lower().endswith('.pdf'):
    raise UserError("The custom agreement must be a PDF file, not %s." % fname)
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
last = tmpl.num_pages or 1
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
    billable = order.order_line.filtered(
        lambda l: not l.display_type and l.product_id and l.product_uom_qty
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
            ds = row.x_due_date.strftime('%B %d, %Y') if row.x_due_date else '…'
            when_en, when_fa = when_en.format(date=ds), when_fa.format(date=ds)
        note = (' – ' + row.x_note) if row.x_note else ''
        plan_en.append('%s Payment – %s – %s%s' % (ord_en[i] if i < len(ord_en) else str(i + 1), money(row.x_amount), when_en, note))
        plan_fa.append('پرداخت %s – %s – %s%s' % (ord_fa[i] if i < len(ord_fa) else str(i + 1), money(row.x_amount), when_fa, note))
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
    names = (partner.name or '').split(' ', 1)
    address = ', '.join(x for x in [partner.street, partner.street2, partner.city, partner.state_id.name, partner.zip, partner.country_id.name] if x)
    client_fa = fa(partner, 'x_name_fa', partner.name or '')
    addr_fa = fa(partner, 'x_address_fa', address)
    fam = env['x_family'].sudo().search([('x_lead_id', '=', lead.id)], order='x_sequence, id') if lead else env['x_family'].sudo()
    spouse = fam.filtered(lambda f: f.x_relation == 'spouse')[:1]
    kids = fam.filtered(lambda f: f.x_relation == 'child')
    comps = fam.filtered(lambda f: f.x_relation in ('spouse', 'child', 'companion'))
    parties_en = 'the Client, %s' % (partner.name or '')
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
    elif main.startswith(('EE', 'PNP', 'CAREGIVER', 'SPON', 'HC')):
        bio_en, bio_fa = 'Give biometrics on time as required for PR application.', 'ارائه بیومتریک به‌موقع، طبق نیاز برای درخواست اقامت دائم.'
    else:
        bio_en, bio_fa = 'Give biometrics on time as required for the application.', 'ارائه بیومتریک به‌موقع، طبق نیاز برای درخواست.'
    today = datetime.date.today()
    date_en = today.strftime('%B %d, %Y')
    file_no = order.client_order_ref or order.name
    subject_en = (order.x_agr_subject or '').strip() or (services_en[0] if services_en else '')
    subject_fa = (order.x_agr_subject_fa or '').strip() or (services_fa[0] if services_fa else '')
    sponsor = order.x_sponsor_id
    contact_en = ['Given Name: %s' % names[0], 'Family Name: %s' % (names[1] if len(names) > 1 else ''), 'Residential Address: %s' % address,
                  'Telephone/Cellphone Number: %s' % (partner.mobile or partner.phone or ''), 'E-mail: %s' % (partner.email or '')]
    if 'SPON' in kinds:
        contact_en = ['Principal Applicant’s name: %s' % (partner.name or ''), 'Sponsor’s name: %s' % (sponsor.name if sponsor else '')] + contact_en[2:]
    contact_fa = ['نام و نام خانوادگی: %s' % client_fa, 'آدرس محل سکونت: %s' % addr_fa,
                  'شماره تلفن/موبایل: %s' % (partner.mobile or partner.phone or ''), 'ایمیل: %s' % (partner.email or '')]
    scope = __SCOPE__
    sc = scope.get(main, scope.get('BC-ENT'))
    d = {
        'file_no': file_no, 'date_en': date_en, 'date_fa': date_en,
        'client_en': partner.name or '', 'client_fa': client_fa, 'addr_en': address, 'addr_fa': addr_fa,
        'phone': partner.mobile or partner.phone or '', 'email': partner.email or '',
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

    # One agreement per kind (the entrepreneur streams send two: Sugimoto + Sparkbridge).
    for prev in [order.x_sign_request_id, order.x_sign_request2_id]:
        if prev and prev.state not in ('signed', 'canceled'):
            prev.sudo().cancel()
    boxes = __BOXES__
    requests = []
    for kind in kinds:
        is_sb = kind.startswith('SB-')
        company_name = 'Sparkbridge Incubator Ltd.' if is_sb else 'Sugimoto Visa'
        d['title'] = 'Service Agreement' if kind in ('SB-A', 'SB-F') else ('Retainer Agreement' if kind != 'ENT' else 'Retainer Agreement / قرارداد مشاوره')
        d['file_label'] = ('Contract No %s' % file_no) if is_sb else ('RCIC R713046 · Client File %s' % file_no)
        pdf, _t = env['ir.actions.report'].sudo()._render_qweb_pdf('x_agreement.' + kind, [order.id], data={'d': d})
        fname = '%s - %s - %s.pdf' % (file_no, d['title'], partner.name or '')
        att = env['ir.attachment'].sudo().create({'name': fname, 'datas': b64encode(pdf), 'mimetype': 'application/pdf', 'res_model': 'sign.template'})
        tmpl = env['sign.template'].sudo().create({'attachment_id': att.id, 'name': '%s – %s – %s' % (file_no, kind, partner.name or '')})
        att.write({'res_id': tmpl.id})
        last = tmpl.num_pages or 1
        Item = env['sign.item'].sudo()
        layout = boxes['spon'] if kind == 'SPON' else boxes['page']
        role_of = {'client': 1, 'client_date': 1, 'sponsor': __SPONSOR_ROLE__, 'sponsor_date': __SPONSOR_ROLE__, 'company': 2, 'company_date': 2}
        for key, (x, y, w, h) in layout.items():
            Item.create({'template_id': tmpl.id, 'type_id': 11 if key.endswith('_date') else 1, 'responsible_id': role_of[key],
                         'required': True, 'page': last, 'posX': x, 'posY': y, 'width': w, 'height': h})
        signer = sb_signer if is_sb else rcic
        items = [(0, 0, {'partner_id': signer.id, 'role_id': 2, 'mail_sent_order': 1}),
                 (0, 0, {'partner_id': partner.id, 'role_id': 1, 'mail_sent_order': 2})]
        if kind == 'SPON':
            items.append((0, 0, {'partner_id': sponsor.id, 'role_id': __SPONSOR_ROLE__, 'mail_sent_order': 2}))
        req = env['sign.request'].sudo().with_context(no_sign_mail=True).create({
            'template_id': tmpl.id,
            'reference': '%s – %s – %s' % (file_no, d['title'], partner.name or ''),
            'subject': '%s with %s – please review and sign' % (d['title'], company_name),
            'request_item_ids': items,
        })
        req.send_signature_accesses()
        requests.append(req)
    order.write({'x_sign_request_id': requests[0].id, 'x_sign_request2_id': requests[1].id if len(requests) > 1 else False,
                 'x_agreement_kinds': ', '.join(kinds)})
    summary = 'Professional fees %s, discount %s, tax %s, contract total %s (government fees %s, excluded). Payment plan: %s' % (
        money(pro), money(disc), money(tax), money(total), money(gov), '; '.join(plan_en))
    order.message_post(body='Agreement(s) %s generated and sent for signature (%s signs first, then the client is e-mailed): %s. %s' % (
        ', '.join(kinds), rcic.name, '; '.join(r.reference for r in requests), summary), message_type='comment', subtype_xmlid='mail.mt_note')
    if lead:
        lead.sudo().message_post(body='Agreement sent for signature: %s' % '; '.join(r.reference for r in requests),
                                 message_type='comment', subtype_xmlid='mail.mt_note')
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
    sponsor_role = odoo.execute("ir.config_parameter", "get_param", "phase2.sponsor_role") or "3"
    _server_action(odoo, "send_custom", {
        "name": "Send custom agreement", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": SEND_CUSTOM_CODE, "binding_model_id": False})
    act_id = _server_action(odoo, "send_contract", {
        "name": "Send Contract", "model_id": _model_id(odoo, "sale.order"),
        "state": "code", "code": SEND_CONTRACT_CODE.replace("__SPONSOR_ROLE__", str(int(sponsor_role))), "binding_model_id": False})

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
    if vals:
        p.sudo().write(vals)
""".strip()

FAMILY_MODEL = "x_family"
RELATIONS = [("spouse", "Accompanying spouse"), ("child", "Dependent child"), ("companion", "Companion"),
             ("guardian", "Parent / guardian"), ("sponsor", "Sponsor")]


def _inherit_view(odoo, model, key, name, arch):
    parents = odoo.search_read("ir.ui.view", [("model", "=", model), ("type", "=", "form"), ("inherit_id", "=", False)], ["id", "name"])
    parents.sort(key=lambda v: (v["name"] not in (f"{model}.form", "crm.lead.form", "res.partner.form", "sale.order.form")))
    view_id = odoo.ref("p2view", key)
    for parent in parents:
        try:
            if view_id:
                odoo.write("ir.ui.view", [view_id], {"inherit_id": parent["id"], "arch_db": arch})
            else:
                view_id, _ = odoo.upsert("p2view", key, "ir.ui.view", {
                    "name": name, "model": model, "inherit_id": parent["id"], "arch_db": arch, "priority": 99})
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
        '<group><group string="Residential address (printed on the agreement)">'
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
    fields = odoo.search_read("ir.model.fields", [("model", "=", "crm.lead"),
        ("name", "in", ["street", "street2", "city", "zip", "state_id", "country_id", "x_name_fa", "x_address_fa", "x_national_id", "partner_id"])], ["id"])
    sync = _server_action(odoo, "lead_sync", {"name": "CRM card -> customer address", "model_id": _model_id(odoo, "crm.lead"),
                                              "state": "code", "code": LEAD_SYNC_CODE, "binding_model_id": False})
    auto_vals = {"name": "Phase 2: CRM card address -> customer", "model_id": _model_id(odoo, "crm.lead"),
                 "trigger": "on_create_or_write", "trigger_field_ids": [(6, 0, [f["id"] for f in fields])],
                 "filter_domain": "[('partner_id', '!=', False)]", "action_server_ids": [(6, 0, [sync])], "active": True}
    auto = odoo.ref("p2auto", "lead_sync")
    if auto:
        odoo.write("base.automation", [auto], auto_vals)
    else:
        odoo.upsert("p2auto", "lead_sync", "base.automation", auto_vals)

    # Paper format + the ten reports.
    pf = odoo.search_read("report.paperformat", [("name", "=", "Contracts - US Letter")], ["id"], limit=1)
    pf_id = pf[0]["id"] if pf else odoo.execute("report.paperformat", "create", {
        "name": "Contracts - US Letter", "format": "Letter", "orientation": "Portrait", "margin_top": 30,
        "margin_bottom": 26, "margin_left": 16, "margin_right": 16, "header_spacing": 22, "dpi": 90})
    done = agreements.install(odoo, pf_id)
    log.info("  agreement reports installed: %s", ", ".join(done))
    return done


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


def install(odoo, rcic_email):
    ids = {}
    install_send_button(odoo, rcic_email)
    relax_partner_accounting(odoo)
    migrate_lead_address(odoo)
    install_state_dropdown(odoo)
    return ids
