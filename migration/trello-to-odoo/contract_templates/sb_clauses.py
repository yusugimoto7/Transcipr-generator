# -*- coding: utf-8 -*-
"""Sparkbridge clause library (English + Farsi), copied from the current Word templates."""
from lib import P, PS, H, UL, OL, FEE, esc

SB_ADDR_EN = "250 - 997 Seymour St. Vancouver, BC"

# ---------- Retainer-style header block (SB-C / SB-D / SB-E) ----------
def retainer_head(no, date_en, date_fa, name_en, name_fa, nid, addr_en, addr_fa, phone, email, contact_email="Contract@SparkBridge.ca"):
    rows = [
      (P(f"Contract No: {no}"), P(f"شماره‌ ی قرارداد : {no}")),
      (P(f"This Retainer Agreement is made on {date_en}"), P(f"این قرارداد در تاریخ {date_fa}")),
      (P("between"), P("بین")),
      (P(f"Mr./Mrs.: {name_en}"), P(f"آقای/ خانم : {name_fa}")),
      (P(f"Identification Number: {nid}"), P(f"شماره‌ ملی: {nid}")),
      (P(f"Address: {addr_en}"), P(f"به آدرس: {addr_fa}")),
      (P(f"Phone Number: {phone}"), P(f"شماره‌ تماس: {phone}")),
      (P(f"Email Address: {email}"), P(f"آدرس ایمیل: {email}")),
      (P("hereinafter referred to as the “Client”."), P("که از این پس «متقاضی» خطاب می‌شود، از یک طرف")),
      (P("AND"), P("و")),
      (P(f"SPARKBRIDGE INCUBATOR LTD. located {SB_ADDR_EN} ({contact_email}) represented by CEO, Ken Sugimoto, hereinafter referred to as “Spark Bridge”. This agreement has been transcribed into both English and Farsi per the Client’s request. In case of discrepancy between the two versions, the Farsi version shall prevail."),
       P(f"شرکت SPARKBRIDGE INCUBATOR LTD واقع در کانادا، بریتیش کلمبیا، ونکوور، خیابان Seymour پلاک 997 واحد 250 با نشانی ایمیل {contact_email} با نمایندگی آقای کن سوگیموتو که از این پس اسپارک بریج خطاب می‌شود، از طرف دیگر منعقد می‌گردد. بنا به درخواست متقاضی این قرارداد به دو زبان انگلیسی و پارسی نوشته شده است. در صورت اختلاف نسخه فارسی و انگلیسی، مبنا نسخه فارسی می باشد.")),
    ]
    return rows

CONFID_SB = (
    H("Confidential Information") +
    PS("All information and documentation reviewed by Spark Bridge, required by IRCC and all other governing bodies, and used for the preparation of the application will not be divulged to any third party, other than agents and employees of Spark Bridge, without prior consent, except as demanded by law.",
       "Client agrees to the use of electronic communication (email) and storage of confidential information.",
       "The client understands this contract and its content is confidential and cannot be shared with others without Spark Bridge's written authorization. Any damages out of violation of this obligation should be paid by the Client."),
    H("اطلاعات محرمانه و الزامات مربوطه") +
    PS("اطلاعات و مدارک بررسی شده توسط اسپارک بریج ، مدارک الزامی اداره‌ی مهاجرت و دیگر نهادهای دولتی که برای پرونده مورد استفاده قرار می‌گیرند، بدون رضایت قبلی، به هیچ شخص دیگری، غیر از عوامل و همکاران اسپارک بریج ارجاع داده نمی‌شود مگر به حکم قانون.",
       "متقاضی موافقت خود را با کاربرد ارتباطات الکترونیکی (ایمیل) و ذخیره‌سازی اطلاعات محرمانه اعلام می‌دارد.",
       "به متقاضی تفهیم شد که این قرارداد و مفاد آن محرمانه است و متقاضی نمی‌تواند بدون اجازه‌ی کتبی اسپارک بریج این قرارداد را در اختیار دیگران بگذارد. هر گونه خسارت ناشی از تخلف از این تعهد، به تشخیص اسپارک بریج به عهده‌ی متقاضی است."))

FORCE_SB = (
    H("Force Majeure") + P("If the lawyer or the applicant is unable to perform any part of the contract, because of out-of-control and unrestricted circumstances such as changes in law, procedures, or government decisions, war, strikes, and natural disasters, and a fundamental change in circumstances (and not just these cases) are not considered as a violation of the provisions of this contract. Obviously, the increase in the exchange rate and the inflation caused by it are not considered force majeure, and the applicant, knowing the possibility of an increase in the exchange rate, is committed to fulfilling his obligations."),
    H("فورس ماژور") + P("در صورت عدم توانایی اسپارک بریج یا متقاضی در انجام هر بخش از این قرارداد، که در نتیجه‌ی شرایط خارج از کنترل و نامحدود مانند تغییر قانون، تغییر رویه یا تصمیمات دولتی، جنگ، اعتصابات و بلایای طبیعی و تغییر بنیادین اوضاع و احوال (و نه صرفاً این موارد) باشد، به عنوان نقض مفاد این قرارداد تلقی نمی‌گردد. بدیهی است افزایش نرخ ارز و تورم ناشی از آن فورس ماژور تلقی نشده و متقاضی با علم به امکان افزایش نرخ ارز، خود را موظف به انجام تعهدات می‌داند."))

TERM_SB = (
    H("Termination") + P("This contract will terminate upon the fulfillment of the obligations of both parties, including the commitments under clauses 3, 4, and 6. It should be noted that the commitments under the confidentiality clause shall survive even when the contract is fulfilled."),
    H("خاتمه قرارداد") + P("این قرارداد پس از ایفای کلیه تعهدات طرفین از جمله تعهدات ذیل بندهای 3، 4 و 6 پایان می یابد. لازم به ذکر است تعهدات ذیل بند محرمانگی در هر صورت برای طرفین الزام آور خواهد بود."))

LAW_SB = (
    H("Governing Laws and Jurisdiction") + P("This agreement shall be construed in accordance with the laws of the province of British Columbia, and the obligations, rights, and remedies of the parties hereunder shall be determined in accordance with such law. Any dispute between the parties should be amicably negotiated, however, any suit, action, or proceeding seeking to enforce any section of this contract may be brought in British Columbia court and each of the parties hereby consents to the jurisdiction of such court."),
    H("قوانین دولتی") + P("این قرارداد در هماهنگی با قوانین استان بریتیش کلمبیا تنظیم گردید. ضمن این که تعهدات و حقوق دو طرف باید با این قوانین مطابقت دارد. هر اختلافی بین طرفین قرارداد باید مورد مذاکره‌ی دوستانه قرار بگیرد. با این حال، امکان آن وجود دارد که در دادگاه بریتیش کلمبیا به این موارد رسیدگی شود، بدین ترتیب طرفین قرارداد این دادگاه را برای حل اختلاف می‌پذیرند."))

ENTIRETY_SB = (
    H("Entirety Clause") + P("This Agreement, including any exhibits and schedules attached hereto, constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior and contemporaneous understandings, agreements, representations, and warranties, whether written or oral, relating to such subject matter. No amendment, modification, or waiver of any provision of this Agreement shall be effective unless it is in writing and signed by both parties."),
    H("کلیت قرارداد") + P("این توافق‌نامه، شامل هرگونه پیوست و ضمائم آن، کل توافق بین طرفین را در خصوص موضوع مورد نظر تشکیل می‌دهد و تمامی تفاهم‌نامه‌ها، توافقات، نمایندگی‌ها و ضمانت‌های قبلی و هم‌زمان، چه کتبی و چه شفاهی، مرتبط با این موضوع را جایگزین می‌کند. هیچ اصلاح، تغییر یا چشم‌پوشی از هر بند این توافق‌نامه مؤثر نخواهد بود مگر اینکه به صورت کتبی باشد و توسط هر دو طرف امضا شده باشد."))

def validation_sb(companions_en=(), companions_fa=()):
    en = H("Validation") + P("The Client acknowledges that they have read this contract before signing and confirms its contents, and has also had the opportunity to receive independent legal advice (regardless of whether they have availed themselves of such opportunity or not) and ultimately finds the content of the contract satisfactory and declares their agreement with the terms and clauses of the contract.")
    fa = H("امضا قرارداد") + P("متقاضی اذعان داشت که پیش از امضا، این قرارداد را خوانده و مفاد آن را تایید می کند و همچنین امکان دریافت توصیه های حقوقی مستقل را نیز داشته است (گذشته از اینکه از چنین امکانی استفاده کرده است یا خیر) و نهایتا محتوای قرارداد را مناسب دانسته و موافقت خود را با مواد و بندهای قرارداد اعلام می دارد.")
    if companions_en:
        en += P("Companions:") + UL(companions_en); fa += P("همراهان:") + UL(companions_fa)
    return (en, fa)

