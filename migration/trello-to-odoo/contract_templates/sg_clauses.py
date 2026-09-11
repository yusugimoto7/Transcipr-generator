# -*- coding: utf-8 -*-
"""Sugimoto Visa clause library (English + Farsi), copied from the current TR/PR Word templates."""
from lib import P, PS, H, UL, OL, FEE, RAW, esc

RCIC_ADDR = "501-3292 Production Way, Greater Vancouver – V5A 4R4 - Canada"

def file_row(no):
    return (P(f"RCIC Member Number: R713046 — Client File Number: {no}"), P(f"شماره عضویت مشاور: R713046 — شماره پرونده متقاضی: {no}"))

def preamble(date_en, date_fa, client_en, addr_en, client_fa, addr_fa, extra_en="", extra_fa=""):
    en = PS(f"This Retainer Agreement is made on {date_en}, between RCIC Hamed Sugimoto, located at {RCIC_ADDR}, and the Client {client_en}, located at {addr_en}{extra_en}.",
            "WHEREAS the RCIC and the Client wish to enter into a written agreement which contains the agreed-upon terms and conditions upon which the RCIC will provide his/her services to the Client.",
            "AND WHEREAS the RCIC is a member of the College of Immigration and Citizenship Consultants (CICC), the regulator in Canada for immigration consultants;",
            "IN CONSIDERATION of the mutual covenants contained in this Agreement, the parties agree as follows:")
    fa = PS(f"این قرارداد در تاریخ {date_fa} بین آقای حامد سوگیموتو، عضو RCIC، به نشانی: 501-3292 Production Way, Burnaby, Greater Vancouver – V5A 4R4 – Canada و متقاضی، {client_fa}، که به نشانی: {addr_fa} سکونت دارد{extra_fa}، منعقد گردید.",
            "از آنجا که RCIC و متقاضی قصد دارند یک توافق‌نامه کتبی امضا کنند که شامل شرایط و ضوابط مورد توافق برای ارائه خدمات توسط RCIC به متقاضی باشد،",
            "و با توجه به اینکه مشاور یکی از اعضای کالج مشاوران مهاجرت و شهروندی (CICC)، تنظیم کننده مشاوران مهاجرت در کانادا است.",
            "با توجه به بندهای متقابل مندرج در این قرارداد، طرفین به شرح زیر توافق می کنند:")
    return (en, fa)

DEFINITIONS = (
    H("1. Definitions") + P("The terms “Client,” “CICC,” “Disbursement,” and “RCIC” shall have the meaning given to such terms in the Retainer Agreement Regulation of the Council."),
    H("۱. تعاریف") + P("اصطلاحات \"متقاضی\"، \"CICC\"، \"پرداخت هزینه‌ها\" و \"RCIC\" به معنایی است که در مقررات موافقتنامه نگهدارنده شورا به این عبارات داده شده است."))

def service(items_en, items_fa):
    return (H("2. Service") + P("2.1 Type of service offered:") + UL(items_en),
            H("۲. خدمات") + P("۲.۱ نوع خدمات ارائه شده:") + UL(items_fa))

def parties(name_en, name_fa, spouse=None, children=()):
    """Rule 10: main applicant, then accompanying spouse and dependent children, in both languages.
    spouse=(en, fa); children=[(en, fa), ...]"""
    en = f"the Client, {name_en}"; fa = f"متقاضی، {name_fa}"
    if spouse:
        en += f", and the accompanying spouse, {spouse[0]}"; fa += f"، و همسر همراه، {spouse[1]}"
    if children:
        en += (", and the dependent child, " if len(children) == 1 else ", and the dependent children, ") + " and ".join(c[0] for c in children)
        fa += ("، و فرزند وابسته، " if len(children) == 1 else "، و فرزندان وابسته، ") + " و ".join(c[1] for c in children)
    return en, fa

def rcic_duties(parties_en="the Client", parties_fa="متقاضی"):
    return (
    H("3. RCIC Responsibilities and Commitments") +
    P(f"The Client asked the RCIC and the RCIC has agreed to act for {parties_en} in the matter(s) as described in 2.1 of this agreement. In consideration of the fees paid and the matter stated above, the RCIC agrees to do the following:") +
    OL(["Representing the file of the Client.",
        "Checking and verifying that all Client (s) documents and forms meet the requirements of the Immigration Regulations. Please note that some of the work to be undertaken may be delegated to employees or contracted out in order to expedite the processing of the work associated with the application.",
        "Preparing and filing submissions for online applications and/or by mail.",
        "Verify and ensure all submissions are on time as specified by the regulations.",
        "Communication with the visa officer if required for clarification until the final decision is reached.",
        "Ensuring that all applicable government fee payments for applications are duly paid on behalf of the Client.",
        "Please be advised that information and documents may be shared with employees who may be involved in this case, both salaried and contracted, and they may be shared with outside parties in the event of a complaint, investigation, tribunal, or if required by law.",
        "Track CLIENT’s file through the entire immigration process and endeavor to provide quality consulting services and to adequately supervise any employees participating or assisting in this process. A list of employees who might assist in the Client’s case is listed on the official website: https://sugimotovisa.com/",
        "The estimated time frame for completion of the case is in accordance with the approximate time frames provided on the official website of IRCC and RCIC shall have no control over it: https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html",
        "RCIC shall, if needed, obtain the assistance of a translator for communicating with the Client. Fees for such services shall be paid by the Client.",
        "If RCIC receives any original documents from the Client, he shall return such original documents as soon as the purpose for receiving these documents is achieved."]),
    H("۳. مسئولیت‌ها و تعهدات RCIC") +
    P(f"متقاضی از RCIC درخواست کرده و RCIC نیز موافقت کرده است که در موردهای ذکر شده در بخش 2.1 این قرارداد، نمایندگی {parties_fa} را بر عهده بگیرد. در ازای حق‌الوکاله پرداخت شده و با توجه به موارد ذکر شده در بالا، RCIC متعهد به انجام موارد زیر است:") +
    OL(["وکالت و پیگیری پرونده متقاضی.",
        "بررسی و تأیید اینکه تمامی مدارک و فرم‌های مشتری مطابق با الزامات مقررات مهاجرتی باشند. توجه داشته باشید که بخشی از کار ممکن است به کارمندان محول یا به اشخاص دیگر واگذار شود تا روند انجام کارهای مربوط به درخواست سریع‌تر پیش رود.",
        "آماده‌سازی و ارسال مدارک برای درخواست‌های آنلاین و/یا پستی.",
        "بررسی و اطمینان از ارسال به‌موقع تمامی مدارک طبق زمان‌بندی مقرر در قوانین.",
        "در صورت لزوم، برقراری ارتباط با افسر ویزا برای توضیحات تا زمان صدور تصمیم نهایی.",
        "اطمینان از پرداخت به‌موقع تمامی هزینه‌های دولتی مربوط به درخواست‌ها از طرف متقاضی.",
        "لطفاً توجه داشته باشید که اطلاعات و مدارک ممکن است با کارمندانی که در این پرونده نقش دارند، چه کارکنان رسمی و چه قراردادی، به اشتراک گذاشته شود و همچنین ممکن است در موارد شکایت، تحقیق، دادگاه یا در صورت لزوم قانونی با اشخاص دیگر به اشتراک گذاشته شود.",
        "پیگیری پرونده متقاضی در طول کل فرآیند مهاجرت و تلاش برای ارائه خدمات مشاوره‌ای با کیفیت و نظارت مناسب بر هرگونه کارمندی که در این فرآیند مشارکت یا کمک می‌کند. فهرست کارمندان که ممکن است در پرونده متقاضی کمک کنند، در وب‌سایت رسمی درج شده است: https://sugimotovisa.com",
        "مدت زمان تقریبی برای تکمیل پرونده طبق زمان‌های تقریبی ارائه شده در وب‌سایت رسمی IRCC خواهد بود و RCIC هیچ کنترلی بر آن ندارد: https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html",
        "وکیل RCIC در صورت نیاز، از مترجمی برای ارتباط با متقاضی استفاده خواهد کرد. هزینه‌های این خدمات به عهده متقاضی خواهد بود.",
        "اگر RCIC هرگونه مدارک اصلی را از متقاضی دریافت کند، موظف است این مدارک را به محض رسیدن به هدف دریافت آن‌ها، به متقاضی بازگرداند."]))

