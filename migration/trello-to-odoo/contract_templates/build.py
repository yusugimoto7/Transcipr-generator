# -*- coding: utf-8 -*-
"""Assemble the nine sample agreements (real numbers from the source documents)."""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from lib import P, PS, H, UL, OL, FEE, SIG, RAW, qweb, preview_html
import sg_clauses as sg
import sb_clauses as sb

DOCS = {}

# ---------------- SG-TR : S25203 Pardis Hassanpour ----------------
rows = [
  sg.file_row("S25203"),
  sg.preamble("September 13, 2025", "September 13, 2025", "Pardis Hassanpour",
              "No. 4, Rooh Parvar Dead End, Khojasteh Alley, Khaghani Street, Isfahan, Iran",
              "پردیس حسن پور", "ایران، اصفهان، خیابان خاقانی، کوچه خجسته، بن بست روح پرور، پلاک ۴"),
  sg.DEFINITIONS,
  sg.service(["Study Permit", "Work Permit", "Visitor Visa"], ["مجوز تحصیلی", "مجوز کار", "ویزای توریستی"]),
  sg.rcic_duties(*sg.parties("Pardis Hassanpour", "پردیس حسن پور")),
  sg.client_duties("Give biometrics on time as required for Work Permit, Study Permit, and Visitor Visa applications.",
                   "ارائه بیومتریک‌ها به‌موقع، طبق نیاز برای درخواست‌های مجوز کار، مجوز تحصیل و ویزای توریستی.", months_note=False),
  sg.billing([("Professional Fees", "$2,200.00 CAD"), ("Government Fees", "$150.00 CAD"), ("Biometrics Fee", "$85.00 CAD"), ("Discount", "($400.00) CAD")], ("Total Cost", "$2,035.00 CAD"),
             [("هزینه‌های حرفه‌ای", "$2,200.00 CAD"), ("هزینه‌های دولتی", "$150.00 CAD"), ("هزینه بیومتریک", "$85.00 CAD"), ("تخفیف", "($400.00) CAD")], ("هزینه کل", "$2,035.00 CAD"),
             ["1st Payment – $1,017.50 CAD within 7 business days upon the Retainer Agreement,", "2nd Payment – $1,017.50 CAD before submission of Client’s application."],
             ["پرداخت اول – مبلغ $1,017.50 CAD ظرف 7 روز کاری هنگام انعقاد قرارداد.", "پرداخت دوم – $1,017.50 CAD قبل از ارسال درخواست متقاضی."]),
  sg.COMMS, sg.REFUND, sg.DISPUTE, sg.CONFID, sg.FORCE, sg.CHANGE, sg.TERMINATION, sg.LAW,
  sg.misc(),
  sg.contact(["Given Name: Pardis", "Family Name: Hassanpour", "Residential Address: No. 4, Rooh Parvar Dead End, Khojasteh Alley, Khaghani Street, Isfahan, Iran", "Telephone/Cellphone Number: 989131922669", "E-mail: pardis.hassanpour.66@gmail.com"],
             ["نام: پردیس", "نام خانوادگی: حسن پور", "آدرس محل سکونت: ایران، اصفهان، خیابان خاقانی، کوچه خجسته، بن بست روح پرور، پلاک ۴", "شماره تلفن/موبایل: 989131922669", "ایمیل: pardis.hassanpour.66@gmail.com"]),
  sg.WITNESS,
  SIG([("Signature of Client", "Signature"), ("Signature of RCIC", "Signature")]),
]
DOCS["sg_tr"] = dict(company="SG", title="Retainer Agreement", file_label="RCIC R713046 · Client File S25203", layout="bilingual", rows=rows)

