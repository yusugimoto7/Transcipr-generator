"""Sugimoto Group price list — single source for the Odoo catalogue and the
bilingual Google Sheet.

Only open programs are listed; closed programs (Start-Up Visa, Owner-Operator,
TRP, Appeal, Entrepreneur BC/Ontario, ICT/IMP, Self-employed, Vulnerable WP)
are deliberately omitted. Prices in CAD unless a service says EUR.
"""

# Shared government-fee products (pass-through, no margin).
GOV = {
    "GOV-SP":     ("Government fee – Study permit", "هزینه دولتی – مجوز تحصیل", 150),
    "GOV-WP":     ("Government fee – Work permit (incl. open WP holder fee)", "هزینه دولتی – مجوز کار", 255),
    "GOV-WP-155": ("Government fee – Work permit (base)", "هزینه دولتی – مجوز کار (پایه)", 155),
    "GOV-TRV":    ("Government fee – Visitor visa", "هزینه دولتی – ویزای ویزیتوری", 100),
    "GOV-BIO":    ("Government fee – Biometrics (per person, max 170/family)", "هزینه دولتی – بایومتریک (هر نفر، سقف ۱۷۰ برای خانواده)", 85),
    "GOV-LMIA":   ("Government fee – LMIA", "هزینه دولتی – LMIA", 1000),
    "GOV-REST":   ("Government fee – Restoration", "هزینه دولتی – Restoration", 239.75),
    "GOV-AB-EOI": ("Government fee – Alberta EOI", "هزینه دولتی – ثبت EOI آلبرتا", 200),
    "GOV-AB-APP": ("Government fee – Alberta application", "هزینه دولتی – درخواست استانی آلبرتا", 3500),
    "GOV-BC-REG": ("Government fee – BC PNP registration", "هزینه دولتی – ثبت‌نام BC PNP", 400),
    "GOV-BC-APP": ("Government fee – BC PNP application", "هزینه دولتی – درخواست استانی BC", 3500),
    "GOV-BC-WP":  ("Government fee – BC work permit stage", "هزینه دولتی – مرحله مجوز کار BC", 800),
}

CATEGORIES = {
    "pr":      ("Permanent residence", "اقامت دائم"),
    "study":   ("Study", "تحصیلی"),
    "visit":   ("Visitor visas", "ویزای ویزیتوری"),
    "permit":  ("Permits inside Canada", "خدمات پرمیت داخل کانادا"),
    "work":    ("Work permits & LMIA", "مجوز کار و LMIA"),
    "spon":    ("Sponsorship", "اسپانسرشیپ"),
    "biz":     ("Business & entrepreneur (Sparkbridge + Sugimoto)", "بیزینس و کارآفرینی (اسپارک‌بریج + سوگیموتو)"),
    "lit":     ("Litigation, appeals & special cases", "دادرسی و پرونده‌های خاص"),
    "other":   ("Other services", "سایر خدمات"),
    "eu":      ("Europe (EUR)", "اروپا (یورو)"),
}