RCIC_DUTIES = rcic_duties()

def client_duties(biometrics_en, biometrics_fa, months_note=True):
    note_en = " Note: The applicant shall provide all required documents and supporting materials within five (5) months. If the documents are not sent as requested within the specified period, the RCIC shall have the right to terminate the agreement without any refund. Furthermore, the mentioned period may be extended upon the written agreement of both parties." if months_note else ""
    note_fa = " تبصره: مدت زمان ارائه تمامی مدارک و مستندات مورد نیاز توسط متقاضی، ۵ ماه می باشد. در صورت عدم ارسال مدارک به نحو خواسته شده در مدت زمان مذکور، RCIC مخیر به فسخ قرارداد بدون بازپرداخت می باشد. همچنین مدت زمان مذکور قابل تمدید پس از توافق مکتوب طرفین می باشد." if months_note else ""
    en = (H("4. Client Responsibilities and Commitments") +
      P("4.1 The Client must provide, upon request from the RCIC:") +
      UL(["All necessary documentation is required by Immigration, Refugee and Citizenship Canada.",
          "All documentation in English, or with a certified English translation.",
          "Inform RCIC of the change of status, address, and any information that bears to the Client(s) application.",
          biometrics_en]) + (P(note_en.strip()) if note_en else "") +
      PS("4.2 The Client understands that they must be accurate, honest, and genuine in the information they provide. Any inaccuracies may void this Agreement or seriously affect the outcome of the application or the retention of any status they may obtain. The RCIC’s obligations under the Retainer Agreement are null and void if the Client knowingly provides any inaccurate, misleading, or false material information. The Client’s financial obligations remain.",
         "4.3 In the event Immigration, Refugees and Citizenship Canada (IRCC) or Employment and Social Development Canada (ESDC) should contact the Client directly, the Client is instructed to notify the RCIC immediately.",
         "4.4 The Client is to immediately advise the RCIC of any change in the marital, family, or civil status or change of physical address or contact information for any person included in the application.",
         "4.5 The client has confirmed that they are responsible for providing their Resume (CV) and all required documents and information in English or French. RCIC may only give advice on the structure. It is only the client’s responsibility to provide, check, and confirm the CV.",
         "4.6 In the event of a Joint Retainer Agreement, the Clients understand that no information received in connection with the matter from one Client can be treated as confidential so far as any of the other Clients are concerned and that if a conflict develops, that cannot be resolved, the RCIC cannot continue to act for both or all of the Clients and may have to withdraw completely.",
         "4.7 If the Client fails to deliver the requested documents within 150 days to RCIC, RCIC shall have the right to terminate this agreement, in which case, he shall be entitled to receive all dues as a service fee."))
    fa = (H("۴. مسئولیت‌ها و تعهدات متقاضی") +
      P("۴.۱ متقاضی موظف است در صورت درخواست RCIC، موارد زیر را ارائه دهد:") +
      UL(["تمامی مدارک لازم مورد نیاز از سوی اداره مهاجرت، پناهندگی و شهروندی کانادا.",
          "تمامی مدارک به زبان انگلیسی یا با ترجمه رسمی به زبان انگلیسی.",
          "اطلاع‌رسانی به RCIC در مورد هرگونه تغییر در وضعیت، آدرس و هر اطلاعات دیگری که به درخواست متقاضی مربوط می‌شود.",
          biometrics_fa]) + (P(note_fa.strip()) if note_fa else "") +
      PS("۴.۲ متقاضی می‌فهمد که باید در اطلاعاتی که ارائه می‌دهد، دقت، صداقت و واقعیت را رعایت کند. هرگونه نادرستی ممکن است این قرارداد را باطل کرده یا به طور جدی بر نتیجه درخواست یا حفظ هرگونه وضعیتی که ممکن است به دست آورد، تأثیر بگذارد. تعهدات RCIC طبق قرارداد حق‌الوکاله در صورت ارائه هرگونه اطلاعات نادرست، گمراه‌کننده یا کذب از طرف متقاضی، بی‌اعتبار خواهد شد. اما تعهدات مالی متقاضی پابرجا خواهد ماند.",
         "۴.۳ در صورتی که اداره مهاجرت، پناهندگی و شهروندی کانادا (IRCC) یا وزارت اشتغال و توسعه اجتماعی کانادا (ESDC) به‌طور مستقیم با متقاضی تماس بگیرند، متقاضی موظف است فوراً RCIC را مطلع کند.",
         "۴.۴ متقاضی باید بلافاصله RCIC را از هرگونه تغییر در وضعیت ازدواج، خانواده یا وضعیت مدنی، یا تغییر آدرس فیزیکی یا اطلاعات تماس هر شخصی که در درخواست گنجانده شده است، آگاه کند.",
         "۴.۵ متقاضی تأیید کرده است که مسئولیت ارائه رزومه (CV) و تمامی مدارک و اطلاعات لازم به زبان انگلیسی یا فرانسوی بر عهده اوست. RCIC فقط می‌تواند در مورد ساختار رزومه مشاوره دهد. تأمین، بررسی و تأیید رزومه تنها به عهده متقاضی است.",
         "۴.۶ در صورت وجود قرارداد حق‌الوکاله مشترک، متقاضیان متوجه هستند که هیچ‌یک از اطلاعات دریافت‌شده در ارتباط با موضوع مورد نظر از یک متقاضی نمی‌تواند برای دیگر متقاضیان به‌عنوان محرمانه تلقی شود و در صورتی که تضاد غیرقابل حلی ایجاد شود، RCIC نمی‌تواند به نمایندگی از هر دو یا تمامی متقاضیان ادامه دهد و ممکن است مجبور شود به‌طور کامل کنار برود.",
         "۴.۷ اگر متقاضی ظرف ۱۵۰ روز مدارک درخواستی را به مشاور مهاجرت (RCIC) تحویل ندهد، مشاور مهاجرت حق فسخ این قرارداد را خواهد داشت. در این صورت، وی مستحق دریافت تمامی مطالبات خود به‌عنوان حق‌الزحمه خدمات خواهد بود."))
    return (en, fa)