# ---------------- SG-PR : S25205 Zahrasadat Nourbakhsh (English only) ----------------
def pr_common(program_html, biometrics="Give biometrics on time as required for PR application."):
    return [
      H("1. Definitions") + P("The terms “Client,” “CICC,” “Disbursement,” and “RCIC” shall have the meaning given to such terms in the Retainer Agreement Regulation of the Council. The Client acknowledges that he/she has access to the CICC Code of Professional Conduct through the College website."),
      H("2. RCIC Responsibilities and Commitments") + program_html +
      P("In consideration of the fees paid and the matter stated above, the RCIC agrees to do the following:") +
      OL(["Representing the file of the Client.",
          "Checking and verifying that all Client (s) documents and forms meet the requirements of the Immigration Regulations. Please note that some of the work to be undertaken may be delegated to employees or contracted out in order to expedite the processing of the work associated with the application.",
          "Preparing and filing submissions for online applications and/or by mail.",
          "Verify and ensure all submissions are on time as specified by the regulations.",
          "Communication with the visa officer, if required, for clarification until the final decision is reached.",
          "Ensuring that all applicable government fee payments for applications are duly paid on behalf of the Client.",
          "Please be advised that information and documents may be shared with employees who may be involved in this case, both salaried and contracted, and they may be shared with outside parties in the event of a complaint, investigation, tribunal or if required by law.",
          "Track the CLIENT’s file through the entire immigration process and endeavor to provide quality consulting services and to adequately supervise any employees participating or assisting in this process. A list of employees who might assist in the Client’s case is listed on the official website: https://sugimotovisa.com/",
          "The estimated timeframe for processing the application is in accordance with the approximate timeframes provided on the official website of IRCC, and RCIC shall have no control over it: https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html",
          "RCIC shall, if needed, obtain the assistance of a translator for communicating with the Client. Fees for such services shall be paid by the Client.",
          "If RCIC receives any original documents from the Client, he shall return such original documents as soon as the purpose for receiving these documents is achieved."]),
      H("3. Client Responsibilities and Commitments") + P("3.1 The Client must provide, upon request from the RCIC:") +
      UL(["All necessary documentation is required by Immigration, Refugee, and Citizenship Canada.", "All documentation is in English or French, or has a certified English/French official translation.", "Inform RCIC of the change of status, address, and any information that bears to the Client(s) application.", biometrics]) +
      PS("3.2 The Client understands that they must be accurate, honest, and genuine in the information they provide. Any inaccuracies may void this Agreement or seriously affect the outcome of the application or the retention of any status they may obtain. The RCIC’s obligations under the Retainer Agreement are null and void if the Client provides any inaccurate, misleading, or false material information. The Client’s financial obligations remain.",
         "3.3 In the event Immigration, Refugees and Citizenship Canada (IRCC) or Employment and Social Development Canada (ESDC) should contact the Client directly, the Client is instructed to notify the RCIC immediately.",
         "3.4 The Client is to immediately advise the RCIC of any change in the marital, family, or civil status or change of physical address or contact information for any person included in the application.",
         "3.5 The client has confirmed that they are responsible for providing their Resume (CV) and all required documents and information in English or French. RCIC may only give advice on the structure. It is only the client’s responsibility to provide, check, and confirm the CV.",
         "3.6 In the event of a Joint Retainer Agreement, the Clients understand that no information received in connection with the matter from one Client can be treated as confidential so far as any of the other Clients are concerned and that if a conflict develops, that cannot be resolved, the RCIC cannot continue to act for both or all of the Clients and may have to withdraw completely.",
         "3.7 The Client understands that they have the option to engage third parties to facilitate admission into educational institutions based on their preference and request. Under no circumstances is the Client required to employ the services of RCIC for the purpose of securing admission to any institution. Should the Client choose to engage RCIC's services for this specific purpose, RCIC agrees to provide such services at no additional cost, with all fees paid under this agreement pertaining solely to immigration services. Furthermore, the Client acknowledges and consents to the possibility of RCIC receiving commissions from educational institutions as part of this arrangement.",
         "3.8 If the Client fails to deliver the requested documents within 150 days to RCIC, RCIC shall have the right to terminate this agreement, in which case, he/she shall be entitled to receive all dues as a service fee.",
         "3.9 The Client confirms that services will be provided in English as the official language of communication."),
    ]

PR_TAIL_NOTE = ("*Professional fees exclude government fees, registration fees, biometrics fees, medical exam fees, and other fees regarding the program application, as well as any other fees that the client(s) are obligated to pay to any third party(ies). The above amount is to be paid by the Client(s) and is subject to change upon mutual agreement of both parties. The Client(s) will be billed by milestones and pre-determined dates as follows. "
                "*Government fees refer to the latest fees required by IRCC or Provincial (Territorial) governments. These fees may change and need to be paid by the client. If necessary, the client can pay the government fees to the RCIC, who will then forward the payment to the government.")

def pr_billing(fee_rows, total, schedule, note=PR_TAIL_NOTE, extra=""):
    return (H("4. Billing Method and Payment Schedule") + P("4.1 Billing Method") +
            P("The Client will be billed a flat fee based on milestones. All payments will be in Canadian Dollars. The details of the payment terms and conditions are as follows:") +
            FEE(fee_rows, total) + P(note, "small") + P("4.2 Payment Schedule") + P("Fees shall be paid by the Client to the Consultant as follows:") + OL(schedule) + extra)

