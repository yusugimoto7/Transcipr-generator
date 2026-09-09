# -*- coding: utf-8 -*-
"""The ten agreement templates as data-driven QWeb reports on sale.order.

Every value that changes per client is a placeholder (lib.V / lib.DL /
lib.FEE_D) read from the dictionary ``d`` that the Send Contract action
passes as report data. install() upserts one qweb view + one report per
kind on the database; SIGN_BOXES gives the signature/date box positions on
the (always separate) last page for Odoo Sign.
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from lib import P, PS, H, UL, OL, SIG, V, DL, NL, FEE_D, qweb
import sg_clauses as sg
import sb_clauses as sb

REPORT_PREFIX = "x_agreement."

D = lambda k: V(f"d['{k}']")          # scalar placeholder
L = lambda k: f"d['{k}']"             # expression for lists

# ---------------- shared pieces ----------------
def _sg_contact(no_en="15.", no_fa="۱۵."):
    rc_en = ["Given Name: Hamed", "Family Name: Sugimoto", "RCIC Member Number: R713046",
             f"Business Address: {sg.RCIC_ADDR}", "Telephone Number: +1 (778) 200-8856", f"E-mail: {D('rcic_email')}"]
    rc_fa = ["نام: حامد", "نام خانوادگی: سوگیموتو", "شماره عضویت مشاور: R713046",
             f"آدرس: {sg.RCIC_ADDR}", "تلفن: +1 (778) 200-8856", f"ایمیل: {D('rcic_email')}"]
    en = H(f"{no_en} Contact Information") + P("Client") + DL(L("contact_en")) + P("RCIC") + UL(rc_en)
    fa = H(f"{no_fa} اطلاعات تماس") + P("متقاضی") + DL(L("contact_fa")) + P("RCIC") + UL(rc_fa)
    return (en, fa)

def _sg_billing(no="5", no_fa="۵", note_en=sg.FEE_NOTE_EN, note_fa=sg.FEE_NOTE_FA):
    en = (H(f"{no}. Billing Method and Payment Schedule") + P(f"{no}.1 Billing Method") +
          P(f"The Client will be billed a flat fee based on milestones. All payments will be in {D('currency_en')}. The details of the payment terms and conditions are as follows:") +
          FEE_D(L("fee_rows_en"), "Total Cost", L("total")) + P(note_en, "small") +
          P(f"{no}.2 Payment Schedule") + P("Fees shall be paid by the Client to the Consultant as follows:") + NL(L("schedule_en")))
    fa = (H(f"{no_fa}. مبلغ قرارداد و شرایط پرداخت") + P(f"{no_fa}.۱ شرایط پرداخت") +
          P(f"یک هزینه ثابت برای متقاضی صورت‌حساب می‌شود. تمام پرداخت ها به {D('currency_fa')} خواهد بود. جزئیات شرایط و ضوابط پرداخت به شرح زیر است:") +
          FEE_D(L("fee_rows_fa"), "هزینه کل", L("total")) + P(note_fa, "small") +
          P(f"{no_fa}.۲ شیوه پرداخت") + P("هزینه ها باید توسط متقاضی به مشاور به صورت زیر پرداخت گردد:") + NL(L("schedule_fa")))
    return (en, fa)

SIG_SG_BI = SIG([("Signature of Client / امضای موکل", "Signature / امضا"), ("Signature of RCIC / امضای مشاور", "Signature / امضا")])
SIG_SG_EN = SIG([("Signature of Client", "Signature"), ("Signature of RCIC", "Signature")])
SIG_SB_BI = SIG([("Signature of Client / امضای متقاضی", "Signature / امضا"), ("Ken Sugimoto, Director – SparkBridge Incubator Ltd.", "Signature / امضا")])

DOCS = {}

# ---------------- TR (bilingual) ----------------
DOCS["TR"] = dict(company="SG", title=D("title"), file_label=D("file_label"), layout="bilingual", sig_page=True, rows=[
  sg.file_row(D("file_no")),
  sg.preamble(D("date_en"), D("date_fa"), D("client_en"), D("addr_en"), D("client_fa"), D("addr_fa")),
  sg.DEFINITIONS,
  (H("2. Service") + P("2.1 Type of service offered:") + DL(L("services_en")),
   H("۲. خدمات") + P("۲.۱ نوع خدمات ارائه شده:") + DL(L("services_fa"))),
  sg.rcic_duties(D("parties_en"), D("parties_fa")),
  sg.client_duties(D("bio_en"), D("bio_fa"), months_note=False),
  _sg_billing(),
  sg.COMMS, sg.REFUND, sg.DISPUTE, sg.CONFID, sg.FORCE, sg.CHANGE, sg.TERMINATION, sg.LAW,
  sg.misc(),
  _sg_contact(),
  sg.WITNESS,
  SIG_SG_BI,
])

# ---------------- PFL (bilingual, TR skeleton) ----------------
DOCS["PFL"] = dict(company="SG", title=D("title"), file_label=D("file_label"), layout="bilingual", sig_page=True, rows=[
  sg.file_row(D("file_no")),
  sg.preamble(D("date_en"), D("date_fa"), D("client_en"), D("addr_en"), D("client_fa"), D("addr_fa")),
  sg.DEFINITIONS,
  sg.service_pfl(D("subject_en"), D("subject_fa"), D("letter_date"), D("letter_date"), D("deadline"), D("deadline"), D("ref")),
  sg.rcic_duties_pfl(D("parties_en"), D("parties_fa")),
  sg.client_duties_pfl(D("internal_deadline"), D("internal_deadline")),
  _sg_billing(note_en=sg.FEE_NOTE_PFL_EN, note_fa=sg.FEE_NOTE_PFL_FA),
  sg.COMMS, sg.REFUND_PFL, sg.DISPUTE, sg.CONFID, sg.FORCE, sg.CHANGE, sg.TERMINATION_PFL, sg.LAW,
  sg.misc(),
  _sg_contact(),
  sg.WITNESS,
  SIG_SG_BI,
])

# ---------------- PR (English) ----------------
from build import pr_common, pr_tail, PR_TAIL_NOTE  # noqa: E402  (English PR clause set)

def _pr_head():
    return [
      P(f"RCIC Member Number: R713046 — Client File Number: {D('file_no')}", "meta"),
      PS(f"This Retainer Agreement is made on {D('date_en')}, between RCIC Hamed Sugimoto, located at {sg.RCIC_ADDR}, and the Client {D('client_en')}, located at {D('addr_en')}.",
         "WHEREAS the RCIC and the Client wish to enter into a written agreement which contains the agreed-upon terms and conditions upon which the RCIC will provide his/her services to the Client.",
         "AND WHEREAS the RCIC is a member of the College of Immigration and Citizenship Consultants (CICC), the regulator in Canada for immigration consultants;",
         "IN CONSIDERATION of the mutual covenants contained in this Agreement, the parties agree as follows:"),
    ]

def _pr_billing(note=PR_TAIL_NOTE, extra=""):
    return (H("4. Billing Method and Payment Schedule") + P("4.1 Billing Method") +
            P(f"The Client will be billed a flat fee based on milestones. All payments will be in {D('currency_en')}. The details of the payment terms and conditions are as follows:") +
            FEE_D(L("fee_rows_en"), "Total Cost", L("total")) + P(note, "small") +
            P("4.2 Payment Schedule") + P("Fees shall be paid by the Client to the Consultant as follows:") + NL(L("schedule_en")) + extra)

def _pr_contact(label="Client"):
    return (H("14. Contact Information") + P(label) + DL(L("contact_en")) + P("RCIC") +
            UL(["Given Name: Hamed", "Family Name: Sugimoto", "RCIC Member Number: R713046", f"Business Address: {sg.RCIC_ADDR}",
                "Telephone Number: +1 (778) 200-8856", f"E-mail: {D('rcic_email')}"]) +
            P("IN WITNESS THEREOF, this Agreement has been duly executed by the parties hereto on the date first above written."))

DOCS["PR"] = dict(company="SG", title=D("title"), file_label=D("file_label"), layout="en", sig_page=True, rows=[
  *_pr_head(),
  *pr_common(P(f"The Client asked the RCIC, and the RCIC has agreed to act for {D('parties_en')}, in the matter of {D('program_en')}.")),
  _pr_billing(),
  *pr_tail(),
  _pr_contact(),
  SIG_SG_EN,
])

# ---------------- SPON (English, two clients) ----------------
_spon_note = PR_TAIL_NOTE.replace("pre-determined dates as follows. ", "pre-determined dates as follows. The RCIC’s obligations under this Agreement are strictly conditional upon payment of the first installment. Should the first installment remain unpaid for a period of ten (10) days, this Agreement shall automatically terminate without any further obligation or liability on the part of the RCIC, unless otherwise agreed to by the Parties in advance. ")
DOCS["SPON"] = dict(company="SG", title=D("title"), file_label=D("file_label"), layout="en", sig_page=True, rows=[
  P(f"RCIC Member Number: R713046 — Client File Number: {D('file_no')}", "meta"),
  PS(f"This Retainer Agreement was made on {D('date_en')}, between RCIC Hamed Sugimoto, located at {sg.RCIC_ADDR}, and the Clients, {D('client_en')} (the principal applicant) and {D('sponsor_en')} (the sponsor), located at {D('addr_en')}.",
     "WHEREAS the RCIC and the Client wish to enter into a written agreement which contains the agreed-upon terms and conditions upon which the RCIC will provide his/her services to the Client.",
     "AND WHEREAS the RCIC is a member of the College of Immigration and Citizenship Consultants (CICC), the regulator in Canada for immigration consultants;",
     "IN CONSIDERATION of the mutual covenants contained in this Agreement, the parties agree as follows:"),
  *pr_common(P(f"The Client asked the RCIC, and the RCIC has agreed to act for the principal applicant, {D('client_en')}, and the sponsor, {D('sponsor_en')}, in the matter of {D('program_en')}:")),
  _pr_billing(note=_spon_note, extra=P("All required government fees, including the application fee, the right of permanent residence fee, and the biometrics fees, must be paid before submitting the PR application on IRCC portal.")),
  *pr_tail(),
  _pr_contact("Clients"),
  SIG([("Signature of Principal Applicant", "Signature"), ("Signature of Sponsor", "Signature")]) + SIG([("Signature of RCIC", "Signature")]),
])

# ---------------- ENT (bilingual, Sugimoto part of the entrepreneur streams) ----------------
_duties = sg.rcic_duties(D("parties_en"), D("parties_fa"))
_ent_note_en = PR_TAIL_NOTE.replace("pre-determined dates as follows. ", "pre-determined dates as follows. The RCIC’s obligations under this Agreement are strictly conditional upon payment of the first installment. Should the first installment remain unpaid for a period of ten (10) days, this Agreement shall automatically terminate without any further obligation or liability on the part of the RCIC, unless otherwise agreed to by the Parties in advance. ")
_ent_note_fa = "حق‌الزحمه حرفه‌ای شامل هزینه‌های دولتی، هزینه‌های ثبت‌نام، انگشت‌نگاری، معاینات پزشکی و سایر هزینه‌های مربوط به درخواست برنامه و هر هزینه دیگری که متقاضی موظف به پرداخت به اشخاص ثالث است، نمی‌شود. مبلغ فوق توسط متقاضی پرداخت می‌شود و با توافق طرفین قابل تغییر است. تعهدات RCIC طبق این قرارداد منوط به پرداخت قسط اول است؛ در صورت عدم پرداخت قسط اول ظرف ده (۱۰) روز، این قرارداد بدون هیچ تعهد یا مسئولیت دیگری از سوی RCIC خود‌به‌خود خاتمه می‌یابد، مگر اینکه طرفین از قبل به‌گونه دیگری توافق کرده باشند. هزینه‌های دولتی به آخرین هزینه‌های مورد نیاز IRCC یا دولت استانی اشاره دارد و ممکن است بدون اطلاع قبلی تغییر کند."
def _renum(pair, *subs):
    return tuple(_apply(x, subs) for x in pair)
def _apply(x, subs):
    for a, b in subs:
        x = x.replace(a, b)
    return x
DOCS["ENT"] = dict(company="SG", title=D("title"), file_label=D("file_label"), layout="bilingual", sig_page=True, rows=[
  sg.file_row(D("file_no")),
  sg.preamble(D("date_en"), D("date_fa"), D("client_en"), D("addr_en"), D("client_fa"), D("addr_fa")),
  sg.DEFINITIONS,
  (H("2. RCIC Responsibilities and Commitments") + P(f"The Client asked the RCIC, and the RCIC has agreed to act for {D('parties_en')}, in the matter of {D('program_en')} by following the program:") + DL(L("scope_en")) + _duties[0].split("</h2>", 1)[1].split("</p>", 1)[1],
   H("۲. مسئولیت‌ها و تعهدات مشاور RCIC") + P(f"موکل از مشاور درخواست کرده و مشاور پذیرفته است که به نمایندگی از {D('parties_fa')}، در خصوص پرونده {D('program_fa')} در مراحل زیر اقدام نماید:") + DL(L("scope_fa")) + _duties[1].split("</h2>", 1)[1].split("</p>", 1)[1]),
  _renum(sg.client_duties(D("bio_en"), D("bio_fa"), months_note=False), ("4. Client Responsibilities", "3. Client Responsibilities"), ("۴. مسئولیت", "۳. مسئولیت")),
  _sg_billing("4", "۴", note_en=_ent_note_en, note_fa=_ent_note_fa),
  _renum(sg.COMMS, ("6. Communication", "5. Communications"), ("۶. ارتباطات", "۵. ارتباطات")),
  _renum(sg.REFUND, ("7. Refund", "6. Refund"), ("۷. شرایط", "۶. شرایط")),
  _renum(sg.DISPUTE, ("8. Dispute", "7. Dispute"), ("۸. حل", "۷. حل")),
  _renum(sg.CONFID, ("9. Confidentiality", "8. Confidentiality"), ("۹. محرمانگی", "۸. محرمانگی")),
  _renum(sg.FORCE, ("10. Force", "9. Force"), ("۱۰. موارد", "۹. موارد")),
  _renum(sg.CHANGE, ("11. Change", "10. Change"), ("۱۱. سیاست", "۱۰. سیاست")),
  _renum(sg.TERMINATION, ("12. Termination", "11. Termination"), ("۱۲. مهلت", "۱۱. فسخ"), ("12.", "11."), ("۱۲.", "۱۱.")),
  _renum(sg.LAW, ("13. Governing", "12. Governing"), ("۱۳. قانون", "۱۲. قانون")),
  _renum(sg.misc(), ("14.", "13."), ("۱۴.", "۱۳.")),
  _sg_contact("14.", "۱۴."),
  sg.WITNESS,
  SIG_SG_BI,
])

# ---------------- SB-A EU study admission (bilingual) ----------------
_rows = sb.sba_rows(D("file_no"), D("date_en"), D("client_en"), D("client_fa"), D("addr_en"), D("addr_fa"),
                    D("country_en"), D("country_fa"), D("phone"), D("email"), D("p1"), D("p2"), D("fee_total"), D("fee_total"))
_rows.append(SIG_SB_BI)
DOCS["SB-A"] = dict(company="SB", title=D("title"), file_label=D("file_label"), layout="bilingual", sig_page=True, rows=_rows)

# ---------------- SB-C EU start-up visa (bilingual) ----------------
_rows = sb.retainer_head(D("file_no"), D("date_en"), D("date_fa"), D("client_en"), D("client_fa"), D("nid"), D("addr_en"), D("addr_fa"), D("phone"), D("email"))
_rows += sb.sbc_body(D("country_en"), D("country_fa"), D("fee_total"), (DL(L("inst_en")), DL(L("inst_fa"))),
                     companions_en=D("companions_en"), companions_fa=D("companions_fa"))
_rows += [sb.validation_sb([D("companions_en")], [D("companions_fa")]), SIG_SB_BI]
DOCS["SB-C"] = dict(company="SB", title=D("title"), file_label=D("file_label"), layout="bilingual", sig_page=True, rows=_rows)

# ---------------- SB-D BC business advisory / SB-E Alberta DA LoR (bilingual) ----------------
for _k, _body in (("SB-D", sb.sbd_body), ("SB-E", sb.sbe_body)):
    _rows = sb.retainer_head(D("file_no"), D("date_en"), D("date_fa"), D("client_en"), D("client_fa"), D("nid"), D("addr_en"), D("addr_fa"), D("phone"), D("email"))
    _rows += _body(D("fee_total"), D("p1"), D("p2"))
    _rows += [sb.validation_sb(), SIG_SB_BI]
    DOCS[_k] = dict(company="SB", title=D("title"), file_label=D("file_label"), layout="bilingual", sig_page=True, rows=_rows)

# ---------------- SB-F business event (English) ----------------
_rows = sb.sbf_rows(D("file_no"), D("date_en"), D("client_en"), D("addr_en"), D("fee_total"), D("email"))
_rows.append(SIG([(f"Client: {D('client_en')}", "Signature"), ("Company: Ken Sugimoto, CEO", "Signature")]))
DOCS["SB-F"] = dict(company="SB", title=D("title"), file_label=D("file_label"), layout="en", sig_page=True, rows=_rows)

def archs():
    """kind -> qweb arch (report_name = x_agreement.<kind>)."""
    return {k: qweb(REPORT_PREFIX + k, doc) for k, doc in DOCS.items()}


def install(odoo, paperformat_id=None):
    """Upsert the qweb views and reports on sale.order; returns {kind: report_id}."""
    import xml.etree.ElementTree as ET
    out = {}
    model_id = odoo.search_read("ir.model", [("model", "=", "sale.order")], ["id"], limit=1)[0]["id"]
    for kind, arch in archs().items():
        ET.fromstring(arch.encode("utf-8"))  # must be well-formed XML
        key = REPORT_PREFIX + kind
        view = odoo.search_read("ir.ui.view", [("key", "=", key), ("type", "=", "qweb")], ["id"], limit=1)
        vals = {"name": key, "key": key, "type": "qweb", "arch_db": arch, "mode": "primary"}
        if view:
            odoo.write("ir.ui.view", [view[0]["id"]], {"arch_db": arch})
            vid = view[0]["id"]
        else:
            vid = odoo.execute("ir.ui.view", "create", vals)
        rep = odoo.search_read("ir.actions.report", [("report_name", "=", key)], ["id"], limit=1)
        rvals = {"name": f"Agreement {kind}", "model": "sale.order", "model_id": model_id, "report_type": "qweb-pdf",
                 "report_name": key, "report_file": key, "binding_model_id": False,
                 "print_report_name": "'Agreement %s - ' + object.name" % kind}
        if paperformat_id:
            rvals["paperformat_id"] = paperformat_id
        if rep:
            odoo.write("ir.actions.report", [rep[0]["id"]], rvals); rid = rep[0]["id"]
        else:
            rid = odoo.execute("ir.actions.report", "create", rvals)
        out[kind] = (vid, rid)
    return out


if __name__ == "__main__":
    import xml.etree.ElementTree as ET
    for k, a in archs().items():
        ET.fromstring(a.encode("utf-8"))
        print(k, len(a), "chars, placeholders:", a.count("<t t-esc="))