FEE_NOTE_EN = ("*Professional fees exclude government fees, registration fees, biometrics fees, medical exam fees, and other fees regarding the program application, as well as any other fees that the client(s) are obligated to pay to any third party(ies). The above amount is to be paid by the Client(s) and is subject to change upon mutual agreement of both parties. The Client(s) will be billed by milestones and pre-determined dates as follows. "
               "*Government fees refer to the latest fees required by IRCC, and they may change without notice.")
FEE_NOTE_FA = ("هزینه‌های حرفه‌ای شامل هزینه‌های دولتی، هزینه‌های ثبت‌نام، هزینه‌های بیومتریک، هزینه‌های آزمایش پزشکی و سایر هزینه‌های مربوط به درخواست برنامه نمی‌شود، همچنین شامل هر گونه هزینه دیگری که مشتری موظف به پرداخت به هر شخص ثالثی هستند نمی‌باشد. مبلغ فوق باید توسط مشتری پرداخت شود و ممکن است با توافق متقابل هر دو طرف تغییر کند. مشتری به صورت مرحله‌ای و در تاریخ‌های از پیش تعیین شده به شرح زیر صورت‌حساب خواهند شد. "
               "هزینه‌های دولتی به آخرین هزینه‌های مورد نیاز توسط IRCC اشاره دارد و ممکن است بدون اطلاع قبلی تغییر کند.")

def billing(fee_rows_en, total_en, fee_rows_fa, total_fa, schedule_en, schedule_fa, note_en=FEE_NOTE_EN, note_fa=FEE_NOTE_FA):
    en = (H("5. Billing Method and Payment Schedule") + P("5.1 Billing Method") +
          P("The Client will be billed a flat fee based on milestones. All payments will be in Canadian Dollars. The details of the payment terms and conditions are as follows:") +
          FEE(fee_rows_en, total_en) + P(note_en, "small") +
          P("5.2 Payment Schedule") + P("Fees shall be paid by the Client to the Consultant as follows:") + UL(schedule_en))
    fa = (H("۵. مبلغ قرارداد و شرایط پرداخت") + P("۵.۱ شرایط پرداخت") +
          P("یک هزینه ثابت برای متقاضی صورت‌حساب می‌شود. تمام پرداخت ها به دلار کانادا خواهد بود. جزئیات شرایط و ضوابط پرداخت به شرح زیر است:") +
          FEE(fee_rows_fa, total_fa) + P(note_fa, "small") +
          P("۵.۲ شیوه پرداخت") + P("هزینه ها باید توسط متقاضی به مشاور به صورت زیر پرداخت گردد:") + UL(schedule_fa))
    return (en, fa)

COMMS = (
    H("6. Communication") +
    PS("6.1 RCIC will keep the Client informed regularly of the progress of, and issues relating to the matter. RCIC will also keep a copy for the Client of pertinent correspondence and documents created on their behalf.",
       "6.2 By virtue of the confidentiality rules, RCIC is bound to hold in strict confidence all information about the Client's business and affairs that RCIC acquires by virtue of its professional relationship with the Client(s). RCIC will only disclose such information if he is expressly or implicitly authorized to do so by the Client(s), or he is otherwise required to by law. RCIC and any staff and/or contractors will use a variety of means of communication with the Client(s), including cell phone and e-mail. The Client's execution of this agreement authorizes RCIC and any staff and/or contractors to communicate with and/or transmit documents to the Client or on his or her behalf by fax, cell phone, and e-mail. The Client(s) also acknowledge and accept the risk that these means of communication may not be secure. If the Client does not want RCIC and any staff and/or contractors to communicate with him or her by fax, cell phone, or e-mail, the Client(s) must advise RCIC in writing.",
       "6.3 It is agreed by all parties that the only and most preferred fashion of communication is by email, and mail is only an acceptable method of correspondence if specifically instructed by the RCIC and that RCIC and its staff are not obliged to answer and/or reply to the client's and them designates' phone calls."),
    H("۶. ارتباطات") +
    PS("۶.۱ RCIC به‌طور منظم متقاضی را از پیشرفت و مسائل مرتبط با موضوع مطلع خواهد کرد. RCIC همچنین نسخه‌ای از مکاتبات و اسناد مربوطه که به نمایندگی از متقاضی ایجاد شده است را نگه‌داری خواهد کرد.",
       "۶.۲ بر اساس قوانین محرمانگی، RCIC موظف است تمام اطلاعات مربوط به کسب‌وکار و امور مشتری را که به‌دلیل رابطه حرفه‌ای خود با متقاضیان کسب می‌کند، در کمال راز نگه‌دارد. RCIC تنها در صورتی می‌تواند این اطلاعات را فاش کند که به‌طور صریح یا ضمنی توسط متقاضیان مجاز شده باشد، یا اینکه به‌طور دیگری بر اساس قانون ملزم به این کار باشد. RCIC و هر یک از کارکنان و/یا پیمانکاران از روش‌های مختلفی برای ارتباط با متقاضیان استفاده خواهند کرد، از جمله تلفن همراه و ایمیل. امضای این توافق‌نامه توسط متقاضی به RCIC و هر یک از کارکنان و/یا پیمانکاران اجازه می‌دهد تا با متقاضی یا به نمایندگی از او از طریق فکس، تلفن همراه و ایمیل ارتباط برقرار کنند و اسناد را ارسال نمایند. متقاضی همچنین خطر استفاده از این روش‌های ارتباطی را که ممکن است ایمن نباشند، تأیید و قبول می‌کنند. اگر متقاضی نمی‌خواهد که RCIC و هر یک از کارکنان و/یا پیمانکاران با او از طریق فکس، تلفن همراه یا ایمیل ارتباط برقرار کنند، باید به‌صورت کتبی به RCIC اطلاع دهد.",
       "۶.۳ توافق شده است که تنها و بهترین روش ارتباطی از طریق ایمیل است و پست تنها در صورتی به عنوان یک روش قابل قبول برای مکاتبات است که به‌طور خاص توسط RCIC دستور داده شود و RCIC و کارکنان آن ملزم به پاسخگویی و/یا جواب دادن به تماس‌های تلفنی متقاضی و نمایندگان او نیستند."))