def sig_block_sb(name_en, name_fa, date_en, date_fa):
    en = (P("Client") + UL([f"Name: {name_en}", "Signature:", f"Date: {date_en}"]) +
          P("Spark Bridge Incubator Ltd.") + UL(["Name of representative: Ken Sugimoto", "Position: Director", "Signature:", "Date:"]))
    fa = (P("مشتری") + UL([f"نام و نام خانوادگی: {name_fa}", "امضا:", f"تاریخ: {date_fa}"]) +
          P("شرکت شتابدهنده اسپارک بریج") + UL(["نام نماینده: کن سوگیموتو", "سمت: مدیر", "امضا:", "تاریخ:"]))
    return (en, fa)

# ---------- SB-A: EU Study Admission service agreement ----------
def sba_rows(no, date_en, name_en, name_fa, addr_en, addr_fa, country_en, country_fa, phone, email, initial, post, total, total_words_fa):
    return [
      (P(f"Client File Number: {no}"), P(f"شماره قرارداد : {no}")),
      (P(f"This Agreement was made on {date_en}, between Sparkbridge represented by Ken Sugimoto, located at {SB_ADDR_EN}, and the Client {name_en} located at {addr_en}."),
       P(f"این قرارداد در تاریخ {date_en} بین شرکت اسپارک بریج به نمایندگی کن سوگیموتو، به نشانی کانادا، بریتیش کلمبیا، ونکوور، خیابان Seymour پلاک 997 واحد 250 و متقاضی {name_fa} ، به نشانی {addr_fa} منعقد گردید.")),
      (P("WHEREAS SparkBridge and Client wish to enter into a written agreement that contains the agreed-upon terms and conditions upon which SparkBridge will provide her services to Client."),
       P("از آنجاییکه اسپارک بریج و متقاضی مایل به انعقاد یک توافق‌نامه کتبی هستند که شامل شرایط و ضوابط توافق‌شده است، بر اساس آن اسپارک بریج خدمات خود را به مشتری ارائه خواهد داد.")),
      (P(f"AND WHEREAS SparkBridge has reasonable expertise in providing university admission services to Client in designated institutions including universities and colleges in {country_en} and Client wishes to use these services to secure admission in these institutions."),
       P(f"و در حالی که اسپارک بریج دارای تخصص در ارائه خدمات پذیرش دانشگاهی به مشتری در مؤسسات تعیین‌شده از جمله دانشگاه‌ها و کالج‌های {country_fa} می‌باشد و مشتری مایل است از این خدمات برای دریافت پذیرش در این مؤسسات استفاده کند.")),
      (P("IN CONSIDERATION of the mutual covenants contained in this Agreement, the parties agree as follows:"), P("با در نظر گرفتن تعهدات متقابل مندرج در این قرارداد، طرفین به شرح زیر توافق می‌کنند:")),
      (H("1. Definitions") + P(f"Designated Institutions: shall mean all institutions and universities able to support the Client in applying for the necessary visa to enter and study in {country_en}. Business Day: shall mean working days in Canada less official federal and provincial holidays in BC."),
       H("۱. تعاریف") + P(f"مؤسسات تعیین‌شده: به معنای تمامی مؤسسات و دانشگاه‌هایی است که قادر به حمایت از مشتری برای درخواست ویزای لازم جهت ورود و تحصیل در {country_fa} می‌باشند. روز کاری: به معنای روزهای کاری در کانادا به استثنای تعطیلات رسمی فدرال و استانی در بریتیش کلمبیا می‌باشد.")),
      (H("2. Service") + P("2.1 Type of service offered:") + UL(["Admission", "Visa Document Support"]),
       H("۲. خدمات") + P("۲.۱ نوع خدمات ارائه شده:") + UL(["پذیرش", "پشتیبانی اسناد ویزا"])),
      (H("3. SparkBridge Responsibilities and Commitments") +
       P("The Client asked the SparkBridge, and the SparkBridge has agreed to act for the Client in the matter(s) as described in 2.1 of this agreement. In consideration of the fees paid and the matter stated above, the SparkBridge agrees to do the following:") +
       OL(["Checking and verifying that all Client (s) documents and forms meet the requirements of the designated institution.",
           "Verify and ensure all submissions are on time.",
           "Ensuring that all applicable admission fees are paid. The client is responsible for all admission fees and must reimburse Sparkbridge for all fees paid.",
           "Track the Client’s file through the entire admission process.",
           "SparkBridge shall, if needed, obtain the assistance of a translator for communicating with the Client. Fees for such services shall be paid by the Client.",
           "If SparkBridge receives any original documents from the Client, he shall return such original documents as soon as the purpose for receiving these documents is achieved.",
           "Providing necessary documents and general guidance in regard to visa applications including filling out forms, etc."]),
       H("۳. مسئولیت‌ها و تعهدات اسپارک بریج") +
       P("متقاضی از اسپارک بریج درخواست نموده و اسپارک بریج موافقت کرده است که در موارد ذکر شده در بند ۲.۱ این توافق‌نامه برای مشتری اقدام نماید. با توجه به هزینه‌های پرداخت‌شده و موارد ذکر شده در بالا، اسپارک بریج متعهد می‌شود که اقدامات زیر را انجام دهد:") +
       OL(["بررسی و تایید اینکه تمامی مدارک و فرم‌های متقاضی (ها) مطابق با الزامات موسسه تعیین‌شده می‌باشند.",
           "تأیید و حصول اطمینان از اینکه تمامی ارسال‌ها به موقع انجام می‌شوند.",
           "اطمینان از پرداخت تمامی هزینه‌های مربوط به پذیرش. مشتری مسئول تمامی هزینه‌های پذیرش بوده و باید هزینه های صورت گرفته را به اسپارک بریج پرداخت نماید.",
           "پیگیری پرونده متقاضی در طول تمامی مراحل پذیرش.",
           "در صورت نیاز باید از یک مترجم برای ارتباط با متقاضی کمک بگیرد. هزینه چنین خدماتی توسط متقاضی پرداخت می شود.",
           "در صورتی که اسپارک بریج مدارک اصلی را از متقاضی دریافت کرده باشد، باید اصل مدارک را به محض رسیدن به هدف از دریافت این مدارک، به متقاضی برگرداند.",
           "فراهم کردن مدارک لازم و راهنمایی کلی در خصوص درخواست ویزا از جمله پر کردن فرم ها و غیره."])),
      (H("4. Client Responsibilities and Commitments") +
       P("4.1 The Client must provide, upon request from the SparkBridge:") +
       UL(["All necessary documentation required by Designated Institutions in a timely manner.", "All documentation in the required language, or with a certified translation.", "Inform SparkBridge of the change of status, address, and any information that bears to the Client(s) application."]) +
       PS("4.2 The Applicant undertakes to provide accurate, truthful, and genuine information. The provision of any false, misleading, or deceptive information entitles SparkBridge to terminate this Agreement and may seriously impact the outcome of the application or the retention of any status obtained. In such circumstances, SparkBridge’s obligations under this Agreement shall be deemed null. However, the Applicant’s financial obligations shall remain in full force and effect.",
          "4.3 The client has confirmed that they are responsible for providing their Resume (CV) and all required documents and information in English. SparkBridge may only give advice on the structure. It is only the client’s responsibility to provide, check, and confirm the CV.",
          "4.4 If the Client fails to deliver requested documents within 60 days to SparkBridge, SparkBridge shall have the right to terminate this agreement, in which case, he shall be entitled to receive all dues as service fee."),
       H("۴. مسئولیت‌ها و تعهدات متقاضی") +
       P("۴.۱ متقاضی متعهد گردید، بنا به درخواست اسپارک بریج، موارد زیر را فراهم نماید:") +
       UL(["تمامی مدارک لازم که توسط موسسات تعیین‌شده است که مورد نیاز است، به موقع ارائه شود.", "تمامی مدارک به زبان موردنظر، یا همراه با ترجمه رسمی ارائه شود.", "هرگونه تغییر در وضعیت، نشانی و هر اطلاعاتی که مربوط به درخواست مشتری است را به اسپارک بریج اطلاع دهد."]) +
       PS("۴.۲ متقاضی متعهد است که اطلاعاتی دقیق، صادقانه و واقعی ارائه دهد. هرگونه اطلاعات نادرست اسپارک بریج را مخیر به فسخ میکند. همچنین ممکن است یا به طور جدی بر نتیجه درخواست یا حفظ هرگونه وضعیت به‌دست‌آمده تأثیر بگذارد. تعهدات اسپارک بریج بر اساس این قرارداد در صورتی که مشتری اطلاعات نادرست، گمراه‌کننده یا جعلی ارائه دهد، کان لم یکن خواهد شد. با این حال، تعهدات مالی متقاضی همچنان پابرجا خواهد بود.",
          "۴.۳ متقاضی تایید کرده است که مسئول ارائه رزومه (CV) و تمامی مدارک و اطلاعات مورد نیاز به زبان انگلیسی می‌باشد. اسپارک بریج تنها می‌تواند در مورد ساختار مشاوره ارائه دهد. تنها مسئولیت ارائه، بررسی و تایید رزومه بر عهده مشتری است.",
          "۴.۴ اگر متقاضی نتواند مدارک درخواستی را در مدت ۶۰ روز به اسپارک بریج ارائه دهد، اسپارک بریج حق دارد که این توافق‌نامه را لغو کند. در این صورت، او مجاز است تمامی هزینه‌های خدمات را به عنوان دستمزد دریافت کند.")),
      (H("5. Fees") + P("5.1 Billing Method") + P("The Client will be billed with a flat fee by milestones. All payments will be in Euros. The details of the payment terms and conditions are as follows:") +
       FEE([("Initial Payment (upon contract signature - within 7 days)", f"€ {initial}"), ("Post Admission (after admission is secured - within 7 days)", f"€ {post}")], ("Total Cost", f"€ {total}")),
       H("۵. هزینه ها") + P("۵.۱ روش پرداخت") + P("متقاضی متعهد گردید که طبق برنامه پرداختی زیر عمل کند. تمام پرداخت‌ها به یورو انجام خواهد شد. جزئیات شرایط و مقررات پرداخت به شرح زیر است:") +
       FEE([("پرداخت اولیه (پس از امضای قرارداد - ظرف ۷ روز)", f"{initial} €"), ("پرداخت پایانی (پس از اخذ پذیرش - ظرف ۷ روز)", f"{post} €")], ("هزینه کل", f"{total} € - {total_words_fa}"))),
      (H("6. Communications") + PS("6.1 SparkBridge will keep the Client informed regularly of the progress of, and issues relating to the matter. SparkBridge will also keep a copy for the Client of pertinent correspondence and documents created on their behalf.", "6.2 It is agreed by all parties that the only and most preferred fashion of communication is by email."),
       H("۶. ارتباطات") + PS("۶.۱ متقاضی را به طور مرتب از پیشرفت و مسائل مربوط به پرونده مطلع خواهد کرد. همچنین، اسپارک بریج نسخه‌ای از مکاتبات و اسناد مربوطه ایجاد شده به نمایندگی از مشتری را نیز برای او نگهداری خواهد کرد.", "۶.۲ تمامی طرف‌ها توافق کرده اند که تنها و ترجیح داده شده ترین روش ارتباط از طریق ایمیل است.")),
      (H("7. Refund Policy") + P("In case the admission is refused, all fees shall be refunded to the Client. The Client acknowledges that granting a visa or status and the time required for processing this application is at the sole discretion of the government bodies and not SparkBridge and any staff and/or contractors."),
       H("۷. شرایط بازپرداخت") + P("در صورت عدم دریافت پذیرش از دانشگاه کل مبلغ قرارداد عودت داده خواهد شد. متقاضی تایید میکند که اعطای ویزا یا وضعیت و زمان مورد نیاز برای رسیدگی به این درخواست، صرفا در اختیار نهاد های دولتی است و نه اسپارک بریج و کارکنان یا پیمانکاران آن و در نتیجه بازپرداختی صورت نخواهد گرفت.")),
      (H("8. Dispute Resolution") + P("This Agreement shall be governed by and construed in accordance with the laws of the Province of British Columbia, Canada, without regard to its conflict of laws principles. Any dispute, controversy, or claim arising out of or relating to this Agreement, or the breach, termination, or invalidity thereof, shall be resolved by arbitration administered by the British Columbia International Commercial Arbitration Centre (BCICAC) under its applicable rules."),
       H("۸. حل اختلاف") + P("این توافقنامه بدون توجه به تعارض با اصول قوانین، مطابق با قوانین استان بریتیش کلمبیا، کانادا، اداره و تفسیر می شود. هر گونه اختلاف نظر، جنجال یا ادعای ناشی از یا مربوط به این توافقنامه، یا نقض، فسخ یا بی اعتباری آن، توسط داوری که توسط مرکز داوری تجاری بین المللی بریتیش کلمبیا (BCICAC) تحت قوانین قابل اجرای آن اداره می شود، حل و فصل خواهد شد.")),
      (H("9. Confidentiality") + P("Each party agrees to keep confidential and not disclose to any third party any proprietary or confidential information received from the other party in connection with this Agreement, except as required by law or with the prior written consent of the disclosing party."),
       H("۹. محرمانه بودن") + P("هر یک از طرفین متعهد می شود که اطلاعات اختصاصی یا محرمانه دریافت شده از طرف دیگر مرتبط با این قرارداد را محرمانه نگه دارد و به هیچ شخص ثالثی فاش نکند، مگر اینکه طبق قانون یا با رضایت قبلی کتبی طرف افشاکننده، نیاز باشد.")),
      (H("10. Force Majeure") + P("Party’s failure to perform any term of this Retainer Agreement, as a result of conditions beyond his/her control such as, but not limited to, governmental restrictions or subsequent legislation, war, strikes, or acts of God, shall not be deemed a breach of this Agreement."),
       H("۱۰. فورس ماژور") + P("ناتوانی طرفین در اجرای هر یک از مفاد این قرارداد، به دلیل شرایط خارج از کنترل آنها، مانند محدودیت‌های دولتی یا قوانین بعدی، جنگ، اعتصاب، یا اتفاقات طبیعی، اما نه محدود به آنها، موجب نقض این توافقنامه نخواهد شد.")),
      (H("11. Miscellaneous") +
       PS("11.1 This Agreement constitutes the entire agreement between the parties with respect to the subject matter hereof and supersedes all prior agreements, understandings, warranties, representations, negotiations, and discussions, whether oral or written, of the parties except as specifically set forth herein.",
          "11.2 This Agreement may only be altered or amended when such changes are made in writing and executed by the parties hereto.",
          "11.3 The provisions of this Agreement shall be deemed severable. If any provision of this Agreement shall be held unenforceable by any court of competent jurisdiction, such provision shall be severed from this Agreement, and the remaining provisions shall remain in full force and effect.",
          "11.4 The headings utilized in this Agreement are for convenience only and are not to be construed in any way as additions to or limitations of the covenants and agreements contained in this Agreement.",
          "11.5 Each of the parties hereto shall do and execute or cause to be done or executed all such further and other things, acts, deeds, documents, and assurances as may be necessary or reasonably required to carry out the intent and purpose of this Agreement fully and effectively.",
          "11.6 The Agreement is drafted in Persian and English. In all mutual relationships, the English version shall prevail."),
       H("۱۱. سایر موارد") +
       PS("۱۱.۱ این توافقنامه کل توافقات بین طرفین در رابطه با موضوع این توافقنامه را تشکیل می دهد و جایگزین همه توافقات، تفاهمات، ضمانت ها، نمایندگی ها، مذاکرات و بحث های قبلی، اعم از شفاهی یا کتبی، طرفین است، مگر مواردی که به طور خاص در اینجا ذکر شده است.",
          "۱۱.۲ این توافقنامه تنها زمانی قابل تغییر یا اصلاح است که این تغییرات به صورت کتبی انجام شده و توسط طرفین این قرارداد اجرا شده باشد.",
          "۱۱.۳ مفاد این توافق نامه قابل جدا شدن خواهد بود. اگر هر یک از مفاد این توافقنامه توسط هر یک از دادگاه های صالح، غیرقابل اجرا تشخیص داده شود، چنین مفادی از این توافقنامه جدا خواهد شد و سایر مفاد به قوت خود باقی خواهند ماند.",
          "۱۱.۴ عناوین استفاده شده در این توافق نامه فقط برای سهولت است و به هیچ وجه نباید به عنوان اضافات یا محدودیت های تعهدات و توافقات مندرج در این توافقنامه تعبیر شود.",
          "۱۱.۵ هر یک از طرفین این توافق نامه باید تمام موارد دیگر، اعمال، اسناد، مدارک و ضمانت‌هایی را که ممکن است برای اجرای کامل و موثر جهت دستیابی به هدف این توافق‌نامه، به صورت ضروری یا از نظر منطقی لازم باشد، را انجام داده و اجرا کند یا باعث انجام یا اجرای آن شود.",
          "۱۱.۶ قرارداد به دو زبان فارسی و انگلیسی تنظیم گردیده لکن در روابط طرفین صرفا نسخه انگلیسی ملاک خواهد بود.")),
      (H("12. Contact Information") + P("Client") + UL([f"Name: {name_en}", f"Residential Address: {addr_en}", f"Telephone/Cellphone Number: {phone}", f"E-mail: {email}", "Signature:"]) +
       P("SparkBridge Ltd. company") + UL(["Name of representative: Ken Sugimoto", "Position: Director", "Signature:"]),
       H("۱۲. اطلاعات طرفین") + P("متقاضی") + UL([f"نام و نام خانوادگی: {name_fa}", f"آدرس: {addr_fa}", f"شماره تلفن: {phone}", f"ایمیل: {email}", "امضا:"]) +
       P("شرکت اسپارک بریج") + UL(["نام نماینده: کن سوگیموتو", "سمت: مدیر", "امضا:"])),
      (P("IN WITNESS THEREOF, this Agreement has been duly executed by the parties hereto on the date first above written."),
       P("برای گواهی موارد ذکر شده، این توافقنامه به درستی توسط طرفین در تاریخ نوشته شده در بالا اجرا شده است.")),
    ]