def pr_tail(refund_extra=""):
    return [
      sg.COMMS[0].replace("6. Communication", "5. Communications"),
      H("6. Refund Policy") + P("The Client acknowledges that granting a visa or status and the time required for processing this application are at the sole discretion of the government of Canada and not the RCIC and any staff and/or contractors.") +
        UL(["Unused fees, if any, will be refunded to the Client or his or her Designate.", "Fees are non-refundable in cases of application refusal or processing delays caused by the Government of Canada, including IRCC, CBSA, or related authorities."]),
      sg.DISPUTE[0].replace("8. Dispute", "7. Dispute"),
      H("8. Confidentiality") + P("All information and documentation reviewed by the RCIC, required by IRCC and all other governing bodies, and used for the preparation of the application will not be divulged to any third party, other than agents and employees, without prior consent, except as demanded by law. The RCIC and all agents and employees of the RCIC are also bound by the confidentiality requirements of (24. q) of the Code of Professional Ethics. The Client agrees to the use of electronic communication and storage of confidential information. The RCIC will use his/her best efforts to maintain a high degree of security for electronic communication and information storage. If the RCIC becomes incapacitated or otherwise unable to continue providing services, the Client’s file will be transferred to a successor representative, or returned, according to the CICC Code of Professional Conduct. RCIC will maintain the confidentiality of the Client’s information in accordance with Article 8.1 of the Code of Professional Conduct."),
      sg.FORCE[0].replace("10. Force", "9. Force"),
      sg.CHANGE[0].replace("11. Change", "10. Change") ,
      H("11. Termination") + P("According to The Code of Professional Conduct the licensee may terminate this agreement prior to its completion by providing reasonable notice and for good cause, including but not limited to the client's provision of misleading information, failure to cooperate or provide adequate instructions, or failure to pay agreed fees and expenses, provided that such termination does not result in serious prejudice to the client. Furthermore, this agreement is considered terminated as follows:") +
        PS("11.1 This Agreement is considered terminated upon completion of tasks identified under section 2 of this Agreement.",
           "11.2 This Agreement is considered terminated if material changes occur to the Client’s application or eligibility, which make it impossible to proceed with the services detailed in section 2 of this Agreement.",
           "11.3 This Agreement may be terminated, upon writing, by the Client, at which time any outstanding fees or Disbursements will be refunded by the RCIC to the Client/any outstanding fees or Disbursements will be remitted by the Client to the RCIC. If the agreement is terminated before completion, RCIC will return all original documents, issue a final invoice, and refund any unused trust funds."),
      sg.LAW[0].replace("13. Governing", "12. Governing").replace("Section 8 hereof", "Section 7 hereof"),
      H("13. Miscellaneous") + PS(
        "13.1 This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, warranties, representations, negotiations, and discussions, whether oral or written, of the parties except as specifically set forth herein.",
        "13.2 This Agreement shall be binding upon the parties hereto and their respective heirs, administrators, successors, and permitted assigns.",
        "13.3 This Agreement may only be altered or amended when such changes are made in writing and executed by the parties hereto.",
        "13.4 The provisions of this Agreement shall be deemed severable. If any provision of this Agreement shall be held unenforceable by any court of competent jurisdiction, such provision shall be severed from this Agreement, and the remaining provisions shall remain in full force and effect.",
        "13.5 The headings utilized in this Agreement are for convenience only and are not to be construed in any way as additions to or limitations of the covenants and agreements contained in this Agreement.",
        "13.6 Each of the parties hereto shall do and execute or cause to be done or executed all such further and other things, acts, deeds, documents, and assurances as may be necessary or reasonably required to carry out the intent and purpose of this Agreement fully and effectively.",
        "13.7 The Client acknowledges that they have had sufficient time to review this Agreement and were given the opportunity to obtain independent legal advice and translation prior to the execution and delivery of this Agreement. In the event the Client did not seek independent legal advice prior to signing this Agreement, they did so voluntarily without any undue pressure and agree that the failure to obtain independent legal advice shall not be used as a defense to the enforcement of obligations created by this Agreement. Furthermore, the Client acknowledges that he/she has received a copy of this Agreement and agrees to be bound by its terms.",
        "13.8 The Client acknowledges that they have requested that the Agreement be written in the English language."),
    ]

def pr_contact(client_lines, rcic_email="info@sugimotovisa.com"):
    return (H("14. Contact Information") + P("Client") + UL(client_lines) + P("RCIC") +
            UL(["Given Name: Hamed", "Family Name: Sugimoto", "RCIC Member Number: R713046", f"Business Address: {sg.RCIC_ADDR}", "Telephone Number: +1 (778) 200-8856", f"E-mail: {rcic_email}"]) +
            P("IN WITNESS THEREOF, this Agreement has been duly executed by the parties hereto on the date first above written."))