REFUND = (
    H("7. Refund Policy") +
    P("The Client acknowledges that granting a visa or status and the time required for processing this application is at the sole discretion of the government of Canada and not the RCIC and any staff and/or contractors.") +
    UL(["Unused fees, if any, will be refunded to the Client or his or her Designate.", "Fees are not refundable in the event of an application refusal."]),
    H("۷. شرایط بازپرداخت") +
    P("متقاضی مطلع است که اعطای ویزا یا وضعیت و زمان مورد نیاز برای پردازش این درخواست به‌تنهایی در اختیار دولت کانادا است و نه RCIC و کارکنان و/یا پیمانکاران آن.") +
    UL(["هزینه‌های استفاده‌نشده، در صورت وجود، به متقاضی یا نماینده او بازپرداخت خواهد شد.", "در صورت رد درخواست، هزینه‌ها قابل بازپرداخت نیستند."]))

DISPUTE = (
    H("8. Dispute Resolution Related to the Code of Professional Ethics") +
    PS("In the event of a dispute related to the Code of Professional Conduct, the Client and RCIC are to make every effort to resolve the matter between the two parties. In the event a resolution cannot be reached, the Client is to present the complaint in writing to the RCIC and allow the RCIC 30 days to respond to the Client. In the event the dispute is still unresolved, the Client may follow the complaint and discipline procedure outlined by the Council on their website: https://college-ic.ca/protecting-the-public/complaints-process/. NOTE: All complaint forms must be signed.",
       "CICC Contact Information: College of Immigration and Citizenship Consultants (CICC), 5500 North Service Rd., Suite 1002 Burlington, ON, L7L 6W6. Toll-free: 1-877-836-7543",
       "College may require the production of documents in accordance with the Act. All applicable laws can be accessed on the official website of the College, and the Client acknowledges that he/she has access to them: https://college-ic.ca/about-the-college/governance"),
    H("۸. حل و فصل اختلافات مربوط به کد اخلاق حرفه‌ای") +
    PS("در صورت بروز اختلافی مربوط به کد رفتار حرفه‌ای، متقاضی و RCIC باید تمام تلاش خود را برای حل این موضوع بین دو طرف به‌کار گیرند. در صورتی که نتوان به توافق رسید، مشتری باید شکایت خود را به‌صورت کتبی به RCIC ارائه کند و 30 روز به RCIC فرصت دهد تا به متقاضی پاسخ دهد. در صورتی که اختلاف همچنان حل‌نشده باقی بماند، مشتری می‌تواند شکایت و روند انضباطی را که توسط شورای مربوطه در وب‌سایت آن‌ها توضیح داده شده است، دنبال کند: https://college-ic.ca/protecting-the-public/complaints-process/ توجه: تمام فرم‌های شکایت باید امضا شوند.",
       "اطلاعات تماس CICC: College of Immigration and Citizenship Consultants (CICC), 5500 North Service Rd., Suite 1002, Burlington, ON, L7L 6W6. تلفن رایگان: 1-877-836-7543",
       "کالج ممکن است تولید اسناد را بر اساس قانون درخواست کند. تمام قوانین مربوطه را می‌توان در وب‌سایت رسمی کالج دسترسی پیدا کرد و مشتری تأیید می‌کند که به آن‌ها دسترسی دارد: https://college-ic.ca/about-the-college/governance"))

CONFID = (
    H("9. Confidentiality") +
    P("All information and documentation reviewed by the RCIC, required by IRCC and all other governing bodies, and used for the preparation of the application will not be divulged to any third party, other than agents and employees, without prior consent, except as demanded by law. The RCIC, and all agents and employees of the RCIC, are also bound by the confidentiality requirements of Article 8.1 of the Code of Professional Ethics. The Client agrees to the use of electronic communication and storage of confidential information. The RCIC will use his/her best efforts to maintain a high degree of security for electronic communication and information storage."),
    H("۹. محرمانگی") +
    P("تمام اطلاعات و مستنداتی که توسط RCIC بررسی می‌شود، مورد نیاز IRCC و سایر نهادهای نظارتی بوده و برای تهیه درخواست استفاده می‌شود، بدون رضایت قبلی به هیچ شخص ثالثی افشا نخواهد شد، به جز نمایندگان و کارمندان، مگر به‌طور قانونی درخواست شود. RCIC و تمام نمایندگان و کارمندان RCIC همچنین به الزامات محرمانگی ماده 8.1 کد اخلاق حرفه‌ای ملزم هستند. متقاضی با استفاده از ارتباطات الکترونیکی و ذخیره‌سازی اطلاعات محرمانه موافقت می‌کند. RCIC بهترین تلاش خود را برای حفظ سطح بالایی از امنیت در ارتباطات الکترونیکی و ذخیره‌سازی اطلاعات به کار خواهد گرفت."))

FORCE = (
    H("10. Force Majeure") + P("The RCIC’s failure to perform any term of this Retainer Agreement, as a result of conditions beyond his/her control such as, but not limited to, governmental restrictions or subsequent legislation, war, strikes, or acts of God, shall not be deemed a breach of this Agreement."),
    H("۱۰. موارد فورس ماژور") + P("عدم توانایی RCIC در اجرای هر یک از شرایط این توافق‌نامه به دلیل شرایطی فراتر از کنترل او، مانند، اما نه محدود به، محدودیت‌های دولتی یا قانون‌گذاری‌های بعدی، جنگ، اعتصابات یا حوادث غیرمترقبه، به‌عنوان نقض این توافق‌نامه محسوب نخواهد شد."))