# Each service:
#   key: dict(cat, en, fa, price, currency?, addons {label_en|label_fa: price},
#             gov [GOV keys], terms_en, terms_fa, notes_en, notes_fa,
#             components [(code, en, fa, price)]  # for combined contracts
SERVICES = {
    # --- Permanent residence ------------------------------------------------
    "EE": dict(cat="pr", en="Express Entry – PR", fa="اکسپرس انتری – اقامت دائم", price=4000,
               addons={"Spouse|همسر": 1000, "Child (each)|هر فرزند": 500}, gov=[],
               terms_en="1,500 CAD at signing; balance after ITA. Or 4 instalments of 1,000 CAD: "
                        "signing, +1 month, after ITA, before PR submission. Government fees extra.",
               terms_fa="پرداخت اول ۱٬۵۰۰ دلار همراه با امضا؛ مابقی بعد از دریافت ITA. یا چهار قسط "
                        "۱٬۰۰۰ دلاری: امضا، یک ماه بعد، بعد از ITA، قبل از سابمیت PR. هزینه‌های دولتی جدا."),
    "PNP": dict(cat="pr", en="PNP – non-Express Entry stream", fa="PNP – روش مستقیم", price=4000,
                addons={"Spouse|همسر": 1000, "Child (each)|هر فرزند": 500}, gov=[],
                terms_en="50% at signing; 50% after provincial nomination. Or 4 instalments of 1,000 CAD.",
                terms_fa="نصف مبلغ همراه با امضا؛ نصف دیگر بعد از نامینیشن استانی. یا چهار قسط ۱٬۰۰۰ دلاری."),
    "PNP-EE": dict(cat="pr", en="PNP – Express Entry stream", fa="PNP – روش اکسپرس انتری", price=4500,
                   addons={"Spouse|همسر": 1000, "Child (each)|هر فرزند": 500}, gov=[],
                   terms_en="50% at signing; 50% after provincial nomination. Or 4 instalments: "
                            "1,000 / 1,000 / 1,000 / 1,500 CAD.",
                   terms_fa="نصف مبلغ همراه با امضا؛ نصف دیگر بعد از نامینیشن. یا چهار قسط: "
                            "۱٬۰۰۰ / ۱٬۰۰۰ / ۱٬۰۰۰ / ۱٬۵۰۰ دلار."),
    "CAREGIVER": dict(cat="pr", en="Caregiver – PR", fa="پرستار خانگی – اقامت دائم", price=5000,
                      addons={"Spouse|همسر": 1000, "Child (each)|هر فرزند": 500}, gov=[],
                      terms_en="2,000 CAD at signing; balance when the 2026 details are announced, "
                               "before PR submission. 50% refund if we cannot submit.",
                      terms_fa="۲٬۰۰۰ دلار همراه با امضا؛ مابقی در زمان اعلام جزئیات ۲۰۲۶ و قبل از سابمیت. "
                               "۵۰٪ ریفاند در صورت عدم امکان سابمیت.",
                      notes_en="2026 capacity: 5 contracts. Coordinate with Mr Hamed.",
                      notes_fa="ظرفیت ۲۰۲۶: فقط ۵ نفر. با هماهنگی آقای حامد."),
    "PRC-RENEW": dict(cat="pr", en="PR card renewal (no issues)", fa="تمدید کارت اقامت دائم", price=2000),
    "PRC-LOST": dict(cat="pr", en="Replacement of lost PR card", fa="صدور مجدد کارت PR گمشده", price=1500),
    "PR-RENOUNCE": dict(cat="pr", en="PR renunciation", fa="انصراف از اقامت دائم", price=1500),
    "PR-RO": dict(cat="pr", en="PR residency obligation", fa="تعهد اقامتی PR", price=6000,
                  terms_en="Full amount at signing.", terms_fa="کل مبلغ همراه با امضا."),
    "CIT": dict(cat="pr", en="Citizenship application", fa="درخواست شهروندی", price=1500),
    "CIT-LEGAL": dict(cat="pr", en="Citizenship – with legal issue", fa="شهروندی – با مشکل قانونی", price=6000),
    "TD-PR": dict(cat="pr", en="Travel document – PR", fa="تراول داکیومنت PR", price=0,
                  notes_en="Price to be set.", notes_fa="قیمت تعیین نشده است."),

    # --- Study ----------------------------------------------------------------
    "SP-ADM": dict(cat="study", en="Admission + Study permit (college / university)",
                   fa="پذیرش و ویزای تحصیلی", price=2200,
                   addons={"Spouse open work permit|مجوز کار همسر": 800,
                           "Child study permit (each, max 500)|مجوز تحصیل فرزند (هر نفر، سقف ۵۰۰)": 250},
                   gov=["GOV-SP", "GOV-WP", "GOV-BIO"],
                   terms_en="50% at signing (admission process starts); 50% after the original letter "
                            "of acceptance. Opening offer 2,200 CAD, floor 1,800 CAD.",
                   terms_fa="۵۰٪ در زمان امضا و شروع پروسه پذیرش؛ ۵۰٪ بعد از اخذ اصل نامه پذیرش. "
                            "پیشنهاد اولیه ۲٬۲۰۰ دلار، کف قیمت ۱٬۸۰۰ دلار.",
                   notes_en="Resubmission for existing clients: 500 single / 100 spouse / 100 per child + gov fees.",
                   notes_fa="ریسابمیت برای کلاینت‌های شرکت: ۵۰۰ مجرد / ۱۰۰ همسر / ۱۰۰ هر فرزند + هزینه دولتی."),
    "SP-ADM-K12": dict(cat="study", en="Admission + Study permit (school student)",
                       fa="پذیرش و ویزای تحصیلی دانش‌آموزی", price=2200,
                       addons={"Accompanying parent visitor visa|ویزای ویزیتوری پدر یا مادر همراه": 800},
                       gov=["GOV-SP", "GOV-TRV", "GOV-BIO"],
                       terms_en="50% at signing; 50% after the original letter of acceptance.",
                       terms_fa="۵۰٪ در زمان امضا؛ ۵۰٪ بعد از اخذ اصل نامه پذیرش."),
    "SP-ONLY": dict(cat="study", en="Study permit only (admission in hand)", fa="فقط ویزای تحصیلی (با پذیرش)",
                    price=1400,
                    addons={"Spouse open work permit|مجوز کار همسر": 800,
                            "Child visitor visa (each)|ویزای ویزیتوری فرزند": 250},
                    gov=["GOV-SP", "GOV-WP", "GOV-TRV", "GOV-BIO"],
                    terms_en="Full amount plus government fees at signing.",
                    terms_fa="کل مبلغ قرارداد + هزینه‌های دولتی همراه با امضا."),
    "SPX": dict(cat="study", en="Study permit extension", fa="تمدید مجوز تحصیل", price=700, gov=["GOV-SP"],
                terms_en="Full amount plus government fees at signing.",
                terms_fa="کل مبلغ + هزینه دولتی همراه با امضا."),
    "PGWP": dict(cat="study", en="Post-graduation work permit", fa="مجوز کار پس از تحصیل (PGWP)", price=800,
                 addons={"Spouse|همسر": 400}, gov=["GOV-WP"],
                 terms_en="Full amount plus government fees at signing.",
                 terms_fa="کل مبلغ + هزینه دولتی همراه با امضا."),

    # --- Visitor ----------------------------------------------------------------
    "TRV": dict(cat="visit", en="Visitor visa (TRV)", fa="ویزای ویزیتوری (توریستی)", price=1200,
                addons={"Spouse|همسر": 300, "Child (each; 3rd onward free)|هر فرزند (از فرزند سوم رایگان)": 200},
                gov=["GOV-TRV", "GOV-BIO"],
                terms_en="Full amount plus government fees at signing.",
                terms_fa="کل مبلغ + هزینه‌های دولتی همراه با امضا.",
                notes_en="Resubmission for existing clients: 600 / 100 / 100 + gov fees.",
                notes_fa="ریسابمیت کلاینت‌های شرکت: ۶۰۰ / ۱۰۰ / ۱۰۰ + هزینه دولتی."),
    "BV": dict(cat="visit", en="Business visitor visa", fa="ویزای بیزنس ویزیتور", price=1200,
               addons={"Spouse|همسر": 300, "Child (each; 3rd onward free)|هر فرزند (از سوم رایگان)": 200,
                       "Event / conference invitation letter|دعوت‌نامه ایونت و کنفرانس": 500},
               gov=["GOV-TRV", "GOV-BIO"],
               terms_en="Full amount plus government fees at signing.",
               terms_fa="کل مبلغ + هزینه‌های دولتی همراه با امضا."),
    "SUPERVISA": dict(cat="visit", en="Parents' super visa", fa="سوپر ویزای والدین", price=1500,
                      addons={"Spouse|همسر": 500}, gov=["GOV-TRV", "GOV-BIO"],
                      terms_en="Full amount plus government fees at signing.",
                      terms_fa="کل مبلغ + هزینه‌های دولتی همراه با امضا."),

    # --- Permits inside Canada -----------------------------------------------
    "IN-WP": dict(cat="permit", en="In-Canada work permit (2025 update)", fa="ورک پرمیت داخل کانادا", price=700,
                  addons={"Spouse|همسر": 200}, gov=["GOV-WP"],
                  terms_en="Full amount plus government fees at signing.",
                  terms_fa="کل مبلغ + هزینه دولتی همراه با امضا."),
    "IN-TRV": dict(cat="permit", en="In-Canada visitor visa (permit holders)", fa="ویزای توریستی داخل کانادا",
                   price=700, addons={"Spouse|همسر": 200, "Child (one; further free)|فرزند (یک نفر؛ بیشتر رایگان)": 200},
                   gov=["GOV-TRV"],
                   terms_en="Full amount plus government fees at signing.",
                   terms_fa="کل مبلغ + هزینه دولتی همراه با امضا."),
    "VR": dict(cat="permit", en="Visitor record", fa="ویزیتور ریکورد", price=700, gov=["GOV-TRV"],
               terms_en="Full amount plus government fees at signing.", terms_fa="کل مبلغ + هزینه دولتی همراه با امضا."),
    "PERMIT-AMEND": dict(cat="permit", en="Permit amendment (e.g. remove a condition)", fa="اصلاحیه پرمیت",
                         price=500, terms_en="Full amount at signing; no government fee.",
                         terms_fa="کل مبلغ همراه با امضا؛ هزینه دولتی ندارد."),
    "RESTORE": dict(cat="permit", en="Restoration of status (added to the permit service)", fa="Restoration",
                    price=300, gov=["GOV-REST"],
                    terms_en="Full amount plus government fee at signing.", terms_fa="کل مبلغ + هزینه دولتی همراه با امضا."),

    # --- Work permits & LMIA ------------------------------------------------------
    "WP-ABROAD": dict(cat="work", en="Work permit from outside Canada", fa="ورک پرمیت از خارج کانادا", price=3000,
                      terms_en="50% at signing; 50% before submission to IRCC.",
                      terms_fa="۵۰٪ همراه با امضا؛ ۵۰٪ قبل از سابمیت در سایت اداره مهاجرت."),
    "OWP-ACC": dict(cat="work", en="Accompanying work permit (spouse / children of student or worker)",
                    fa="ورک پرمیت همراه دانشجو یا نیروی کار", price=1400,
                    addons={"Child study permit (each)|مجوز تحصیل فرزند": 200},
                    terms_en="Full amount plus government fees at signing.",
                    terms_fa="کل مبلغ + هزینه دولتی همراه با امضا."),
    "LMIA": dict(cat="work", en="LMIA with employer", fa="قرارداد LMIA با کارفرما", price=4000, gov=["GOV-LMIA"],
                 terms_en="Full LMIA amount at signing; the work-permit contract starts once LMIA is issued.",
                 terms_fa="کل مبلغ LMIA همراه با امضا؛ قرارداد ورک پرمیت بعد از دریافت LMIA شروع می‌شود."),
    "LMIA-WP": dict(cat="work", en="Work permit under LMIA", fa="ورک پرمیت نیروی کار LMIA", price=2500,
                    addons={"Spouse work permit|ورک پرمیت همسر": 1000, "Child visitor visa (each)|ویزای فرزند": 500},
                    terms_en="50% at signing; 50% before submission to IRCC. Government fees extra.",
                    terms_fa="۵۰٪ همراه با امضا؛ ۵۰٪ قبل از سابمیت. هزینه دولتی جدا."),

    # --- Sponsorship ------------------------------------------------------------
    "SPON-SPOUSE": dict(cat="spon", en="Spousal / common-law sponsorship", fa="اسپانسرشیپ همسر / کامن‌لا", price=4000,
                        terms_en="50% at signing; 50% before submission. Or 4 monthly instalments of 1,000 CAD.",
                        terms_fa="۵۰٪ همراه با امضا؛ ۵۰٪ قبل از سابمیت. یا چهار قسط ماهانه ۱٬۰۰۰ دلاری."),
    "SPON-CHILD": dict(cat="spon", en="Child sponsorship", fa="اسپانسرشیپ فرزند", price=4000,
                       terms_en="50% at signing; 50% before submission.", terms_fa="۵۰٪ همراه با امضا؛ ۵۰٪ قبل از سابمیت."),
    "SPON-PARENT": dict(cat="spon", en="Parent sponsorship", fa="اسپانسرشیپ والدین", price=5000,
                        addons={"Second parent|نفر دوم": 2000},
                        terms_en="50% at signing; 50% before submission.", terms_fa="۵۰٪ همراه با امضا؛ ۵۰٪ قبل از سابمیت."),
    "SPON-REFUSED": dict(cat="spon", en="Refused sponsorship", fa="رد شدن اسپانسرشیپ", price=10000),

    # --- Business & entrepreneur (combined Sparkbridge + Sugimoto) -----------------
    "AB-ENT": dict(cat="biz", en="Alberta entrepreneur stream – Sparkbridge + Sugimoto",
                   fa="کارآفرینی آلبرتا – اسپارک‌بریج + سوگیموتو", price=40000,
                   components=[("AB-ENT-SB", "Sparkbridge – business development fees", "اسپارک‌بریج – خدمات توسعه کسب‌وکار", 28000),
                               ("AB-ENT-SV", "Sugimoto Visa – RCIC professional fees", "سوگیموتو ویزا – حق‌الزحمه مشاور", 12000)],
                   gov=["GOV-AB-EOI", "GOV-AB-APP", "GOV-WP-155", "GOV-BIO"],
                   terms_en="Sparkbridge 28,000: 8,000 at signing (business idea, summary business plan, landing "
                            "page, pitch deck, preliminary LOR approval); 20,000 after delivery (letter of "
                            "recommendation, final business plan, financial model, competitive analysis, website). "
                            "Sugimoto 12,000: 2,000 + 200 gov at signing (file opening, EOI); 2,000 + 3,500 gov on "
                            "invitation to submit; 8,000 + 155 gov before the work-permit application. "
                            "GST/PST on Sugimoto fees: 600.",
                   terms_fa="اسپارک‌بریج ۲۸٬۰۰۰: ۸٬۰۰۰ همراه با امضا (ایده تجاری، خلاصه طرح کسب‌وکار، صفحه فرود، "
                            "پیچ‌دک، تأیید اولیه توصیه‌نامه)؛ ۲۰٬۰۰۰ پس از تحویل (توصیه‌نامه، طرح تجاری نهایی، مدل "
                            "مالی، تحلیل رقابتی، وب‌سایت). سوگیموتو ۱۲٬۰۰۰: ۲٬۰۰۰ + ۲۰۰ دولتی همراه با امضا (تشکیل "
                            "پرونده، EOI)؛ ۲٬۰۰۰ + ۳٬۵۰۰ دولتی پس از دعوت‌نامه؛ ۸٬۰۰۰ + ۱۵۵ دولتی قبل از درخواست "
                            "مجوز کار. مالیات حق‌الزحمه سوگیموتو: ۶۰۰."),
    "BC-ENT": dict(cat="biz", en="BC PNP entrepreneur – Sparkbridge + Sugimoto",
                   fa="کارآفرینی BC PNP – اسپارک‌بریج + سوگیموتو", price=38000,
                   components=[("BC-ENT-SB", "Sparkbridge – business development fees", "اسپارک‌بریج – خدمات توسعه کسب‌وکار", 26000),
                               ("BC-ENT-SV", "Sugimoto Visa – RCIC professional fees", "سوگیموتو ویزا – حق‌الزحمه مشاور", 12000)],
                   gov=["GOV-BC-REG", "GOV-BC-APP", "GOV-BC-WP", "GOV-BIO"],
                   terms_en="Sparkbridge 26,000: 8,000 at signing (Phase 1); 18,000 at the start of Phase 2. "
                            "Sugimoto 12,000: 2,000 + 400 gov at signing (file opening, provincial profile/EOI); "
                            "2,000 + 3,500 gov on ITA from BC (full provincial application); 8,000 + 800 gov before "
                            "the work-permit application (performance agreement, WP support letter, filing).",
                   terms_fa="اسپارک‌بریج ۲۶٬۰۰۰: ۸٬۰۰۰ همراه با امضا (فاز ۱)؛ ۱۸٬۰۰۰ در شروع فاز ۲. سوگیموتو ۱۲٬۰۰۰: "
                            "۲٬۰۰۰ + ۴۰۰ دولتی همراه با امضا (تشکیل پرونده، پروفایل استانی/EOI)؛ ۲٬۰۰۰ + ۳٬۵۰۰ دولتی "
                            "پس از ITA از BC (درخواست کامل استانی)؛ ۸٬۰۰۰ + ۸۰۰ دولتی قبل از درخواست مجوز کار "
                            "(توافق‌نامه عملکرد، نامه پشتیبانی، ثبت درخواست)."),
    "PROV-CERT": dict(cat="biz", en="Provincial certification – specific occupations", fa="تأیید استانی مشاغل خاص", price=2000),

    # --- Litigation & special cases --------------------------------------------------
    "JR": dict(cat="lit", en="Judicial review – refusal handled by us", fa="دادگاه فدرال – ریجکت شده با ما", price=2500,
               terms_en="Full amount at signing. Done with PAX Law; cheaper than contracting PAX Law directly.",
               terms_fa="کل مبلغ همراه با امضا. با مجموعه PAX Law؛ ارزان‌تر از قرارداد مستقیم با PAX Law."),
    "JR-REPEAT": dict(cat="lit", en="Judicial review – second time on the same file", fa="دادگاه فدرال – بار دوم همان پرونده",
                      price=2000, terms_en="Full amount at signing.", terms_fa="کل مبلغ همراه با امضا."),
    "JR-EXT": dict(cat="lit", en="Judicial review – refusal not handled by us", fa="دادگاه فدرال – ریجکت خارج از ما",
                   price=3500, terms_en="Full amount at signing (2,500 PAX Law + 1,000 SugimotoVisa).",
                   terms_fa="کل مبلغ همراه با امضا (۲٬۵۰۰ PAX Law + ۱٬۰۰۰ سوگیموتو ویزا)."),
    "MANDAMUS": dict(cat="lit", en="Mandamus (processing-delay litigation)", fa="مانداموس (تسریع پرونده)", price=2500,
                     terms_en="750 CAD – demand letter (about 30% succeed; 2–4 weeks). 1,750 CAD – Federal Court filing (2–12 months).",
                     terms_fa="۷۵۰ دلار – ارسال Demand Letter (حدود ۳۰٪ موفق؛ ۲ تا ۴ هفته). ۱٬۷۵۰ دلار – ثبت در فدرال کورت (۲ ماه تا ۱ سال)."),
    "PFL": dict(cat="lit", en="Procedural fairness letter response", fa="پاسخ به نامه PFL", price=2500,
                terms_en="Full amount at signing. Fixed at 3,000–5,000 CAD after reviewing the letter; payment plan available.",
                terms_fa="کل مبلغ همراه با امضا. مبلغ ثابت ۳٬۰۰۰ تا ۵٬۰۰۰ دلار پس از بررسی نامه؛ امکان پرداخت اقساطی."),
    "HC": dict(cat="lit", en="Humanitarian & compassionate (in Canada)", fa="روش بشردوستانه H&C (داخل کانادا)", price=6500,
               terms_en="2,000 at signing; 2,000 after 3 months; 1,500 after 6 months.",
               terms_fa="۲٬۰۰۰ همراه با امضا؛ ۲٬۰۰۰ بعد از سه ماه؛ ۱٬۵۰۰ بعد از شش ماه.",
               notes_en="Delivered by Parsay; coordinate with Mr Hossein.", notes_fa="توسط شرکت پارسای؛ هماهنگی با آقای حسین."),
    "REF": dict(cat="lit", en="Refugee claim – without hearing", fa="پناهندگی – بدون جلسه دادگاه", price=4500,
                terms_en="3,000 at signing; 1,500 after the submission.", terms_fa="۳٬۰۰۰ همراه با امضا؛ ۱٬۵۰۰ بعد از ارسال لایحه.",
                notes_en="Delivered by Parsay.", notes_fa="توسط شرکت پارسای."),
    "REF-HEAR": dict(cat="lit", en="Refugee claim – with hearing", fa="پناهندگی – با جلسه دادگاه", price=6500,
                     terms_en="3,000 at signing; 1,500 after the submission; 2,000 after the hearing notice.",
                     terms_fa="۳٬۰۰۰ همراه با امضا؛ ۱٬۵۰۰ بعد از لایحه؛ ۲٬۰۰۰ بعد از نامه جلسه Hearing.",
                     notes_en="Delivered by Parsay.", notes_fa="توسط شرکت پارسای."),
    "DETENTION": dict(cat="lit", en="Immigration / border detention", fa="بازداشت مهاجرتی و مرزبانی", price=3000,
                      notes_en="3,000–9,000 CAD depending on the case; quote per file.",
                      notes_fa="۳٬۰۰۰ تا ۹٬۰۰۰ دلار بسته به پرونده؛ قیمت اختصاصی."),
    "PRRA": dict(cat="lit", en="Pre-removal risk assessment", fa="ارزیابی خطر پیش از اخراج (PRRA)", price=3000,
                 notes_en="3,000–9,000 CAD depending on the case; quote per file.",
                 notes_fa="۳٬۰۰۰ تا ۹٬۰۰۰ دلار بسته به پرونده؛ قیمت اختصاصی."),
    "TD-REF": dict(cat="lit", en="Travel document – refugee", fa="تراول داکیومنت پناهنده", price=2000),

    # --- Other ------------------------------------------------------------------------
    "CUSTOM": dict(cat="other", en="Custom / negotiated service", fa="خدمت سفارشی / توافقی", price=0,
                   terms_en="Price and payment plan set on the quotation by the agent.",
                   terms_fa="قیمت و شرایط پرداخت توسط کارشناس روی پیش‌فاکتور تعیین می‌شود.",
                   notes_en="Use for scopes not in the list. Agent types the price and edits the terms.",
                   notes_fa="برای خدماتی که در لیست نیست. کارشناس قیمت را وارد و شرایط را ویرایش می‌کند."),

    # --- Europe (EUR) — in the sheet; not loaded into Odoo until a EUR pricelist exists
    "EU-SUV": dict(cat="eu", en="Start-up visa – Netherlands / Finland / Denmark / Lithuania / Estonia", fa="استارتاپ ویزا اروپا",
                   price=20000, currency="EUR",
                   terms_en="5,000 at signing; 10,000 after facilitator approval; 5,000 after visa filing. "
                            "Facilitator fee (5,000–10,000) paid by the client. Netherlands 25,000; Lithuania/Estonia/Denmark 15,000; UK 20,000 GBP.",
                   terms_fa="۵٬۰۰۰ زمان عقد قرارداد؛ ۱۰٬۰۰۰ بعد از تأیید طرح توسط سازمان حامی؛ ۵٬۰۰۰ بعد از ثبت ویزا. "
                            "هزینه سازمان حامی (۵ تا ۱۰ هزار) با کلاینت. هلند ۲۵٬۰۰۰؛ لیتوانی/استونی/دانمارک ۱۵٬۰۰۰؛ انگلستان ۲۰٬۰۰۰ پوند.",
                   notes_en="Refund: 100% if the plan is not approved; 75–80% if the visa is refused.",
                   notes_fa="ریفاند: کل مبلغ در صورت عدم تأیید طرح؛ ۷۵ تا ۸۰٪ در صورت ریجکت ویزا."),
    "EU-STUDY": dict(cat="eu", en="Admission + study visa – Europe", fa="پذیرش و ویزای تحصیلی اروپا", price=2150, currency="EUR",
                     addons={"Accompanying spouse visa|ویزای پیوست همسر": 1000, "Child visa (each)|ویزای پیوست فرزند": 250},
                     terms_en="50% at signing (admission process starts); 50% after the letter of acceptance. "
                              "Two spouses studying together: 3,500. Embassy and application fees paid by the client.",
                     terms_fa="۵۰٪ زمان امضا و شروع پذیرش؛ ۵۰٪ بعد از نامه پذیرش. دو نفر همزمان (همسر): ۳٬۵۰۰. "
                              "هزینه سفارت و اپلیکیشن فی با متقاضی.",
                     notes_en="Germany, Netherlands, Austria, UK, Sweden, France, Finland, Italy.",
                     notes_fa="آلمان، هلند، اتریش، انگلستان، سوئد، فرانسه، فنلاند، ایتالیا."),
    "EU-LANG": dict(cat="eu", en="Admission + study visa – language course (Hungary EN / France FR)",
                    fa="پذیرش و ویزای دوره زبان (مجارستان انگلیسی / فرانسه فرانسوی)", price=1500, currency="EUR",
                    addons={"Accompanying spouse visa|ویزای پیوست همسر": 1000, "Child visa (each)|ویزای پیوست فرزند": 250},
                    terms_en="50% at signing; 50% after the letter of acceptance.",
                    terms_fa="۵۰٪ زمان امضا؛ ۵۰٪ بعد از نامه پذیرش."),
    "EU-ADM-ONLY": dict(cat="eu", en="Admission only – Europe", fa="فقط پذیرش تحصیلی اروپا", price=1000, currency="EUR"),
    "EU-VISA-ONLY": dict(cat="eu", en="Study visa only – Europe", fa="فقط ویزای تحصیلی اروپا", price=1500, currency="EUR",
                         notes_en="Embassy and application fees paid by the client.", notes_fa="هزینه سفارت و اپلیکیشن فی با متقاضی."),
}