program = P("The Client asked the RCIC, and the RCIC has agreed to act for the Client, Zahrasadat Nourbakhsh, in the matter of Permanent Residence Application by following the program: PNP and Express Entry.")
rows = [
  P("RCIC Member Number: R713046 — Client File Number: S25205", "meta"),
  PS(f"This Retainer Agreement is made on May 18, 2025, between RCIC Hamed Sugimoto, located at {sg.RCIC_ADDR}, and the Client Zahrasadat Nourbakhsh, located at 181 Ravine Dr, Port Moody.",
     "WHEREAS the RCIC and the Client wish to enter into a written agreement which contains the agreed-upon terms and conditions upon which the RCIC will provide his/her services to the Client.",
     "AND WHEREAS the RCIC is a member of the College of Immigration and Citizenship Consultants (CICC), the regulator in Canada for immigration consultants;",
     "IN CONSIDERATION of the mutual covenants contained in this Agreement, the parties agree as follows:"),
  *pr_common(program),
  pr_billing([("Professional Fees", "$4,000.00 CAD"), ("Applicable Tax (GST)", "$200.00 CAD")], ("Total Cost", "$4,200.00 CAD"),
             ["1st Payment – $1,000 CAD within 7 business days upon the Retainer Agreement date,", "2nd Payment – $3,200 CAD + government fees before submitting the PR application."]),
  *pr_tail(),
  pr_contact(["Given Name: Zahrasadat", "Family Name: Nourbakhsh", "Residential Address: 181 Ravine Dr, Port Moody", "Telephone/Cellphone Number: 9009202170217", "E-mail: zahranoorbakhsh26@gmail.com"]),
  SIG([("Signature of Client", "Signature"), ("Signature of RCIC", "Signature")]),
]
DOCS["sg_pr"] = dict(company="SG", title="Retainer Agreement", file_label="RCIC R713046 · Client File S25205", layout="en", rows=rows)

# ---------------- SG-SPON : S26256 Tandis Hakaki + sponsor (English only) ----------------
program = P("The Client asked the RCIC, and the RCIC has agreed to act for the principal applicant, Tandis Hakaki, and the sponsor, Seyed Shayan Hosseini, in the matter of the Permanent Residence Application under the Common-law/Spousal Sponsorship program (outland applications):")
spon_note = PR_TAIL_NOTE.replace("pre-determined dates as follows. ", "pre-determined dates as follows. The RCIC’s obligations under this Agreement are strictly conditional upon payment of the first installment. Should the first installment remain unpaid for a period of ten (10) days, this Agreement shall automatically terminate without any further obligation or liability on the part of the RCIC, unless otherwise agreed to by the Parties in advance. ")
rows = [
  P("RCIC Member Number: R713046 — Client File Number: S26256", "meta"),
  PS(f"This Retainer Agreement was made on September 4th, 2026, between RCIC Hamed Sugimoto, located at 501-3292 Production Way, Burnaby, BC V5A 4R4, Canada, and the Clients, Tandis Hakaki (the principal applicant) and Seyed Shayan Hosseini (the sponsor), located at Unit 1008, 3111 Corvette Way, Richmond, BC, Canada.",
     "WHEREAS the RCIC and the Client wish to enter into a written agreement which contains the agreed-upon terms and conditions upon which the RCIC will provide his/her services to the Client.",
     "AND WHEREAS the RCIC is a member of the College of Immigration and Citizenship Consultants (CICC), the regulator in Canada for immigration consultants;",
     "IN CONSIDERATION of the mutual covenants contained in this Agreement, the parties agree as follows:"),
  *pr_common(program),
  pr_billing([("Professional Fees", "$5,000.00 CAD"), ("Discount", "$(750.00) CAD"), ("Applicable Tax (5%)", "$212.50 CAD")], ("Total Cost", "$4,462.50 CAD"),
             ["1st Payment – $1,000.00 CAD within 7 business days upon the Retainer Agreement date", "2nd Payment – $1,000.00 CAD within one month after the previous payment", "3rd Payment – $1,000.00 CAD within one month after the previous payment", "4th Payment – $1,462.50 CAD within one month after the previous payment."],
             note=spon_note,
             extra=P("All required government fees, including the application fee, the right of permanent residence fee, and the biometrics fees, must be paid before submitting the PR application on IRCC portal.")),
  *pr_tail(),
  (H("14. Contact Information") + P("Clients") + UL(["Principal Applicant’s name: Tandis Hakaki", "Sponsor’s name: Seyed Shayan Hosseini", "Residential Address: Unit 1008, 3111 Corvette Way, Richmond, BC V6X 4K3, Canada", "Telephone/Cellphone Number: +12365123309", "E-mail: tandis.hakkaki@gmail.com"]) +
   P("RCIC") + UL(["Name: Hamed Sugimoto", "RCIC Member Number: R713046", "Business Address: 501-3292 Production Way, Burnaby, BC V5A 4R4, Canada", "Telephone Number: +1 (778) 200-8856", "E-mail: legal@sugimotovisa.com"]) +
   P("IN WITNESS THEREOF, this Agreement has been duly executed by the parties hereto on the date first above written.")),
  SIG([("Signature of Principal Applicant", "Signature"), ("Signature of Sponsor", "Signature")]) + SIG([("Signature of RCIC", "Signature")]),
]
DOCS["sg_spon"] = dict(company="SG", title="Retainer Agreement", file_label="RCIC R713046 · Client File S26256", layout="en", rows=rows)