CHANGE = (
    H("11. Change Policy") + P("The Client acknowledges that if the RCIC is asked to act on the Client’s behalf on matters other than those outlined above in this Agreement, or because of a material change in the Client’s circumstances, or because of material facts not disclosed at the outset of the application, or because of a change in government legislation regarding the processing of immigration-related applications, the Agreement can be modified accordingly."),
    H("۱۱. سیاست تغییر") + P("متقاضی تأیید می‌کند که اگر از RCIC خواسته شود به‌نمایندگی از متقاضی در مسائلی غیر از موارد ذکرشده در این توافق‌نامه عمل کند، یا به‌دلیل تغییرات اساسی در شرایط متقاضی، یا به‌دلیل حقایق مادی که در ابتدای درخواست فاش نشده‌اند، یا به‌دلیل تغییر در قانون‌گذاری دولت مربوط به پردازش درخواست‌های مرتبط با مهاجرت، توافق‌نامه می‌تواند به‌طور متناسب اصلاح شود."))

TERMINATION = (
    H("12. Termination") +
    PS("12.1 This Agreement is considered terminated upon completion of tasks identified under section 2 of this agreement.",
       "12.2 This Agreement is considered terminated if material changes occur to the Client’s application or eligibility, which make it impossible to proceed with services detailed in section 2 of this Agreement.",
       "12.3 This Agreement may be terminated, upon writing, by the Client, at which time any outstanding fees or Disbursements will be refunded by the RCIC to the Client/any outstanding fees or Disbursements will be remitted by the Client to the RCIC.",
       "12.4 Pursuant to Article 11 of the Code of Professional Conduct, this Agreement may be terminated, upon writing, by the RCIC, provided withdrawal does not cause prejudice to the Client."),
    H("۱۲. مهلت قرارداد") +
    PS("۱۲.۱ این توافق‌نامه با اتمام کارهای مشخص‌شده در بخش 2 این توافق‌نامه به‌عنوان خاتمه‌یافته در نظر گرفته می‌شود.",
       "۱۲.۲ این توافق‌نامه در صورتی که تغییرات مادی در درخواست یا واجد شرایط بودن متقاضی رخ دهد که ادامه خدمات مذکور در بخش 2 این توافق‌نامه را غیرممکن کند، به‌عنوان خاتمه‌یافته در نظر گرفته می‌شود.",
       "۱۲.۳ این توافق‌نامه می‌تواند با اطلاع کتبی متقاضی خاتمه یابد که در این صورت هزینه کارهای انجام نشده از سمت RCIC به متقاضی پرداخت خواهد شد. همچنین هرگونه هزینه کارهای انجام شده ی پرداخت نشده، از سمت متقاضی به RCIC پرداخت خواهد شد.",
       "۱۲.۴ بر اساس ماده 11 کد رفتار حرفه‌ای، این توافق‌نامه می‌تواند با اطلاع کتبی توسط RCIC خاتمه یابد، مشروط بر اینکه انصراف موجب ضرر به متقاضی نشود."))

LAW = (
    H("13. Governing Law") + P("This Agreement shall be governed by the laws in effect in the Province of British Columbia and the federal laws of Canada applicable therein, and except for disputes according to Section 8 hereof, any dispute with respect to the terms of this Agreement shall be decided by a court of competent jurisdiction within the Province of British Columbia."),
    H("۱۳. قانون دولتی") + P("این توافق‌نامه طبق قوانین جاری در استان بریتیش کلمبیا و قوانین فدرال کانادا که در آن قابل اجرا است، حاکم خواهد بود و به‌جز اختلافات مطابق با بخش 8 اینجا، هرگونه اختلاف در مورد شرایط این توافق‌نامه توسط دادگاه صلاحیت‌دار در استان بریتیش کلمبیا حل‌وفصل خواهد شد."))

def misc(schedule_a_en=None, schedule_a_fa=None):
    en = (H("14. Miscellaneous") +
      PS("14.1 This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, warranties, representations, negotiations, and discussions, whether oral or written, of the parties except as specifically set forth herein.",
         "14.2 This Agreement shall be binding upon the parties hereto and their respective heirs, administrators, successors, and permitted assigns.",
         "14.3 This Agreement may only be altered or amended when such changes are made in writing and executed by the parties hereto.",
         "14.4 The provisions of this Agreement shall be deemed severable. If any provision of this Agreement shall be held unenforceable by any court of competent jurisdiction, such provision shall be severed from this Agreement, and the remaining provisions shall remain in full force and effect.",
         "14.5 The headings utilized in this Agreement are for convenience only and are not to be construed in any way as additions to or limitations of the covenants and agreements contained in this Agreement.",
         "14.6 Each of the parties hereto shall do and execute or cause to be done or executed all such further and other things, acts, deeds, documents, and assurances as may be necessary or reasonably required to carry out the intent and purpose of this Agreement fully and effectively.",
         "14.7 The Client acknowledges that they have had sufficient time to review this Agreement and have been allowed to obtain independent legal advice and translation prior to the execution and delivery of this Agreement. In the event the Client did not seek independent legal advice prior to signing this Agreement, they did so voluntarily without any undue pressure and agree that the failure to obtain independent legal advice shall not be used as a defense to the enforcement of obligations created by this Agreement. Furthermore, the Client acknowledges that she has received a copy of this Agreement and agrees to be bound by its terms.",
         "14.8 The Client acknowledges that only the English version of the agreement shall be binding. The Persian translation is only offered for the assistance of the Client."))
    fa = (H("۱۴. متفرقه") +
      PS("۱۴.۱ این توافق‌نامه شامل تمام توافقات بین طرفین در مورد موضوع آن است و تمامی توافقات، تفاهم‌نامه‌ها، ضمانت‌ها، نمایندگی‌ها، مذاکرات و بحث‌های قبلی، چه شفاهی و چه کتبی، طرفین را از بین می‌برد مگر اینکه به‌طور خاص در اینجا مشخص شده باشد.",
         "۱۴.۲ این توافق‌نامه برای طرفین و وراث، مدیران، جانشینان و واگذاران مجاز آن‌ها الزام‌آور خواهد بود.",
         "۱۴.۳ این توافق‌نامه تنها زمانی می‌تواند تغییر یا اصلاح شود که چنین تغییراتی به‌صورت کتبی انجام شده و توسط طرفین امضا شود.",
         "۱۴.۴ مفاد این توافق‌نامه قابل تفکیک خواهند بود. اگر هر یک از مفاد این توافق‌نامه توسط هر دادگاه صلاحیت‌دار غیرقابل اجرا شناخته شود، آن ماده از این توافق‌نامه جدا خواهد شد و سایر مفاد به‌طور کامل و مؤثر باقی خواهند ماند.",
         "۱۴.۵ عنوان‌های استفاده‌شده در این توافق‌نامه صرفاً برای سهولت است و به‌هیچ وجه نباید به‌عنوان اضافات یا محدودیت‌هایی از مفاد و توافقات موجود در این توافق‌نامه تفسیر شود.",
         "۱۴.۶ هر یک از طرفین این توافقنامه موظف است تمام اقدامات، اعمال، اسناد و تضمین‌های لازم یا معقول را برای تحقق کامل و مؤثر نیات و اهداف این توافقنامه انجام دهد یا سبب انجام آن شود.",
         "۱۴.۷ متقاضی تأیید می‌کند که زمان کافی برای بررسی این توافق‌نامه داشته و اجازه داشته تا قبل از امضا و تحویل این توافق‌نامه مشاوره قانونی مستقل و ترجمه دریافت کند. در صورتی که متقاضی قبل از امضای این توافق‌نامه مشاوره قانونی مستقل دریافت نکرده باشد، او به‌طور داوطلبانه و بدون هیچگونه فشار غیرمجاز این کار را انجام داده و تأیید می‌کند که عدم دریافت مشاوره قانونی مستقل به‌عنوان دفاعی برای اجرای تعهدات ایجادشده توسط این توافق‌نامه مورد استفاده قرار نخواهد گرفت. علاوه بر این، متقاضی تأیید می‌کند که نسخه‌ای از این توافق‌نامه را دریافت کرده و به شرایط آن پایبند است.",
         "۱۴.۸ متقاضی تأیید می‌کند که صرفا نسخه انگلیسی قرارداد مرجع طرفین می باشد و ترجمه فارسی صرفا جهت سهولت متقاضی می باشد."))
    return (en, fa)