# ---------- SB-C: SUV Europe (DSIF) ----------
def sbc_body(country_en, country_fa, fee_total, inst, embassy_note=True):
    """inst: list of (amount_en, when_en, amount_fa_words, when_fa)"""
    rows = [
      (H("1. Background") + PS(f"a. The Client intends to establish an innovative startup in the {country_en} startup ecosystem.",
          "b. The Consultant has expertise in the European startup ecosystem and is able to provide technical, marketing, and sales services related to the product.",
          "c. Designated Startups Incubators or facilitator in startup: The organization or entity in the destination country (or countries) from which approval must be obtained as part of the process outlined in this agreement, prior to receiving approval letter, as determined and selected by Spark Bridge, shall hereinafter be referred to in this agreement as the “Relevant incubators or facilitator organization” or abbreviated as “DSIF”."),
       H("۱. پیش زمینه") + PS(f"الف- مشتری قصد راه اندازی یک کسب و کار با ایده نوآورانه در فضای استارتاپی {country_fa} را دارد.",
          "ب- مشاور دارای تخصص لازم در اکوسیستم استارتاپی اروپا بوده و توانایی ارائه خدمات فنی، بازاریابی و مارکتینگ مربوط به محصول را دارا می باشد.",
          "پ- مراکز شتابدهنده یا تسهیلگر اختصاصی استارتاپ‌ها: سازمان یا نهادی در کشور (های) مورد نظر که در فرایند انجام موضوع قرارداد نیاز به اخذ تاییدیه از آن پیش از اخذ نامه تاییدیه وجود داشته باشد، به تعیین و انتخاب اسپارک بریج، در این قرارداد از این به بعد \"سازمان شتابدهنده و یا تسهیلگر مربوطه\" یا به اختصار \"(DSIF)\" نامیده می شود.")),
      (H("2. Subject") + P(f"Providing advisory and technical services and training for the formation of a startup qualified to be accepted by a startup visa program of {country_en}. Sparkbridge shall get acceptance in one of the programs in the aforementioned countries and assist the Client in obtaining a residency permit."),
       H("۲. موضوع قرارداد") + P(f"ارائه خدمات فنی، مشاوره‌ای و آموزشی لازم برای تشکیل یک استارتاپ که شرایط لازم جهت پذیرفته شدن در یکی از برنامه های استارتاپ ویزای {country_fa} را داشته باشد. مشاور بر اساس شرایط متقاضی در یکی از برنامه های فوق الذکر تاییدیه را دریافت و به متقاضی کمک خواهد نمود تا اقامت کشور مقصد را اخذ نماید.")),
      (H("3. Spark Bridge Obligations") + OL([
          "Providing the necessary consultations for the discovery, evaluation, and implementation of a startup idea (in the form of MVP) that has the capability to operate in the European startup ecosystem and is acceptable by Relevant incubators or facilitator organizations (DSIF).",
          "Conducting comprehensive market research.",
          "Preparing a business plan in accordance with industry standards, including product information, financial forecasts, and the overall company strategy.",
          "Choosing the name and designing the logo for the prospective company.",
          "Assisting in building and designing the MVP product, along with designing and implementing a landing page (referring to a product introduction website) appropriate for the idea.",
          "Assisting the Client with preparing a professional CV.",
          "Assisting the Client with creating/updating a professional LinkedIn profile.",
          "Coaching the Client to create a profile in the portal if applicable.",
          "Assisting the Client to schedule the Client’s screening interview with the applicable organizations if necessary.",
          f"Registering a company in {country_en}, accompanied by obtaining an address for the company office and also preparing the company's articles of association."]),
       H("۳. تعهدات اسپارک بریج") + OL([
          "ارائه مشاوره های لازم جهت کشف، ارزیابی و پیاده سازی ایده استارتاپی (به صورت MVP) که قابلیت اجرا در اکوسیستم اروپا را دارا بوده و توسط سازمان شتابدهنده و یا تسهیلگر مربوطه (DSIF) قابل قبول می باشد.",
          "انجام تحقیقات بازار و ارزیابی محصول جهت ارائه در بازار",
          "آماده‌سازی طرح تجاری مطابق با استانداردهای صنعت شامل اطلاعات محصول، پیش بینی های مالی و استراتژی کلی شرکت",
          "کمک به انتخاب اسم شرکت و طراحی لوگو برای شرکت",
          "کمک به ساخت و طراحی محصول MVP همراه با طراحی و پیاده سازی لندینگ (منظور وبسایت معرفی محصول می باشد) متناسب با ایده",
          "کمک به متقاضی برای آماده‌سازی یک رزومه‌ حرفه‌ای",
          "کمک به متقاضی برای ساخت/بروزرسانی پروفایل حرفه‌ای لینکدین",
          "کمک به ایجاد پروفایل متقاضی در پرتال",
          "کمک به برقراری ارتباط با نهاد پذیرنده برای برنامه‌ریزی مصاحبه‌ی احتمالی برای انتخاب متقاضی در صورتی که نیاز باشد",
          f"ثبت شرکت در {country_fa} همراه با اخذ آدرس برای دفتر شرکت و همچنین آماده سازی اساسنامه شرکت"])),
      (H("4. Client’s Obligations") + P("The Applicant undertook to provide the following, upon Spark Bridge’s request:") + PS(
          "4.1 All necessary documents required by the organizations referred to in Article 1, as well as any documents and evidence needed for the performance of the subject matter of the contract, including but not limited to language certificate, proof of financial means, etc., shall be provided by the Applicant within 60 days from the date of execution of the contract.",
          "4.2 Provide valid contact information to Spark Bridge and announce any changes in written form via email within a week. If no new address is announced, the address in this contract will be valid and all correspondence to this address will be considered valid and notified.",
          "4.3 The undersigned party hereby agrees to check their emails on a regular basis and to immediately inform Spark Bridge via email of any telephone, postal, or electronic communications received from the competent authorities of the Immigration Department or the Organizations.",
          "4.4 In case the accepting organization offered mandatory business courses, the Client must attend the course whether it is online or in person."),
       H("۴. تعهدات متقاضی") + P("متقاضی متعهد گردید، بنا به درخواست اسپارک بریج، موارد زیر را فراهم نماید:") + PS(
          "۴.۱ تمامی مدارک لازم که توسط سازمان های مورد اشاره در ماده ۱ و هر گونه مدرک و مستنداتی که در راستای انجام موضوع قرارداد من جمله مدرک زبان، تمکن مالی و … مورد نیاز است، طی ۶۰ روز از تاریخ انعقاد قرارداد، توسط متقاضی ارائه شود.",
          "۴.۲ ارائه اطلاعات تماس معتبر به اسپارک بریج و اعلام هرگونه تغییر در آن به صورت کتبی از طریق ایمیل و ظرف یک هفته. در صورت عدم اعلام نشانی جدید، نشانی موجود در این قرارداد معتبر بوده و تمامی مکاتبات در این نشانی معتبر و ابلاغ شده تلقی خواهد گردید.",
          "۴.۳ طرف امضا کننده زیر بدینوسیله موافقت می‌کند که ایمیل‌های خود را به‌طور منظم بررسی کند و فوراً از طریق ایمیل اسپارک بریج را از هرگونه ارتباط تلفنی، پستی یا الکترونیکی دریافت‌شده از مقامات ذی‌صلاح اداره مهاجرت یا نهاد پذیرنده مطلع کند.",
          "۴.۴ در صورتی که سازمان پذیرنده دوره های تجاری اجباری را ارائه دهد، مشتری باید در این دوره شرکت کند، چه به صورت آنلاین یا حضوری باشد.")),
      (H("5. Payment Terms and Obligations") + P(f"5.1 The Professional Fees: {fee_total} Euro to be paid as follows:") +
       UL([f"{a} Euro {w}" for a, w, _, _ in inst] + (["The costs related to the embassy and the fee application are the responsibility of the applicant."] if embassy_note else [])) +
       PS("5.2 The Client is obliged to transfer the sum of the service fee to the bank accounts informed by Spark Bridge within 7 days from the requested email being sent to the Client.",
          "5.3 In the event of a delay exceeding 45 days in the payment of any of the aforementioned installments by the Applicant, Spark Bridge have the right to remove the Applicant from the startup team. However, if the Applicant settles the overdue installments, Spark Bridge may, at its discretion, assign the Applicant to another team. It is understood that the Applicant is responsible for all additional costs and damages resulting from the delayed payment."),
       H("۵. مبلغ قرارداد و شرایط پرداخت") + P(f"۵.۱ متقاضی موظف است مبلغ {fee_total} یورو به ترتیب اقساط زیر پرداخت کند:") +
       UL([f"مبلغ {aw} یورو {wf}" for _, _, aw, wf in inst] + (["هزینه های مربوط به سفارت و اپلیکیشن فی بر عهده متقاضی است."] if embassy_note else [])) +
       PS("۵.۲ متقاضی موظف است کلیه مبالغ قرارداد را به شماره حساب‌هایی که از طریق ایمیل از سوی اسپارک بریج به ایشان اعلام می شود حداکثر ظرف هفت روز از تاریخ ارسال ایمیل از سوی اسپارک بریج واریز نماید.",
          "۵.۳ در صورت عدم پرداخت به موقع هر یک از اقساط فوق الذکر و تاخیر بیش از ۴۵ روز توسط متقاضی، اسپارک بریج مختار خواهد بود متقاضی را از تیم استارتاپی حذف نماید. در صورتی که متقاضی نسبت به پرداخت اقساط معوقه اقدام نماید اسپارک بریج می تواند نسبت به جایگزینی وی در یک تیم دیگر اقدام کند لکن متقاضی مسئول پرداخت کلیه هزینه های اضافی و خسارات وارده ناشی از دیرکرد پرداخت خود می باشد.")),
      (H("6. Refund Policy") + P("If Sparkbridge fails to receive approval from the facilitator, 100% of the Service Fee will be refunded. If the rejection is resulted from the Client’s own failures to comply with its obligation, including sending necessary documents, no refunds shall be issued. In the event that the applicant’s visa request is rejected by the competent authorities, and such rejection is not due to the applicant’s fault, delay, negligence, or failure to fulfill contractual obligations—including but not limited to the failure to submit accurate, valid, complete, and timely documentation and information, or the existence of any criminal, security, or legal records—Spark Bridge undertakes to refund 80% of the received fee within a maximum of 60 business days from the date the official visa refusal documentation is provided by the applicant. Payments and refunds will be made in euros."),
       H("۶. شرایط بازپرداخت") + P("در صورتی که اسپارک بریج نتواند بابت طرح، تاییدیه را از تسهیل‌گر دریافت کند، ۱۰۰٪ هزینه خدمات عودت داده خواهد شد. در صورتی که درخواست ویزای متقاضی از سوی مراجع ذی‌صلاح رد گردد، و این رد ناشی از قصور، تاخیر، کوتاهی و یا عدم ایفای تعهدات قراردادی از سوی متقاضی، شامل و نه محدود به عدم ارائه صحیح، معتبر، کامل و به‌موقع مدارک و اطلاعات مورد نیاز، یا وجود هرگونه سابقه کیفری، امنیتی یا حقوقی در سوابق متقاضی نباشد، شرکت اسپارک بریج متعهد می‌گردد ۸۰٪ از هزینه دریافتی را حداکثر ظرف مدت ۶۰ روز کاری از تاریخ ارائه مستندات رسمی رد ویزا به متقاضی بازپرداخت نماید. بدیهی است در صورت عدم ایفای هر یک از تعهدات مندرج در ماده ۴ توسط متقاضی، اسپارک بریج، حق فسخ قرارداد بدون استرداد وجه را خواهد داشت. پرداخت و بازپرداخت به‌ شکل یورویی انجام خواهد شد.")),
      CONFID_SB, FORCE_SB, TERM_SB, LAW_SB,
    ]
    return rows