# ---------------- SG-ENT : SG000026112 Hamid Kalantari, BC PNP Entrepreneur (bilingual) ----------------
ent_program_en = (P("The Client asked the RCIC, and the RCIC has agreed to act for the Client, Hamid Kalantari, and the accompanying spouse, Behnaz Bakhshimehvar, and the dependent children, Nora Kalantari and Taha Kalantari, in the matter of a British Columbia Provincial Nominee Program (BC PNP) Entrepreneur Immigration - Regional Stream Permanent Residence Application by following the program:") +
  UL(["Expression of Interest (EOI): Preparation and submission to the BC PNP.",
      "Invitation to Apply (ITA) & Provincial Application: Managing the provincial application process upon receipt of an ITA, leading to a Performance Agreement.",
      "Work Permit application: Preparation and filing of the Work Permit application to IRCC (after receiving the Work Permit Support Letter from BC PNP) to allow the Client to move to British Columbia and start business operations."]))
ent_program_fa = (P("موکل از مشاور درخواست کرده و مشاور پذیرفته است که به نمایندگی از موکل، حمید کلانتری، و همسر همراه، بهناز بخشی مهوار، و فرزندان وابسته، نورا کلانتری و طاها کلانتری، در خصوص پرونده «درخواست اقامت دائم از طریق برنامه مهاجرتی استان بریتیش کلمبیا (BC PNP) کارآفرینی - مسیر منطقه‌ای» در مراحل زیر اقدام نماید:") +
  UL(["باز کردن پروفایل استانی (EOI): آماده‌سازی و ارسال به برنامه مهاجرتی بریتیش کلمبیا (BC PNP).",
      "آماده سازی پرونده بعد از دریافت دعوتنامه برای درخواست (ITA) استانی: مدیریت فرآیند درخواست استانی پس از دریافت دعوتنامه، که منجر به توافقنامه عملکرد (Performance Agreement) می‌شود.",
      "پرونده اجازه کار: آماده‌سازی و ارسال درخواست مجوز کار به اداره مهاجرت کانادا (IRCC) (پس از دریافت نامه پشتیبانی مجوز کار از BC PNP) جهت امکان نقل مکان موکل به بریتیش کلمبیا و راه‌اندازی کسب‌وکار."]))
duties = sg.rcic_duties(*sg.parties("Hamid Kalantari", "حمید کلانتری", spouse=("Behnaz Bakhshimehvar", "بهناز بخشی مهوار"),
                                    children=[("Nora Kalantari", "نورا کلانتری"), ("Taha Kalantari", "طاها کلانتری")]))