def contact(client_en_lines, client_fa_lines, rcic_email="Legal@sugimotovisa.com"):
    rc_en = ["Given Name: Hamed", "Family Name: Sugimoto", "RCIC Member Number: R713046",
             f"Business Address: {RCIC_ADDR}", "Telephone Number: +1 (778) 200-8856", f"E-mail: {rcic_email}"]
    rc_fa = ["نام: حامد", "نام خانوادگی: سوگیموتو", "شماره عضویت مشاور: R713046",
             f"آدرس: {RCIC_ADDR}", "تلفن: +1 (778) 200-8856", f"ایمیل: {rcic_email}"]
    en = H("15. Contact Information") + P("Client") + UL(client_en_lines) + P("RCIC") + UL(rc_en)
    fa = H("۱۵. اطلاعات تماس") + P("متقاضی") + UL(client_fa_lines) + P("RCIC") + UL(rc_fa)
    return (en, fa)

WITNESS = (P("IN WITNESS THEREOF, this Agreement has been duly executed by the parties hereto on the date first above written."),
           P("به موجب این توافقنامه، طرفین در تاریخ فوق‌الذکر این قرارداد را به نحو صحیح و قانونی امضاء کرده‌اند."))


# ---------------------------------------------------------------------------
# SG-PFL : response to a Procedural Fairness Letter. Same skeleton as SG-TR;
# the sections whose wording is application-specific are rewritten here.
# ---------------------------------------------------------------------------
def service_pfl(app_en, app_fa, letter_date_en, letter_date_fa, deadline_en, deadline_fa, app_no):
    en = (H("2. Service") + P("2.1 Type of service offered:") +
          UL([f"Preparation and submission of a written response to the Procedural Fairness Letter (PFL) dated {letter_date_en}, issued by Immigration, Refugees and Citizenship Canada (IRCC) in respect of the Client’s {app_en} (Application No. {app_no}).",
              f"Response deadline set by IRCC: {deadline_en}."]) +
          P("2.2 The scope of this Agreement is limited to the response to the above-mentioned letter. Any reconsideration request, new application, appeal, judicial review, or any other step that may follow IRCC’s decision is outside the scope of this Agreement and requires a separate retainer agreement."))
    fa = (H("۲. خدمات") + P("۲.۱ نوع خدمات ارائه شده:") +
          UL([f"تهیه و ارسال پاسخ کتبی به نامه انصاف رویه‌ای (PFL) مورخ {letter_date_fa}، صادر شده از سوی اداره مهاجرت، پناهندگی و شهروندی کانادا (IRCC) در خصوص {app_fa} متقاضی (شماره پرونده {app_no}).",
              f"مهلت پاسخ تعیین شده توسط IRCC: {deadline_fa}."]) +
          P("۲.۲ دامنه این قرارداد محدود به پاسخ به نامه فوق است. هرگونه درخواست بازنگری، درخواست جدید، تجدیدنظر، بازبینی قضایی یا هر اقدام دیگری که پس از تصمیم IRCC لازم شود، خارج از دامنه این قرارداد است و مستلزم انعقاد قرارداد جداگانه می‌باشد."))
    return (en, fa)