# ---------- SB-D: BC business advisory ----------
def sbd_body(fee_total, p1, p2):
    return [
      (H("1. Background") + PS("The Client intends to establish, acquire, or develop a business venture in the Province of British Columbia and requires professional advisory, analytical, and implementation services to support the commercial viability and operational readiness of such business.",
          "Sparkbridge Incubator Ltd. is engaged in the business of providing business advisory and incubation services, including business concept development, market research, site and target selection, business planning, financial modeling, competitive analysis, and digital presence development.",
          "The Client wishes to retain Sparkbridge to provide the foregoing business-related services in connection with the planning, development, and execution of the Client’s proposed business venture in British Columbia.",
          "The Client acknowledges that Sparkbridge does not provide legal, immigration, or regulatory representation and that this Agreement is limited solely to business advisory and commercial support services."),
       H("۱. پیش زمینه") + PS("الف) مشتری در نظر دارد یک فعالیت تجاری (بیزنس) را در استان بریتیش کلمبیا راه‌اندازی، خریداری و یا توسعه دهد و در این راستا، جهت اطمینان از توجیه تجاری و آمادگی عملیاتی بیزنس مذکور، نیازمند خدمات مشاوره‌ای حرفه‌ای، تحلیلی و اجرایی می‌باشد.",
          "ب) شرکت SparkBridge Incubator Ltd. در زمینه ارائه خدمات مشاوره تجاری و مراکز رشد (انکوباتور) فعالیت دارد؛ این خدمات شامل توسعه مفهوم بیزنس، تحقیقات بازار، مکان‌یابی و شناسایی اهداف تجاری، تدوین طرح کسب‌و‌کار (Business Plan)، مدل‌سازی مالی، تحلیل رقبا و توسعه حضور دیجیتال می‌باشد.",
          "ج) مشتری تمایل دارد جهت برنامه‌ریزی، توسعه و اجرای طرح تجاری پیشنهادی خود در استان بریتیش کلمبیا، از خدمات تجاری فوق‌الذکر که توسط شرکت SparkBridge ارائه می‌شود، بهره‌مند گردد.",
          "د) مشتری اذعان و تأیید می‌نماید که شرکت SparkBridge هیچ‌گونه خدمات حقوقی، مهاجرتی یا نمایندگی قانونی در برابر مراجع دولتی ارائه نمی‌دهد و این قرارداد صرفاً محدود به خدمات مشاوره تجاری و پشتیبانی بازرگانی می‌باشد.")),
      (H("2. Subject") + P("The subject of this Agreement is the provision by Sparkbridge of business advisory, analytical, planning, and implementation services to the Client in connection with the establishment, development, or acquisition of a business venture in the Province of British Columbia."),
       H("۲. موضوع قرارداد") + P("موضوع این قرارداد عبارت است از ارائه خدمات مشاوره تجاری، تحلیلی، برنامه‌ریزی و اجرایی توسط شرکت SparkBridge به مشتری، در رابطه با راه‌اندازی، توسعه و یا خریداری یک فعالیت تجاری (بیزنس) در استان بریتیش کلمبیا.")),
      (H("3. Spark Bridge Obligations") + PS("3.1 Sparkbridge shall provide professional business advisory and implementation services to the Client in accordance with the scope of services set out in this Agreement, using reasonable skill, care, and diligence consistent with industry standards.",
          "3.2 Sparkbridge’s obligations may include, as applicable:") +
       OL(["Advising the Client on business concept development and commercial positioning;", "Conducting market research and feasibility analysis;", "Assisting with site selection and target market identification;", "Preparing a business plan and supporting documentation for commercial and operational purposes;", "Developing financial models and projections based on information provided by the Client;", "Conducting competitive and industry analysis;", "Designing or coordinating the design of a basic website or digital presence for the business."]) +
       PS("3.3 Sparkbridge shall rely on information and materials provided by the Client and shall not be responsible for inaccuracies arising from incomplete, misleading, or incorrect information supplied by the Client.",
          "3.4 Sparkbridge does not provide legal, accounting, tax, immigration, or regulatory advice, and any recommendations provided under this Agreement are of a general business nature only.",
          "3.5 Sparkbridge does not guarantee commercial success, profitability, financing, partnerships, regulatory approvals, or any specific business outcome.",
          "3.6 Sparkbridge shall perform its obligations within commercially reasonable timelines; however, timelines may be adjusted due to Client delays, third-party dependencies, or circumstances beyond Sparkbridge’s reasonable control."),
       H("۳. تعهدات اسپارک بریج") + PS("۳.۱ شرکت Spark Bridge موظف است خدمات حرفه‌ای مشاوره تجاری و اجرایی را مطابق با دامنه خدمات مندرج در این قرارداد، با بهره‌گیری از مهارت، دقت و پشتکار معقول و همسو با استانداردهای این حوزه، به مشتری ارائه نماید.",
          "۳.۲ تعهدات شرکت Spark Bridge حسب مورد شامل موارد زیر می‌باشد:") +
       OL(["ارائه مشاوره به مشتری در خصوص توسعه مفهوم بیزنس و جایگاه‌سازی تجاری؛", "انجام تحقیقات بازار و تحلیل امکان‌سنجی (Feasibility Analysis)؛", "همکاری در انتخاب محل بیزنس (مکان‌یابی) و شناسایی بازارهای هدف؛", "تدوین طرح کسب‌وکار (Business Plan) و مستندات پشتیبان جهت مقاصد تجاری و عملیاتی؛", "تدوین مدل‌های مالی و پیش‌بینی‌های مالی بر اساس اطلاعات ارائه شده توسط مشتری؛", "انجام تحلیل‌های رقابتی و بررسی شاخص‌های صنعت؛", "طراحی یا هماهنگی جهت طراحی یک وب‌سایت پایه یا ایجاد حضور دیجیتال برای بیزینس."]) +
       PS("۳.۳ شرکت Spark Bridge بر اطلاعات و موادی که از سوی مشتری ارائه می‌شود اتکا خواهد کرد و هیچ‌گونه مسئولیتی در قبال عدم دقتِ ناشی از اطلاعات ناقص، گمراه‌کننده یا نادرستِ ارائه شده توسط مشتری نخواهد داشت.",
          "۳.۴ شرکت Spark Bridge هیچ‌گونه مشاوره حقوقی، حسابداری، مالیاتی، مهاجرتی یا رگولاتوری (نظارتی) ارائه نمی‌دهد و کلیه توصیه‌های ارائه شده ذیل این قرارداد صرفاً ماهیت تجاری و بیزنسی عمومی دارند.",
          "۳.۵ شرکت Spark Bridge هیچ‌گونه تضمینی در خصوص موفقیت تجاری، سودآوری، تأمین مالی، مشارکت‌ها، اخذ تاییدیه‌های قانونی و یا هرگونه نتیجه تجاری خاص ارائه نمی‌دهد.",
          "۳.۶ شرکت SparkBridge تعهدات خود را در بازه‌های زمانی معقول تجاری انجام خواهد داد؛ با این حال، این زمان‌بندی‌ها ممکن است به دلیل تأخیر از جانب مشتری، وابستگی به اشخاص ثالث، یا شرایط خارج از کنترل معقول شرکت، تغییر یابند.")),
      (H("4. Client’s Obligations") + PS("4.1 The Client shall provide complete, accurate, and timely information reasonably required for Sparkbridge to perform the services under this Agreement.",
          "4.2 The Client shall actively participate in the business planning and development process, including timely review of deliverables and feedback.",
          "4.3 The Client shall be solely responsible for all decisions relating to the establishment, operation, financing, and management of the business.",
          "4.4 The Client acknowledges that all analyses, plans, and recommendations provided by Sparkbridge are advisory in nature and that final business decisions rest exclusively with the Client.",
          "4.5 The Client shall comply with all applicable laws, regulations, and industry standards in connection with the business venture."),
       H("۴. تعهدات متقاضی") + PS("۴.۱ مشتری موظف است کلیه اطلاعات کامل، دقیق و به‌روزی را که جهت اجرای خدمات موضوع این قرارداد توسط شرکت SparkBridge مورد نیاز است، در زمان مناسب در اختیار شرکت قرار دهد.",
          "۴.۲ مشتری موظف است به‌طور فعال در فرآیند برنامه‌ریزی و توسعه بیزنس مشارکت نماید؛ این مشارکت شامل بررسی به‌موقع خروجی‌های کار (Deliverables) و ارائه بازخوردهای لازم می‌باشد.",
          "۴.۳ مسئولیت انحصاری تمامی تصمیمات مربوط به راه‌اندازی، بهره‌برداری، تأمین مالی و مدیریت بیزنس بر عهده مشتری می‌باشد.",
          "۴.۴ مشتری اذعان می‌دارد که تمامی تحلیل‌ها، طرح‌ها و توصیه‌های ارائه شده توسط SparkBridge صرفاً جنبه مشاوره‌ای داشته و اتخاذ تصمیمات نهایی تجاری منحصراً در صلاحیت و بر عهده مشتری است.",
          "۴.۵ مشتری متعهد می‌گردد که در رابطه با فعالیت تجاری خود، کلیه قوانین، مقررات و استانداردهای صنعتی مربوطه (در کانادا و بریتیش کلمبیا) را رعایت نماید.")),
      (H("5. Payment Terms and Obligations") + PS(f"5.1 In consideration for the services to be provided under this Agreement, the Client agrees to pay Sparkbridge total professional fees in the amount of CAD {fee_total} (the “Fees”).",
          "5.2 The Fees shall be payable in the following installments:") +
       OL([f"CAD {p1} upon execution of this Agreement, covering Phase 1 services;", f"CAD {p2} upon commencement of Phase 2 services."]) +
       PS("5.3 All payments shall be made in Canadian dollars to the bank account designated by Sparkbridge in writing. Payments shall be due within seven (7) days of issuance of an invoice or written payment request.",
          "5.4 The Fees are exclusive of all applicable taxes, government charges, third-party costs, and out-of-pocket expenses, which, if applicable, shall be borne by the Client unless expressly stated otherwise in writing.",
          "5.5 Late payments may, at Sparkbridge’s discretion, result in suspension of services until payment is received in full. Sparkbridge shall not be liable for any delays or consequences arising from such suspension.",
          "5.6 All Fees paid under this Agreement are non-refundable, except as expressly provided otherwise in this Agreement or as required by applicable law.",
          "5.7 The Client acknowledges that commencement of Phase 2 services shall constitute acceptance that Phase 1 services have been substantially completed."),
       H("۵. مبلغ قرارداد و شرایط پرداخت") + PS(f"۵.۱ در ازای خدماتی که طبق این قرارداد ارائه می‌شود، مشتری موافقت می‌نماید مبلغ کل {fee_total} دلار کانادا را به‌عنوان حق‌الزحمه حرفه‌ای (Fees) به شرکت Sparkbridge پرداخت نماید.",
          "۵.۲ حق‌الزحمه مذکور در اقساط زیر قابل پرداخت خواهد بود:") +
       OL([f"مبلغ {p1} دلار کانادا هم‌زمان با امضای این قرارداد، جهت پوشش خدمات فاز ۱؛", f"مبلغ {p2} دلار کانادا هم‌زمان با شروع خدمات فاز ۲."]) +
       PS("۵.۳ کلیه پرداخت‌ها باید به دلار کانادا و به حساب بانکی که توسط Sparkbridge کتباً اعلام می‌شود، واریز گردد. مهلت پرداخت وجه، حداکثر ۷ روز پس از صدور صورت‌حساب (فاکتور) یا درخواست کتبی پرداخت می‌باشد.",
          "۵.۴ مبالغ ذکر شده شامل مالیات‌های متعلقه، عوارض دولتی، هزینه‌های اشخاص ثالث و هزینه‌های جاری (Out-of-pocket expenses) نمی‌باشد؛ پرداخت این موارد بر عهده مشتری است، مگر آنکه کتباً به‌گونه دیگری توافق شده باشد.",
          "۵.۵ در صورت تأخیر در پرداخت، شرکت Sparkbridge مجاز است به تشخیص خود، ارائه خدمات را تا زمان تسویه کامل متوقف نماید. شرکت هیچ‌گونه مسئولیتی در قبال تأخیرها یا پیامدهای ناشی از این توقف خدمات نخواهد داشت.",
          "۵.۶ کلیه وجوه پرداخت شده ذیل این قرارداد غیرقابل استرداد (Non-refundable) می‌باشند، مگر در مواردی که صراحتاً در این قرارداد ذکر شده یا طبق قوانین جاری الزامی باشد.",
          "۵.۷ مشتری تأیید می‌نماید که آغاز خدمات فاز ۲ به منزله پذیرش این امر است که خدمات فاز ۱ به‌طور کامل و رضایت‌بخش انجام یافته است.")),
      (H("6. Refund Policy") + P("The amounts paid under this contract are non-refundable."), H("۶. شرایط بازپرداخت") + P("مبالغ پرداخت شده تحت این قرارداد غیرقابل استرداد می‌باشند.")),
      CONFID_SB, FORCE_SB, TERM_SB, LAW_SB, ENTIRETY_SB,
    ]