rows = [
  sg.file_row("SG000026112"),
  sg.preamble("June 09th, 2026", "۹ ژوئن ۲۰۲۶", "Hamid Kalantari", "4900 Lennox Lane, Burnaby, BC, Canada", "حمید کلانتری", "کانادا، بریتیش کلمبیا، برنابی، لینکس لین، پلاک ۴۹۰۰"),
  sg.DEFINITIONS,
  (H("2. RCIC Responsibilities and Commitments") + ent_program_en + duties[0].split("</h2>",1)[1].split("</p>",1)[1],
   H("۲. مسئولیت‌ها و تعهدات مشاور RCIC") + ent_program_fa + duties[1].split("</h2>",1)[1].split("</p>",1)[1]),
  tuple(x.replace("4. Client Responsibilities", "3. Client Responsibilities").replace("۴. مسئولیت", "۳. مسئولیت") for x in
        sg.client_duties("Give biometrics on time as required for immigration applications.", "انجام به‌موقع انگشت‌نگاری (بیومتریک) طبق الزامات پرونده.", months_note=False)),
  tuple(x.replace("5. Billing", "4. Billing").replace("۵. مبلغ", "۴. مبلغ") for x in
   sg.billing([("Professional Fees", "$12,000.00 CAD"), ("Government Fees (EOI 300.00 + Provincial 3,500.00 + Work Permit 155.00)", "$3,955.00 CAD"), ("Applicable Tax (GST/PST)", "$600.00 CAD")], ("Total Cost", "$16,555.00 CAD"),
              [("حق‌الزحمه حرفه‌ای", "$12,000.00 CAD"), ("هزینه‌های دولتی (۳۰۰ + ۳,۵۰۰ + ۱۵۵)", "$3,955.00 CAD"), ("مالیات (GST/PST)", "$600.00 CAD")], ("هزینه کل", "$16,555.00 CAD"),
              ["First Installment: 2,000.00 CAD + 300.00 CAD, payable upon signing this Agreement. Covers initial file opening, documentation review, and submission of the Expression of Interest (EOI).",
               "Second Installment: 2,000.00 CAD + 3,500.00 CAD, payable upon receipt of the Invitation to Apply (ITA) from the province of British Columbia. Covers the preparation and submission of the full Provincial Application.",
               "Third Installment: 8,000.00 CAD + 155.00 CAD, payable prior to the submission of the Work Permit (WP) application to IRCC. Covers the signing of the Performance Agreement, receipt of the WP Support Letter, and filing of the WP application."],
              ["قسط اول: ۲,۰۰۰ دلار کانادا + ۳۰۰ دلار کانادا. قابل پرداخت هنگام امضای این قرارداد. (شامل تشکیل پرونده اولیه، بررسی مدارک و بازکردن پروفایل استانی - EOI).",
               "قسط دوم: ۲,۰۰۰ دلار کانادا + ۳,۵۰۰ دلار کانادا. قابل پرداخت پس از دریافت دعوتنامه برای درخواست (ITA) از استان بریتیش کلمبیا. شامل آماده‌سازی و ارسال درخواست کامل استانی.",
               "قسط سوم: ۸,۰۰۰ دلار کانادا + ۱۵۵ دلار کانادا. قابل پرداخت پیش از ارسال درخواست مجوز کار (WP) به اداره مهاجرت. شامل امضای توافقنامه عملکرد، دریافت نامه پشتیبانی مجوز کار و ثبت درخواست مجوز کار."],
              note_en=PR_TAIL_NOTE.replace("pre-determined dates as follows. ", "pre-determined dates as follows. The RCIC’s obligations under this Agreement are strictly conditional upon payment of the first installment. Should the first installment remain unpaid for a period of ten (10) days, this Agreement shall automatically terminate without any further obligation or liability on the part of the RCIC, unless otherwise agreed to by the Parties in advance. "),
              note_fa="حق‌الزحمه حرفه‌ای شامل هزینه‌های دولتی، هزینه‌های ثبت‌نام، انگشت‌نگاری، معاینات پزشکی و سایر هزینه‌های مربوط به درخواست برنامه و همچنین هزینه‌هایی که موکل موظف به پرداخت به اشخاص ثالث است، نمی‌شود. مبلغ فوق باید توسط موکل(ها) پرداخت شود و تنها با توافق طرفین قابل تغییر است. صورتحساب موکل(ها) بر اساس مراحل پیشرفت کار و تاریخ‌های از پیش تعیین شده به شرح زیر صادر می‌شود. تعهدات مشاور در این قرارداد، کاملاً مشروط به پرداخت قسط اول است. چنانچه قسط اول به مدت ده (۱۰) روز پرداخت نشود، این قرارداد به‌طور خودکار و بدون هیچ‌گونه تعهد یا مسئولیتی از جانب مشاور فسخ می‌گردد، مگر آنکه طرفین از پیش توافق دیگری کرده باشند. هزینه‌های دولتی به جدیدترین هزینه‌های تعیین‌شده توسط IRCC یا دولت‌های استانی اشاره دارد. این هزینه‌ها ممکن است بدون اطلاع قبلی تغییر کنند و پرداخت آن‌ها بر عهده موکل است. در صورت نیاز، موکل می‌تواند هزینه‌های دولتی را به مشاور پرداخت کند تا ایشان آن را به دولت منتقل نماید.")),
  tuple(x.replace("6. Communication","5. Communications").replace("۶. ارتباطات","۵. ارتباطات") for x in sg.COMMS),
  tuple(x.replace("7. Refund","6. Refund").replace("۷. شرایط","۶. شرایط") for x in sg.REFUND),
  tuple(x.replace("8. Dispute","7. Dispute").replace("۸. حل","۷. حل") for x in sg.DISPUTE),
  tuple(x.replace("9. Confidentiality","8. Confidentiality").replace("۹. محرمانگی","۸. محرمانگی") for x in sg.CONFID),
  tuple(x.replace("10. Force","9. Force").replace("۱۰. موارد","۹. موارد") for x in sg.FORCE),
  tuple(x.replace("11. Change","10. Change").replace("۱۱. سیاست","۱۰. سیاست") for x in sg.CHANGE),
  tuple(x.replace("12. Termination","11. Termination").replace("۱۲. مهلت","۱۱. فسخ").replace("12.","11.").replace("۱۲.","۱۱.") for x in sg.TERMINATION),
  tuple(x.replace("13. Governing","12. Governing").replace("۱۳. قانون","۱۲. قانون") for x in sg.LAW),
  tuple(x.replace("14.","13.").replace("۱۴.","۱۳.") for x in sg.misc()),
  tuple(x.replace("15.","14.").replace("۱۵.","۱۴.") for x in sg.contact(["Given Name: Hamid", "Family Name: Kalantari", "Residential Address: 4900 Lennox Lane, Burnaby, BC, Canada", "Phone Number: 1672 699 0206", "E-mail: hkalantari63@gmail.com"],
             ["نام: حمید", "نام خانوادگی: کلانتری", "آدرس محل سکونت: کانادا، بریتیش کلمبیا، برنابی، لینکس لین، پلاک ۴۹۰۰", "شماره تلفن: 1672 699 0206", "ایمیل: hkalantari63@gmail.com"])),
  sg.WITNESS,
  SIG([("Signature of Client / امضای موکل", "Signature / امضا"), ("Signature of RCIC / امضای مشاور", "Signature / امضا")]),
]
DOCS["sg_ent"] = dict(company="SG", title="Retainer Agreement / قرارداد مشاوره", file_label="RCIC R713046 · Client File SG000026112", layout="bilingual", rows=rows)