def rcic_duties_pfl(parties_en, parties_fa):
    en = (H("3. RCIC Responsibilities and Commitments") +
      P(f"The Client asked the RCIC and the RCIC has agreed to act for {parties_en} in the matter described in section 2 of this Agreement. In consideration of the fees paid and the matter stated above, the RCIC agrees to do the following:") +
      OL(["Representing the Client before IRCC in respect of the Procedural Fairness Letter.",
          "Reviewing the Procedural Fairness Letter, the application file and the concerns raised by the officer, and advising the Client on the explanations and evidence required to address each concern.",
          "Checking and verifying that the documents and explanations provided by the Client address the concerns raised and meet the requirements of the Immigration Regulations. Please note that some of the work to be undertaken may be delegated to employees or contracted out in order to expedite the work.",
          "Drafting the written response and submissions, with reference to the applicable law and guidelines where appropriate.",
          "Submitting the response through the channel and within the deadline stated in the letter, and providing the Client with proof of submission.",
          "Communication with the visa office if required for clarification until the final decision is reached.",
          "Please be advised that information and documents may be shared with employees who may be involved in this case, both salaried and contracted, and they may be shared with outside parties in the event of a complaint, investigation, tribunal, or if required by law.",
          "Track the Client’s file until IRCC’s decision on the application and endeavor to provide quality consulting services and to adequately supervise any employees participating or assisting in this process. A list of employees who might assist in the Client’s case is listed on the official website: https://sugimotovisa.com/",
          "The time IRCC takes to decide the application after the response is submitted is at the sole discretion of IRCC and the RCIC shall have no control over it.",
          "RCIC shall, if needed, obtain the assistance of a translator for communicating with the Client. Fees for such services shall be paid by the Client.",
          "If RCIC receives any original documents from the Client, he shall return such original documents as soon as the purpose for receiving these documents is achieved."]))
    fa = (H("۳. مسئولیت‌ها و تعهدات RCIC") +
      P(f"متقاضی از RCIC درخواست کرده و RCIC نیز موافقت کرده است که در موضوع ذکر شده در بخش ۲ این قرارداد، نمایندگی {parties_fa} را بر عهده بگیرد. در ازای حق‌الوکاله پرداخت شده و با توجه به موارد ذکر شده در بالا، RCIC متعهد به انجام موارد زیر است:") +
      OL(["نمایندگی متقاضی نزد IRCC در خصوص نامه انصاف رویه‌ای.",
          "بررسی نامه انصاف رویه‌ای، پرونده درخواست و نگرانی‌های مطرح شده توسط افسر، و راهنمایی متقاضی در مورد توضیحات و مدارک لازم برای پاسخ به هر یک از موارد.",
          "بررسی و تأیید اینکه مدارک و توضیحات ارائه شده توسط متقاضی، به نگرانی‌های مطرح شده پاسخ می‌دهد و مطابق با الزامات مقررات مهاجرتی است. توجه داشته باشید که بخشی از کار ممکن است به کارمندان محول یا به اشخاص دیگر واگذار شود تا روند کار سریع‌تر پیش رود.",
          "تهیه پاسخ کتبی و لایحه، در صورت لزوم با استناد به قوانین و دستورالعمل‌های مربوطه.",
          "ارسال پاسخ از طریق مسیر و در مهلت تعیین شده در نامه، و ارائه رسید ارسال به متقاضی.",
          "در صورت لزوم، برقراری ارتباط با دفتر ویزا برای توضیحات تا زمان صدور تصمیم نهایی.",
          "لطفاً توجه داشته باشید که اطلاعات و مدارک ممکن است با کارمندانی که در این پرونده نقش دارند، چه کارکنان رسمی و چه قراردادی، به اشتراک گذاشته شود و همچنین ممکن است در موارد شکایت، تحقیق، دادگاه یا در صورت لزوم قانونی با اشخاص دیگر به اشتراک گذاشته شود.",
          "پیگیری پرونده متقاضی تا زمان تصمیم IRCC در مورد درخواست و تلاش برای ارائه خدمات مشاوره‌ای با کیفیت و نظارت مناسب بر هر کارمندی که در این فرآیند مشارکت یا کمک می‌کند. فهرست کارمندانی که ممکن است در پرونده متقاضی کمک کنند، در وب‌سایت رسمی درج شده است: https://sugimotovisa.com",
          "مدت زمانی که IRCC پس از ارسال پاسخ برای تصمیم‌گیری در مورد درخواست صرف می‌کند، صرفاً در اختیار IRCC است و RCIC هیچ کنترلی بر آن ندارد.",
          "وکیل RCIC در صورت نیاز، از مترجمی برای ارتباط با متقاضی استفاده خواهد کرد. هزینه‌های این خدمات به عهده متقاضی خواهد بود.",
          "اگر RCIC هرگونه مدارک اصلی را از متقاضی دریافت کند، موظف است این مدارک را به محض رسیدن به هدف دریافت آن‌ها، به متقاضی بازگرداند."]))
    return (en, fa)

def client_duties_pfl(internal_deadline_en, internal_deadline_fa):
    en = (H("4. Client Responsibilities and Commitments") +
      P("4.1 The Client must provide, upon request from the RCIC:") +
      UL(["A complete copy of the Procedural Fairness Letter and of the application it relates to, with all attachments, within two (2) business days of signing this Agreement.",
          f"All documents, explanations and supporting evidence requested by the RCIC no later than {internal_deadline_en}, so that the response can be completed and submitted before IRCC’s deadline.",
          "All documentation in English, or with a certified English translation.",
          "Inform RCIC of the change of status, address, and any information that bears to the Client(s) application."]) +
      PS("4.2 The Client understands that they must be accurate, honest, and genuine in the information they provide. Any inaccuracies may void this Agreement or seriously affect the outcome of the response or the retention of any status they may obtain. The RCIC’s obligations under this Agreement are null and void if the Client knowingly provides any inaccurate, misleading, or false material information. The Client’s financial obligations remain.",
         "4.3 In the event Immigration, Refugees and Citizenship Canada (IRCC) should contact the Client directly, the Client is instructed to notify the RCIC immediately and to forward any further correspondence on the same day it is received.",
         "4.4 The Client is to immediately advise the RCIC of any change in the marital, family, or civil status or change of physical address or contact information for any person included in the application.",
         "4.5 The Client acknowledges that the response deadline is set by IRCC, that a request for an extension is at IRCC’s sole discretion, and that a late or incomplete response may result in the refusal of the application. The Client is responsible for the truthfulness and completeness of the explanations and evidence supplied to the RCIC.",
         "4.6 In the event of a Joint Retainer Agreement, the Clients understand that no information received in connection with the matter from one Client can be treated as confidential so far as any of the other Clients are concerned and that if a conflict develops, that cannot be resolved, the RCIC cannot continue to act for both or all of the Clients and may have to withdraw completely.",
         "4.7 If the Client fails to deliver the requested documents by the date in 4.1, the RCIC may submit the response on the basis of the material available or, where a proper response is no longer possible, terminate this Agreement in writing. In either case the RCIC is not liable for the outcome and the fees under section 5 remain payable in full."))
    fa = (H("۴. مسئولیت‌ها و تعهدات متقاضی") +
      P("۴.۱ متقاضی موظف است در صورت درخواست RCIC، موارد زیر را ارائه دهد:") +
      UL(["نسخه کامل نامه انصاف رویه‌ای و درخواست مربوط به آن، همراه با تمامی پیوست‌ها، ظرف دو (۲) روز کاری پس از امضای این قرارداد.",
          f"تمامی مدارک، توضیحات و مستندات درخواست شده توسط RCIC حداکثر تا {internal_deadline_fa}، به‌گونه‌ای که پاسخ بتواند پیش از مهلت IRCC تکمیل و ارسال شود.",
          "تمامی مدارک به زبان انگلیسی یا با ترجمه رسمی به زبان انگلیسی.",
          "اطلاع‌رسانی به RCIC در مورد هرگونه تغییر در وضعیت، آدرس و هر اطلاعات دیگری که به درخواست متقاضی مربوط می‌شود."]) +
      PS("۴.۲ متقاضی می‌داند که باید در اطلاعاتی که ارائه می‌دهد، دقت، صداقت و واقعیت را رعایت کند. هرگونه نادرستی ممکن است این قرارداد را باطل کرده یا به طور جدی بر نتیجه پاسخ یا حفظ هرگونه وضعیتی که ممکن است به دست آورد، تأثیر بگذارد. تعهدات RCIC طبق این قرارداد در صورت ارائه آگاهانه هرگونه اطلاعات نادرست، گمراه‌کننده یا کذب از طرف متقاضی، بی‌اعتبار خواهد شد. اما تعهدات مالی متقاضی پابرجا خواهد ماند.",
         "۴.۳ در صورتی که اداره مهاجرت، پناهندگی و شهروندی کانادا (IRCC) به‌طور مستقیم با متقاضی تماس بگیرد، متقاضی موظف است فوراً RCIC را مطلع کند و هرگونه مکاتبه بعدی را در همان روز دریافت، برای RCIC ارسال نماید.",
         "۴.۴ متقاضی باید بلافاصله RCIC را از هرگونه تغییر در وضعیت ازدواج، خانواده یا وضعیت مدنی، یا تغییر آدرس فیزیکی یا اطلاعات تماس هر شخصی که در درخواست گنجانده شده است، آگاه کند.",
         "۴.۵ متقاضی می‌پذیرد که مهلت پاسخ توسط IRCC تعیین شده است، درخواست تمدید مهلت صرفاً در اختیار IRCC است و پاسخ دیرهنگام یا ناقص ممکن است به رد درخواست منجر شود. مسئولیت صحت و کامل بودن توضیحات و مدارک ارائه شده به RCIC بر عهده متقاضی است.",
         "۴.۶ در صورت وجود قرارداد حق‌الوکاله مشترک، متقاضیان متوجه هستند که هیچ‌یک از اطلاعات دریافت‌شده در ارتباط با موضوع مورد نظر از یک متقاضی نمی‌تواند برای دیگر متقاضیان به‌عنوان محرمانه تلقی شود و در صورتی که تضاد غیرقابل حلی ایجاد شود، RCIC نمی‌تواند به نمایندگی از هر دو یا تمامی متقاضیان ادامه دهد و ممکن است مجبور شود به‌طور کامل کنار برود.",
         "۴.۷ اگر متقاضی مدارک درخواستی را تا تاریخ مندرج در بند ۴.۱ تحویل ندهد، RCIC می‌تواند پاسخ را بر اساس مدارک موجود ارسال کند یا، در صورتی که ارائه پاسخ مناسب دیگر ممکن نباشد، این قرارداد را به صورت کتبی فسخ نماید. در هر دو حالت، RCIC مسئولیتی در قبال نتیجه ندارد و هزینه‌های مندرج در بخش ۵ به طور کامل قابل پرداخت باقی می‌ماند."))
    return (en, fa)