# ---------- SB-E: Alberta start-up DA letter of recommendation ----------
def sbe_body(total, p1, p2):
    return [
      (H("1. Background") + PS("a. The Client intends to establish an innovative startup in Province of Alberta.", "b. The Consultant has the expertise in the Canadian startup ecosystem and is able to provide technical, marketing, and sales services related to product."),
       H("۱. پیش زمینه") + PS("الف- مشتری در نظر دارد یک کسب‌وکار نوپا (استارت‌آپ) نوآورانه را در استان آلبرتا راه‌اندازی نموده و یا خریداری نماید.", "ب- مشاور دارای تخصص لازم در اکوسیستم استارتاپی کانادا بوده و توانایی ارائه خدمات فنی، بازاریابی و مارکتینگ مربوط به محصول را دارا می باشد.")),
      (H("2. Subject") + P("Providing advisory, technical, marketing, and business services and training for the formation of a startup to be established in Province of Alberta."),
       H("۲. موضوع قرارداد") + P("ارائه خدمات مشاوره‌ای، فنی، بازاریابی، تجاری و آموزشی جهت تشکیل یک کسب‌وکار نوپا (استارت‌آپ) که در استان آلبرتا راه‌اندازی خواهد شد.")),
      (H("3. Spark Bridge Obligations") + OL([
          "Providing the necessary consultations for the discovery, evaluation, and implementation of a startup idea (in the form of MVP) that has the capability to operate in the Alberta startup ecosystem and is acceptable by DA.",
          "Conducting comprehensive market research.",
          "Preparing a business plan in accordance with industry standards, including product information, financial forecasts, and the overall company strategy.",
          "Choosing the name and designing the logo for the prospective company.",
          "Assisting in building and designing a landing page (referring to a product introduction website) appropriate for the idea.",
          "Assisting the Client with preparing a professional CV.",
          "Assisting the Client with creating/updating a professional LinkedIn profile.",
          "Assisting the Client to schedule the Client’s screening interview with the DA if necessary.",
          "Training and coaching of the Client for the screening interview with the DA if necessary.",
          "Assisting the Client with successfully completing the screening interview and receiving letter of recommendation from DA.",
          "Registering a company in Alberta, accompanied by obtaining an address for the company office and also preparing the company's articles of association.",
          "Assisting the Client in obtaining a tax code from the Canada Revenue Agency (CRA)."]),
       H("۳. تعهدات اسپارک بریج") + OL([
          "ارائه مشاوره‌های لازم جهت شناسایی، ارزیابی و پیاده‌سازی یک ایده استارت‌آپی (در قالب MVP) که قابلیت فعالیت در اکوسیستم استارت‌آپی آلبرتا را داشته و مورد تأیید آژانس‌های منتخب (DA) باشد.",
          "انجام تحقیقات بازار و ارزیابی محصول جهت ارائه در بازار",
          "آماده‌سازی طرح تجاری مطابق با استانداردهای صنعت شامل اطلاعات محصول، پیش بینی های مالی و استراتژی کلی شرکت",
          "کمک به انتخاب اسم شرکت و طراحی لوگو برای شرکت",
          "کمک به ساخت و طراحی یک لندینگ پیج (صفحه فرود با ارجاع به وب‌سایت معرفی محصول) متناسب با ایده مربوطه.",
          "کمک به متقاضی برای آماده‌سازی یک رزومه‌ حرفه‌ای",
          "کمک به متقاضی برای ساخت/بروزرسانی پروفایل حرفه‌ای لینکدین",
          "کمک به مشتری جهت زمان‌بندی جلسه مصاحبه غربالگری با آژانس منتخب (DA) در صورت نیاز.",
          "آموزش و آماده‌سازی متقاضی برای مصاحبه‌ی احتمالی برای انتخاب متقاضی توسط DA در صورتی که نیاز باشد",
          "کمک به مشتری جهت اتمام موفقیت‌آمیز مصاحبه غربالگری و اخذ نامه‌ی توصیه (Letter of Recommendation) از آژانس منتخب (DA).",
          "ثبت شرکت در آلبرتا، به همراه اخذ نشانی برای دفتر شرکت و همچنین آماده‌سازی اساسنامه شرکت.",
          "کمک به مشتری جهت اخذ کد مالیاتی از سازمان امور مالیاتی کانادا (CRA)."])),
      (H("4. Client’s Obligations") + PS(
          "4.1 Provide valid contact information to Spark Bridge and announce any changes in written form via email within a week. If no new address is announced, the address in this contract will be valid and all correspondence to this address will be considered valid and notified. The applicant acknowledges that all correspondence between the parties will be conducted exclusively via email.",
          "4.2 The undersigned party hereby agrees to check their emails on a regular basis and to immediately inform Spark Bridge via email of any telephone, postal, or electronic communications received from the competent DAs.",
          "4.3 The minimum required language test level is 5 in Canadian Language Benchmark (CLB) for the Client. The language level of CLB5 is equivalent to the IELTS General test score, as shown in the following order: Reading: 4, Writing: 5, Listening: 5, Speaking: 5. The Client shall provide a valid language proficiency certificate within nine (9) months from the date of execution of this Agreement (signature date).",
          "4.4 In case the designated agency offers mandatory business courses, the Client must attend the course whether it is online or in person."),
       H("۴. تعهدات متقاضی") + PS(
          "۴.۱ ارائه اطلاعات تماس معتبر به اسپارک بریج و اعلام هرگونه تغییر در آن به صورت کتبی از طریق ایمیل و ظرف یک هفته. در صورت عدم اعلام نشانی جدید، نشانی موجود در این قرارداد معتبر بوده و تمامی مکاتبات در این نشانی معتبر و ابلاغ شده تلقی خواهد گردید. متقاضی اطلاع دارد که کلیه مکاتبات از سمت طرفین، تنها بصورت مکاتبه از طریق ایمیل خواهد بود.",
          "۴.۲ طرف امضا کننده بدین‌وسیله موافقت می‌نماید که ایمیل‌های خود را به‌طور منظم بررسی کرده و هرگونه مکاتبات تلفنی، پستی یا الکترونیکی دریافت شده از سوی آژانس‌های منتخب (DA) ذی‌صلاح را بلافاصله از طریق ایمیل به اطلاع Spark Bridge برساند.",
          "۴.۳ حداقل سطح آزمون زبان مورد نیاز ۵ در معیار زبان کانادایی (CLB) برای مشتری است. سطح زبان CLB 5 معادل نمره ۵ آزمون آیلتس جنرال است: Reading: 4, Writing: 5, Listening: 5, Speaking: 5. مشتری موظف است حداکثر ظرف مدت ۹ ماه از تاریخ اجرای این قرارداد (تاریخ امضا)، مدرک معتبر مهارت زبانی خود را ارائه نماید.",
          "۴.۴ در صورتی که آژانس منتخب دوره‌های تجاری اجباری ارائه دهد، مشتری موظف است در آن دوره، خواه به صورت آنلاین یا حضوری، شرکت نماید.")),
      (H("5. Payment Terms and Obligations") + P(f"5.1 The Professional Fees: {total} CAD to be paid as follows:") +
       UL([f"{p1} CAD upon signing this agreement. After successful payment of this fee, Sparkbridge shall deliver the following: Business idea; Summary business plan; Landing page; Pitch Deck; Preliminary approval for letter of recommendation.",
           f"{p2} CAD after delivery of aforementioned items. After successful payment of this fee, Sparkbridge shall deliver the following: Acquiring letter of recommendation for the Client; Delivery of Final Business Plan; Delivery of Financial Model; Delivery of Competitive Analysis; Delivery of Website (landing page)."]) +
       PS("5.2 The Client is obliged to transfer the sum of the service fee to the bank accounts informed by Spark Bridge within 7 days from the requested email being sent to the Client.",
          "5.3 In the event of non-payment of any of the aforementioned installments on time and a delay of more than 45 days by the Client, Spark Bridge will have the authority to terminate this agreement.",
          "5.4 All amounts previously paid by the Client to Sparkbridge under this Agreement shall immediately and irrevocably become earned, non-refundable service fees, deemed compensation for services rendered, time allocated, opportunity costs, and administrative expenses incurred by Sparkbridge, regardless of the stage of completion of the services except for the following: In case Sparkbridge fails to deliver the Letter of Recommendation, 50% of paid amounts will be refunded to the Client.",
          "5.5 If the applicant fails to fulfill all or part of the commitments stipulated in this contract for any reason, and as a result, there is a flaw in their file, they will be responsible for the damages incurred to Spark Bridge and third parties. In any case, the applicant is obligated to pay the full amount of the contract."),
       H("۵. مبلغ قرارداد و شرایط پرداخت") + P("۵.۱ متقاضی موظف است مبلغ بیست و هشت هزار دلار کانادا به ترتیب اقساط زیر پرداخت کند:") +
       UL(["مبلغ هشت هزار دلار هنگام امضای این قرارداد. پس از پرداخت موفقیت‌آمیز این مبلغ، شرکت Sparkbridge موارد زیر را تحویل خواهد داد: ۱. ایده تجاری ۲. خلاصه طرح کسب‌وکار (Summary business plan) ۳. صفحه فرود (Landing page) ۴. اسلایدهای ارائه (Pitch Deck) ۵. تایید اولیه جهت صدور توصیه نامه",
           "مبلغ بیست هزار دلار پس از تحویل موارد ذکر شده در بند قبلی. پس از پرداخت موفقیت‌آمیز این مبلغ، شرکت Sparkbridge موارد زیر را تحویل خواهد داد: ۱. اخذ نامه‌ی توصیه (Letter of Recommendation) برای مشتری ۲. تحویل طرح تجاری نهایی (Final Business Plan) ۳. تحویل مدل مالی (Financial Model) ۴. تحویل تحلیل رقابتی (Competitive Analysis) ۵. تحویل وب‌سایت (صفحه فرود)"]) +
       PS("۵.۲ متقاضی موظف است کلیه مبالغ قرارداد را به شماره حساب‌هایی که از طریق ایمیل از سوی اسپارک بریج به ایشان اعلام می شود حداکثر ظرف هفت روز از تاریخ ارسال ایمیل از سوی اسپارک بریج واریز نماید.",
          "۵.۳ در صورت عدم پرداخت هر یک از اقساط فوق‌الذکر در موعد مقرر و تاخیر بیش از ۴۵ روز از سوی مشتری، Spark Bridge اختیار فسخ این قرارداد را خواهد داشت.",
          "۵.۴ کلیه مبالغی که پیش از این توسط مشتری تحت این قرارداد به Sparkbridge پرداخت شده است، بلافاصله و به‌صورت غیرقابل‌بازگشت به عنوان حق‌الزحمه خدماتِ انجام‌یافته تلقی می‌گردد؛ این مبالغ به عنوان جبران خدمات ارائه‌شده، زمان اختصاص‌یافته، هزینه‌های فرصت و هزینه‌های اداری متحمل شده توسط Sparkbridge در نظر گرفته می‌شود، صرف‌نظر از اینکه خدمات در چه مرحله‌ای از تکمیل باشند، به استثنای مورد زیر: در صورتی که Sparkbridge در تحویل توصیه نامه (Letter of Recommendation) ناموفق باشد، ۵۰٪ از مبالغ پرداختی به مشتری مسترد خواهد شد.",
          "۵.۵ در صورتی که متقاضی به هردلیل تمام یا بخشی از تعهدات مندرج در این قرارداد را ایفا ننماید و در نتیجه آن خللی در پرونده وی حاصل گردد مسئول خسارات وارده به اسپارک بریج و اشخاص ثالث بوده و در هر صورت وی ملزم به پرداخت کامل مبلغ قرارداد می باشد.")),
      CONFID_SB, FORCE_SB, TERM_SB, LAW_SB, ENTIRETY_SB,
    ]