# ---------------- SB-A : SB000025300 Arman Shojaei, Sweden ----------------
rows = sb.sba_rows("SB000025300", "October 08, 2025", "Arman Shojaei", "آرمان شجاعی",
                   "Unit 1510, 15th Floor, Pamchal 6 Building, Chitgar Town, End of Hakim Expressway, Tehran",
                   "ایران، تهران، انتهای اتوبان‌حکیم، شهرک چیتگر، ساختمان پامچال۶، طبقه۱۵، واحد ۱۵۱۰",
                   "Sweden", "سوئد", "+989192259455", "armansh20@gmail.com", "900.00", "900.00", "1,800.00", "هزار و هشتصد یورو")
rows.append(SIG([("Signature of Client / امضای متقاضی", "Signature / امضا"), ("Ken Sugimoto, Director – SparkBridge Incubator Ltd.", "Signature / امضا")]))
DOCS["sb_a"] = dict(company="SB", title="Service Agreement", file_label="Client File SB000025300", layout="bilingual", rows=rows)

# ---------------- SB-C : SB000025287 Davoud Nasiri, Netherlands ----------------
rows = sb.retainer_head("SB000025287", "September 27, 2025", "September 27, 2025", "Davoud Nasiri", "داود نصیری", "6109612243",
                        "Imam Hossein Alley, Imam Hossein Square, Sa’adabad, Dashtestan, Bushehr Province, Iran",
                        "ایران، استان بوشهر، شهرستان دشتستان، شهر سعدآباد، میدان امام حسین، کوچه امام حسین", "9177788231", "ghazal@gimal.com", contact_email="info@SparkBridge.ca")
rows += sb.sbc_body("Netherlands", "هلند", "17,000",
                    [("8,000", "upon signing this agreement", "هشت هزار", "هنگام امضای قرارداد."),
                     ("7,000", "after receiving approval from the Relevant incubators or facilitator organization (DSIF)", "هفت هزار", "پس از دریافت تاییدیه از سازمان شتابدهنده یا تسهیلگر مربوطه (DSIF)."),
                     ("2,000", "before applying for a visa", "دو هزار", "قبل از اقدام برای ویزا.")],
                    companions_en="Ghazal Nasiri, Saghar Nasiri and Mehrab Nasiri", companions_fa="غزل نصیری، ساغر نصیری و مهراب نصیری")
rows += [sb.validation_sb(["Ghazal Nasiri", "Saghar Nasiri", "Mehrab Nasiri"], ["غزل نصیری", "ساغر نصیری", "مهراب نصیری"]),
         sb.sig_block_sb("Davoud Nasiri", "داود نصیری", "September 27, 2025", "September 27, 2025")]
DOCS["sb_c"] = dict(company="SB", title="Retainer Agreement", file_label="Contract No SB000025287", layout="bilingual", rows=rows)

# ---------------- SB-D : SB000026113 Naghmeh Adhami, BC business advisory ----------------
rows = sb.retainer_head("SB000026113", "June 15th, 2026", "June 15th, 2026", "Naghmeh Adhami", "نغمه ادهمی", "2992270040",
                        "Unit 9, No. 2, Neshat 8 Alley, Neshat St., Kerman, Iran", "ایران، کرمان، خیابان نشاط، کوچه ۸، پلاک ۲، واحد ۹", "989132421811", "adhaminaghmeh233@gmail.com")
rows += sb.sbd_body("26,000", "8,000", "18,000")
rows += [sb.validation_sb(), sb.sig_block_sb("Naghmeh Adhami", "نغمه ادهمی", "June 15th, 2026", "June 15th, 2026")]
DOCS["sb_d"] = dict(company="SB", title="Retainer Agreement", file_label="Contract No SB000026113", layout="bilingual", rows=rows)

# ---------------- SB-E : SB000026110 Fahimeh Hanifehzadeh, Alberta DA LoR ----------------
rows = sb.retainer_head("SB000026110", "May 26th, 2026", "May 26th, 2026", "Fahimeh Hanifehzadeh", "فهیمه حنیفه زاده", "—",
                        "Unit 3, No. 22, Tahqiqi Alley, Salamat St., Asgari St., Baharan Sq., Vasfard, Tehran, Iran",
                        "ایران، تهران، وصفنارد، میدان بهاران، خیابان عسگری، خیابان سلامت، کوچه تحقیقی، پلاک ۲۲، واحد ۳", "9809124162950", "F.hanifezade@gmail.com")