# How agents price outside the list — printed on the sheet and used as the rule.
CUSTOM_RULES = [
    ("Every quotation line is editable", "هر ردیف پیش‌فاکتور قابل ویرایش است",
     "The agent may change the unit price or quantity of any line. Odoo shows the list price and the discount so the "
     "negotiation is visible on the quotation.",
     "کارشناس می‌تواند قیمت واحد یا تعداد هر ردیف را تغییر دهد. اودو قیمت لیست و تخفیف را نشان می‌دهد تا مذاکره روی پیش‌فاکتور شفاف باشد."),
    ("Custom scope", "خدمت سفارشی",
     "For a service not in the list, add the 'Custom / negotiated service' line and type the price.",
     "برای خدمتی که در لیست نیست، ردیف «خدمت سفارشی / توافقی» را اضافه کرده و قیمت را وارد کنید."),
    ("Payment plan", "شرایط پرداخت",
     "Each template pre-fills its standard payment plan in the quotation's Terms. The agent edits that text freely for a custom plan; "
     "the client signs the quotation with those terms.",
     "هر قالب، شرایط پرداخت استاندارد را در بخش «شرایط» پیش‌فاکتور قرار می‌دهد. کارشناس این متن را برای شرایط سفارشی ویرایش می‌کند؛ "
     "کلاینت پیش‌فاکتور را با همان شرایط امضا می‌کند."),
    ("Government fees", "هزینه‌های دولتی",
     "Government fees are separate lines (pass-through). Tick the ones that apply; they change without notice, so keep them separate from fees.",
     "هزینه‌های دولتی ردیف‌های جداگانه هستند (بدون سود). موارد مربوط را تیک بزنید؛ این هزینه‌ها بدون اطلاع تغییر می‌کنند، پس از حق‌الزحمه جدا بمانند."),
    ("Combined contracts", "قراردادهای ترکیبی",
     "Alberta and BC entrepreneur contracts carry two lines — Sparkbridge fees and Sugimoto fees — so revenue reports split by partner.",
     "قراردادهای کارآفرینی آلبرتا و BC دو ردیف دارند — حق‌الزحمه اسپارک‌بریج و سوگیموتو — تا گزارش درآمد به تفکیک شریک باشد."),
]