FEE_NOTE_PFL_EN = ("*Professional fees exclude any government fees and any other fees that the client(s) are obligated to pay to any third party(ies), such as certified translations or expert reports. No government fee is normally payable for a response to a Procedural Fairness Letter. The above amount is to be paid by the Client(s) and is subject to change upon mutual agreement of both parties.")
FEE_NOTE_PFL_FA = ("هزینه‌های حرفه‌ای شامل هزینه‌های دولتی و هر هزینه دیگری که متقاضی موظف به پرداخت به اشخاص ثالث است، مانند ترجمه رسمی یا گزارش کارشناسی، نمی‌شود. برای پاسخ به نامه انصاف رویه‌ای معمولاً هزینه دولتی پرداخت نمی‌شود. مبلغ فوق باید توسط متقاضی پرداخت شود و ممکن است با توافق متقابل هر دو طرف تغییر کند.")

REFUND_PFL = (
    H("7. Refund Policy") +
    P("The Client acknowledges that the assessment of the response and the final decision on the application, as well as the time required to reach it, are at the sole discretion of the government of Canada and not the RCIC and any staff and/or contractors.") +
    UL(["If this Agreement is terminated in writing before the RCIC has started work on the response, unused fees, if any, will be refunded to the Client or his or her Designate.",
        "Once the RCIC has started work on the response, fees are not refundable.",
        "Fees are not refundable in the event that the application is refused after the response is submitted."]),
    H("۷. شرایط بازپرداخت") +
    P("متقاضی مطلع است که ارزیابی پاسخ و تصمیم نهایی در مورد درخواست، و همچنین زمان لازم برای آن، صرفاً در اختیار دولت کانادا است و نه RCIC و کارکنان و/یا پیمانکاران آن.") +
    UL(["در صورتی که این قرارداد پیش از شروع کار RCIC روی پاسخ، به صورت کتبی فسخ شود، هزینه‌های استفاده‌نشده، در صورت وجود، به متقاضی یا نماینده او بازپرداخت خواهد شد.",
        "پس از شروع کار RCIC روی پاسخ، هزینه‌ها قابل بازپرداخت نیستند.",
        "در صورت رد درخواست پس از ارسال پاسخ، هزینه‌ها قابل بازپرداخت نیستند."]))

TERMINATION_PFL = (
    H("12. Termination") +
    PS("12.1 This Agreement is considered terminated upon submission of the response described in section 2 and receipt of IRCC’s decision on the application.",
       "12.2 This Agreement is considered terminated if material changes occur to the Client’s application or eligibility, or if IRCC decides the application before the response can be submitted, which make it impossible to proceed with the services detailed in section 2 of this Agreement.",
       "12.3 This Agreement may be terminated, upon writing, by the Client, at which time any outstanding fees or Disbursements will be refunded by the RCIC to the Client/any outstanding fees or Disbursements will be remitted by the Client to the RCIC, subject to section 7.",
       "12.4 Pursuant to Article 11 of the Code of Professional Conduct, this Agreement may be terminated, upon writing, by the RCIC, provided withdrawal does not cause prejudice to the Client."),
    H("۱۲. مهلت قرارداد") +
    PS("۱۲.۱ این قرارداد با ارسال پاسخ موضوع بخش ۲ و دریافت تصمیم IRCC در مورد درخواست، خاتمه‌یافته تلقی می‌شود.",
       "۱۲.۲ این قرارداد در صورتی که تغییرات اساسی در درخواست یا واجد شرایط بودن متقاضی رخ دهد، یا IRCC پیش از امکان ارسال پاسخ در مورد درخواست تصمیم بگیرد، به‌گونه‌ای که ادامه خدمات مذکور در بخش ۲ غیرممکن شود، خاتمه‌یافته تلقی می‌شود.",
       "۱۲.۳ این قرارداد می‌تواند با اطلاع کتبی متقاضی خاتمه یابد که در این صورت، با رعایت بخش ۷، هزینه کارهای انجام نشده از سمت RCIC به متقاضی پرداخت خواهد شد و هرگونه هزینه پرداخت نشده کارهای انجام شده، از سمت متقاضی به RCIC پرداخت خواهد شد.",
       "۱۲.۴ بر اساس ماده ۱۱ کد رفتار حرفه‌ای، این قرارداد می‌تواند با اطلاع کتبی توسط RCIC خاتمه یابد، مشروط بر اینکه انصراف موجب ضرر به متقاضی نشود."))