rows += sb.sbe_body("28,000", "8,000", "20,000")
rows += [sb.validation_sb(), sb.sig_block_sb("Fahimeh Hanifehzadeh", "فهیمه حنیفه زاده", "May 26th, 2026", "May 26th, 2026")]
DOCS["sb_e"] = dict(company="SB", title="Retainer Agreement", file_label="Contract No SB000026110", layout="bilingual", rows=rows)

# ---------------- SB-F : SB000025292 Hanif Garfami, business event (English only) ----------------
rows = sb.sbf_rows("SB000025292", "October 4, 2025", "Hanif Garfami", "Unit 1, No. 15, Before the intersection, 163 St., Gilan Blvd., Golsar, Rasht", "700.00", "hanifgarfami369@gmail.com")
rows.append(SIG([("Client: Hanif Garfami", "Signature"), ("Company: Ken Sugimoto, CEO", "Signature")]))
DOCS["sb_f"] = dict(company="SB", title="Service Agreement", file_label="Contract No SB000025292", layout="en", rows=rows)

# ---------------- SG-PFL : S26301 (sample data) response to a Procedural Fairness Letter ----------------
rows = [
  sg.file_row("S26301"),
  sg.preamble("September 09, 2026", "September 09, 2026", "Amirhossein Rahimi",
              "Unit 12, No. 45, Golestan Street, Saadat Abad, Tehran, Iran",
              "امیرحسین رحیمی", "ایران، تهران، سعادت‌آباد، خیابان گلستان، پلاک ۴۵، واحد ۱۲"),
  sg.DEFINITIONS,
  sg.service_pfl("Study Permit application", "درخواست مجوز تحصیلی", "August 28, 2026", "August 28, 2026",
                 "September 27, 2026 (30 days from the date of the letter)", "September 27, 2026 (۳۰ روز از تاریخ نامه)", "S312345678"),
  sg.rcic_duties_pfl(*sg.parties("Amirhossein Rahimi", "امیرحسین رحیمی")),
  sg.client_duties_pfl("September 18, 2026", "September 18, 2026"),
  sg.billing([("Professional Fees", "$3,000.00 CAD")], ("Total Cost", "$3,000.00 CAD"),
             [("هزینه‌های حرفه‌ای", "$3,000.00 CAD")], ("هزینه کل", "$3,000.00 CAD"),
             ["Full payment – $3,000.00 CAD within 3 business days of signing this Agreement and before the RCIC starts drafting the response."],
             ["پرداخت کامل – مبلغ $3,000.00 CAD ظرف ۳ روز کاری پس از امضای این قرارداد و پیش از شروع تهیه پاسخ توسط RCIC."],
             note_en=sg.FEE_NOTE_PFL_EN, note_fa=sg.FEE_NOTE_PFL_FA),
  sg.COMMS, sg.REFUND_PFL, sg.DISPUTE, sg.CONFID, sg.FORCE, sg.CHANGE, sg.TERMINATION_PFL, sg.LAW,
  sg.misc(),
  sg.contact(["Given Name: Amirhossein", "Family Name: Rahimi", "Residential Address: Unit 12, No. 45, Golestan Street, Saadat Abad, Tehran, Iran", "Telephone/Cellphone Number: 989121234567", "E-mail: a.rahimi.sample@gmail.com"],
             ["نام: امیرحسین", "نام خانوادگی: رحیمی", "آدرس محل سکونت: ایران، تهران، سعادت‌آباد، خیابان گلستان، پلاک ۴۵، واحد ۱۲", "شماره تلفن/موبایل: 989121234567", "ایمیل: a.rahimi.sample@gmail.com"]),
  sg.WITNESS,
  SIG([("Signature of Client / امضای موکل", "Signature / امضا"), ("Signature of RCIC / امضای مشاور", "Signature / امضا")]),
]
DOCS["sg_pfl"] = dict(company="SG", title="Retainer Agreement", file_label="RCIC R713046 · Client File S26301", layout="bilingual", rows=rows)


if __name__ == "__main__":
    import xml.dom.minidom as md
    out = pathlib.Path(__file__).parent / "out"; out.mkdir(exist_ok=True)
    for k, d in DOCS.items():
        arch = qweb(f"x_sample.{k}", d)
        md.parseString(arch.encode("utf-8"))   # must be well-formed XML for QWeb
        (out / f"{k}.arch.xml").write_text(arch, encoding="utf-8")
        (out / f"{k}.html").write_text(preview_html(f"x_sample.{k}", d), encoding="utf-8")
        print(k, len(arch), "chars, rows", len(d["rows"]))