# ---------- SB-F: Business event service agreement (English only) ----------
def sbf_rows(no, date_en, name_en, addr_en, fee, email):
    return [
      H("Service Agreement") + P(f"Contract Number: {no}"),
      P(f"THIS SERVICE AGREEMENT is made on {date_en} (“Effective Date”). This service agreement (the \"Agreement\") is hereby entered into by SPARKBRIDGE INCUBATOR LTD. and its registered office located Unit 250 - 997 Seymour St. Vancouver, BC on one hand, and {name_en} (the “Client”) residing at {addr_en} on the other. Each party hereunder is hereinafter referred to as a \"Party\" and both parties together are the “Parties\"."),
      H("Recitals") + OL(["Whereas the Client intends to participate in a Business Event.", "Whereas the Company has expertise and experience in business consulting services.", "Whereas the Client wishes to use services offered by the Company to find a Business Event."]) + P("NOW, THEREFORE, the Parties agree as follows:"),
      H("1. Definitions") + OL(["Business Days: shall mean any day other than Saturday, Sunday or statutory holiday in Canada.", "Business Event: shall mean relevant business event relevant to Client’s expertise and/or preference."]),
      H("2. Scope of the Service") + P("Company is to provide the Client with the following services (the “Services”):") + UL(["Identifying a Business Event.", "Registering the Client for the Business Event.", "Receive appropriate invitation letters/tickets for the Event."]) + P("The services will include any other tasks which the Client and the Company may agree on."),
      H("3. Compensation and License Fee") + OL([f"For services rendered hereunder Company is entitled to receive ${fee} CAD (“Service Fee”) exclusive of any taxes and levies from the Client. All payments made to the Company shall be transferred to the designated bank account of the Company.",
          "The Company shall be responsible for 100% of the costs associated with the execution of Services and shall in no case demand any additional fees beyond those agreed, excluding the relevant government fees."]),
      H("4. Term") + P("This Agreement shall continue in force for a period of three months from the Effective Date (the “Term”). Thereafter, the agreement may extend upon mutual agreement of the Parties."),
      H("5. Representation and Warranties") + P("The Company represents and warrants that:") + OL(["It will perform the Services with reasonable care and skill.", "It will act in good faith to further the business interest of the Client in the process of implementing this Agreement."]) + P("Client represents and warrants that:") + OL(["It provides all the necessary documents truthfully and in due time."]),
      H("6. Indemnification") + P("Each Party hereby agrees to indemnify, defend and hold the other Party, its Affiliates, its licensees, its licensors, and its and their officers, directors, employees, consultants, contractors, sublicensees and agents (collectively, “Representatives”) harmless from and against any and all damages or other amounts payable to a Third Party claimant, as well as any reasonable attorneys’ fees and costs of litigation (collectively, “Damages”) arising out of or resulting from any claim, suit, proceeding or cause of action (each, a “Claim”) brought by a Third Party against a Party or its Representatives based on: (a) breach of any representation or warranty by the Indemnifying Party contained in this Agreement, (b) breach of any applicable Law by such Indemnifying Party, or (c) gross negligence or willful misconduct by such Indemnifying Party, its Affiliates, or their respective employees, contractors or agents."),
      H("7. Limitation of Liability") + P("NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED IN THIS AGREEMENT, (I) NEITHER PARTY SHALL BE LIABLE TO THE OTHER PARTY, ITS AGENTS, AFFILIATES, CLIENTS, OR ANY OTHER PERSONS, FOR ANY LOST PROFITS OR INDIRECT, INCIDENTAL, SPECIAL, PUNITIVE, CONSEQUENTIAL OR SIMILAR DAMAGES, EVEN IF ADVISED IN ADVANCE OF THE POSSIBILITY OF SUCH DAMAGES, AND (II) EXCEPT FOR EITHER PARTY'S INDEMNIFICATION OBLIGATIONS FOR THIRD PARTY CLAIMS RELATED TO INTELLECTUAL PROPERTY INFRINGEMENT UNDER THIS AGREEMENT, IN NO EVENT WILL EITHER PARTY BE LIABLE TO THE OTHER FOR ANY AND ALL CAUSES, IN THE AGGREGATE, ARISING OUT OF, RELATING TO, OR IN CONNECTION WITH THIS AGREEMENT OR THE PERFORMANCE OF ITS OBLIGATIONS HEREUNDER EXCEEDING."),
      H("8. Force Majeure") + P("No failure or omission by the Parties in the performance of any obligation of this Agreement will be deemed a breach of this Agreement or create any liability if the same will arise from any cause or causes beyond the control of the Parties, including, but not limited to, the following: acts or omissions of any government; any rules, regulations or orders issued by any governmental authority or by any officer, department, agency or instrumentality thereof; fire; flood; storm; earthquake; accident; war; rebellion; insurrection; riot; and invasion. The affected Party shall notify the other Party of such force majeure circumstances as soon as reasonably practicable, and shall promptly undertake all reasonable efforts necessary to cure such force majeure circumstances."),
      H("9. Assignment") + P("Neither this Agreement nor any of the rights, interests or obligations hereunder shall be assigned by any of the parties hereto (whether by operation of law or otherwise) without the prior written consent of the other party. Subject to the preceding sentence, this Agreement will be binding upon, inure to the benefit of and be enforceable by the parties and their respective successors and assigns."),
      H("10. Confidentiality") + P("The Parties acknowledge that any oral or written information exchanged among them with respect to this Agreement is confidential information. Each Party shall maintain the confidentiality of all such information, and without obtaining the written consent of other Parties, it shall not disclose any relevant information to any third parties, except in the following circumstances: (a) such information is or will be in the public domain (provided that this is not the result of public disclosure by the receiving party); (b) information disclosed as required by applicable laws or rules or regulations of any stock exchange; or (c) information required to be disclosed by any Party to its legal counsel or financial advisor regarding the transaction contemplated hereunder, and such legal counsel or financial advisor are also bound by confidentiality duties similar to the duties in this section. Disclosure of any confidential information by the staff members or agency hired by any Party shall be deemed disclosure of such confidential information by such Party, which Party shall be held liable for breach of this Agreement. This Section shall survive the termination of this Agreement for any reason."),
      H("11. Termination") + OL(["Notwithstanding the foregoing, either party may terminate this Agreement (a) upon sixty (60) calendar days written notice to the other party in the event that the other party is in material breach and fails to cure the breach during the notice period; or (b) immediately, if the other party becomes insolvent or seeks protection, voluntarily or involuntarily, under any bankruptcy law. Termination will not affect (i) either party's right to recover any monetary amounts, or require the performance of any obligations, due at the time of termination, or (ii) any licenses granted to End Users or third-party platforms.", "Both parties waive the right to terminate the Agreement without cause."]),
      H("12. Dispute settlement and Governing law") + P("This Agreement shall be governed by and construed in accordance with the laws of British Columbia and the laws of Canada applicable therein. Any and all disputes arising under this Agreement, whether as to interpretation, performance or otherwise, shall be subject to the exclusive jurisdiction of the courts of the Province of British Columbia and each of the parties hereto hereby irrevocably attorns to the jurisdiction of the courts of such province."),
      H("13. Notices") + P("Any notice, demand or request required or permitted to be given under this Agreement shall be in writing and shall be deemed sufficient when delivered personally or by overnight courier or sent by email to the party to be notified at such party's address as set forth:") + UL([f"Client’s email address: {email}", "Company’s email address: Contract@SparkBridge.ca"]),
      H("14. General") + OL(["The waiver of any breach or default of this Agreement will not constitute a waiver of any subsequent breach or default, and will not act to amend or negate the rights of the waiving party.", "If any provision contained in this Agreement is determined to be invalid, illegal or unenforceable in any respect under any applicable law, then such provision will be severed and replaced with a new provision that most closely reflects the original intention of the parties, and the remaining provisions of this Agreement will remain in full force and effect.", "The headings are inserted for the convenience of reference only and shall not in any way form part of effect or be taken into account in the construction or interpretation of any provision of this Agreement.", "Any variation of this Agreement is valid only if it is in writing and signed by each Party."]),
      P("IN WITNESS WHEREOF, the parties hereto have the authority to bind their respective organizations and execute this Agreement to be effective as of the Effective Date hereof."),
    ]
