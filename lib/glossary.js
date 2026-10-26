// The brand's glossary: one Persian name for every immigration term, so a work permit is
// «اجازه کار» in the script, the Telegram post, the article, the carousel, the story, the
// subtitles and the motion graphics alike, never «مجوز کار» in one and «ورک پرمیت» in the next.
// The terms come from the site's own pages (sugimotovisa.com/pr/, /pr/pnp/, /immigrate-to-canada/,
// Oct 2026) plus the legal and European terms the app already used.
//
// Where the glossary lives: the team edits it in the Google Sheet's "Glossary" tab (same Apps
// Script as the Seen / Library tabs; `google-apps-script.gs`). The list below is the seed that
// fills the tab the first time, and the fallback whenever the Sheet is not configured or cannot be
// read. Once the tab has rows, the tab is the whole glossary: a row with `active` = no is left out,
// a changed `fa` wins, a new row is a new term. `POST /api/glossary {seed:true}` adds the built-in
// terms a later version of this file brings, without touching the team's rows.
//
// Columns: en (the English term, the key), abbr (its acronym, when one is used), fa (the one
// Persian name), spoken (a shorter everyday form allowed after the first full mention in spoken
// content), avoid (forms never to use), group, note.

import { sheetEnabled } from "./sheet.js";

export const COLUMNS = ["en", "abbr", "fa", "spoken", "avoid", "group", "note", "active"];

export const GROUPS = {
  status: ["وضعیت اقامت و شهروندی", "Status and citizenship"],
  programs: ["برنامه‌های فدرال", "Federal programmes"],
  pnp: ["برنامه‌های استانی", "Provincial programmes"],
  provinces: ["استان‌ها و قلمروها", "Provinces and territories"],
  work: ["کار", "Work"],
  study: ["تحصیل", "Study"],
  family: ["خانواده و اسپانسرشیپ", "Family and sponsorship"],
  business: ["مهاجرت تجاری", "Business immigration"],
  language: ["زبان", "Language"],
  documents: ["مدارک", "Documents"],
  process: ["پرونده و روند", "Applications and process"],
  institutions: ["نهادها و افراد", "Institutions and people"],
  legal: ["حقوقی و دادگاه", "Legal and court"],
  europe: ["اروپا", "Europe"],
  general: ["عمومی", "General"],
};

const T = (group, en, fa, extra = {}) => ({ group, en, fa, abbr: "", spoken: "", avoid: "", note: "", ...extra });

export const BUILTIN = [
  // status
  T("status", "permanent residence", "اقامت دائم", { abbr: "PR", avoid: "اقامت دائمی، پی‌آر، رزیدنسی" }),
  T("status", "permanent resident", "مقیم دائم", { avoid: "رزیدنت دائم، ساکن دائم" }),
  T("status", "PR card", "کارت اقامت دائم", { spoken: "کارت PR", avoid: "پی‌آر کارت" }),
  T("status", "PR card renewal", "تمدید کارت اقامت دائم"),
  T("status", "permanent resident travel document", "سند سفر اقامت دائم", { abbr: "PRTD", avoid: "تراول داکیومنت" }),
  T("status", "residency obligation", "الزام اقامت", { note: "۷۳۰ روز حضور در هر دورهٔ پنج‌ساله" }),
  T("status", "physical presence", "حضور فیزیکی در کانادا"),
  T("status", "temporary residence", "اقامت موقت", { abbr: "TR" }),
  T("status", "temporary resident", "مقیم موقت"),
  T("status", "temporary resident visa", "ویزای موقت", { abbr: "TRV", note: "برچسب ویزا برای ورود؛ خود اجازه کار یا تحصیل نیست" }),
  T("status", "visitor visa", "ویزای توریستی", { spoken: "ویزای ویزیتوری", avoid: "ویزای بازدید، ویزای دیدار" }),
  T("status", "single-entry visa", "ویزای یک‌بار ورود"),
  T("status", "multiple-entry visa", "ویزای چندبار ورود"),
  T("status", "super visa", "سوپر ویزا"),
  T("status", "electronic travel authorization", "مجوز سفر الکترونیکی", { abbr: "eTA" }),
  T("status", "TR to PR", "تبدیل اقامت موقت به اقامت دائم", { abbr: "TR to PR" }),
  T("status", "out-of-status", "بدون وضعیت قانونی", { avoid: "غیرقانونی" }),
  T("status", "citizenship", "شهروندی کانادا", { avoid: "سیتیزن‌شیپ، تابعیت کانادا" }),
  T("status", "Canadian citizen", "شهروند کانادا", { avoid: "سیتیزن" }),
  T("status", "citizenship application", "درخواست شهروندی", { note: "naturalization" }),
  T("status", "citizenship certificate", "گواهی شهروندی"),
  T("status", "renunciation", "ترک تابعیت"),
  T("status", "Canadian passport", "پاسپورت کانادایی"),
  T("status", "immigrant", "مهاجر"),
  T("status", "newcomer", "تازه‌وارد"),
  T("status", "foreign national", "تبعه خارجی", { avoid: "اتباع بیگانه" }),
  T("status", "dependants", "افراد تحت تکفل", { spoken: "همسر و فرزندان" }),

  // federal programmes
  T("programs", "Express Entry", "اکسپرس اینتری", { avoid: "اکسپرس انتری، ورود سریع" }),
  T("programs", "Express Entry pool", "استخر اکسپرس اینتری", { spoken: "پول اکسپرس اینتری" }),
  T("programs", "Express Entry profile", "پروفایل اکسپرس اینتری", { avoid: "نمایه" }),
  T("programs", "Comprehensive Ranking System", "سیستم رتبه‌بندی جامع", { abbr: "CRS" }),
  T("programs", "CRS score", "امتیاز CRS", { avoid: "نمره CRS، اسکور" }),
  T("programs", "cut-off score", "حداقل امتیاز", { note: "حداقل امتیاز CRS یک قرعه‌کشی" }),
  T("programs", "Invitation to Apply", "دعوت‌نامه اقدام برای اقامت دائم", { abbr: "ITA", spoken: "دعوت‌نامه (ITA)", avoid: "آی‌تی‌ای" }),
  T("programs", "draw", "قرعه‌کشی", { note: "round of invitations", avoid: "دراو، دور دعوت" }),
  T("programs", "category-based selection", "دسته‌بندی‌های اولویت‌دار اکسپرس اینتری", { spoken: "کتگوری", note: "مثلاً مشاغل سلامت، فنی و صنعتی، فرانسوی‌زبان، مشاغل آموزشی" }),
  T("programs", "Federal Skilled Worker Program", "برنامه نیروی کار ماهر فدرال", { abbr: "FSWP", avoid: "نیروی متخصص فدرال، فدرال اسکیل ورکر" }),
  T("programs", "Canadian Experience Class", "کلاس تجربه کانادایی", { abbr: "CEC", avoid: "برنامه تجربه کانادایی، تجربه کانادا" }),
  T("programs", "Federal Skilled Trades Program", "برنامه نیروی فنی فدرال", { abbr: "FSTP", avoid: "فدرال اسکیل ترید" }),
  T("programs", "Atlantic Immigration Program", "برنامه مهاجرت آتلانتیک", { abbr: "AIP", avoid: "برنامه استانی آتلانتیک" }),
  T("programs", "Rural Community Immigration Pilot", "پایلوت مهاجرت جوامع روستایی", { abbr: "RCIP", avoid: "برنامه مهاجرتی مناطق روستایی" }),
  T("programs", "Rural and Northern Immigration Pilot", "پایلوت مهاجرت روستایی و شمالی", { abbr: "RNIP" }),
  T("programs", "Francophone Community Immigration Pilot", "پایلوت جوامع فرانسوی‌زبان", { abbr: "FCIP" }),
  T("programs", "Home Care Worker Immigration Pilots", "پایلوت مهاجرت مراقبان خانگی", { abbr: "HCWIP", avoid: "برنامه کارگران مراقبت در منزل" }),
  T("programs", "caregiver", "مراقب خانگی", { avoid: "پرستار خانگی، کرگیور" }),
  T("programs", "Economic Mobility Pathways Pilot", "پایلوت تحرک اقتصادی", { abbr: "EMPP" }),
  T("programs", "Immigration Levels Plan", "برنامه سطوح مهاجرتی کانادا", { note: "مثلاً برنامه سطوح مهاجرتی ۲۰۲۶ تا ۲۰۲۸" }),
  T("programs", "Education Occupations Category", "دسته‌بندی مشاغل آموزشی"),
  T("programs", "agriculture and fish processing stream", "مسیر کشاورزی و فرآوری ماهی"),
  T("programs", "Quebec Skilled Worker Program", "برنامه نیروی کار ماهر کبک", { abbr: "QSWP" }),
  T("programs", "Quebec Experience Program", "کلاس تجربه کبک", { abbr: "PEQ" }),
  T("programs", "Quebec Acceptance Certificate", "گواهی پذیرش کبک", { abbr: "CAQ" }),
  T("programs", "economic immigration", "مهاجرت اقتصادی"),
  T("programs", "economic class", "طبقه اقتصادی"),
  T("programs", "pathway", "مسیر", { note: "مسیر مهاجرتی", avoid: "پث‌وی" }),
  T("programs", "pilot", "پایلوت", { note: "برنامهٔ آزمایشی", avoid: "برنامه پایلوتی" }),
  T("programs", "intake", "پذیرش درخواست", { note: "باز یا بسته شدن پذیرش یک برنامه" }),
  T("programs", "cap", "سقف", { note: "سقف پذیرش یا ظرفیت" }),
  T("programs", "H-1B visa", "ویزای H-1B آمریکا", { abbr: "H-1B" }),

  // provincial programmes
  T("pnp", "Provincial Nominee Program", "برنامه نامزدی استانی", { abbr: "PNP", spoken: "برنامه استانی", avoid: "برنامه انتخاب استانی، برنامه نامزد استانی، ویزای استانی" }),
  T("pnp", "provincial nomination", "نامزدی استانی", { avoid: "نامینیشن" }),
  T("pnp", "nomination certificate", "گواهی نامزدی استانی"),
  T("pnp", "stream", "استریم", { note: "شاخهٔ یک برنامهٔ استانی", avoid: "جریان" }),
  T("pnp", "base PNP", "مسیر پایه (base)", { note: "درخواست کاغذی، خارج از اکسپرس اینتری" }),
  T("pnp", "enhanced PNP", "مسیر هماهنگ با اکسپرس اینتری (enhanced)", { note: "۶۰۰ امتیاز CRS" }),
  T("pnp", "Expression of Interest", "ابراز علاقه‌مندی", { abbr: "EOI" }),
  T("pnp", "Notification of Interest", "اعلان علاقه‌مندی", { abbr: "NOI" }),
  T("pnp", "Alberta Advantage Immigration Program", "برنامه استانی آلبرتا", { abbr: "AAIP" }),
  T("pnp", "British Columbia Provincial Nominee Program", "برنامه استانی بریتیش کلمبیا", { abbr: "BC PNP" }),
  T("pnp", "Ontario Immigrant Nominee Program", "برنامه استانی انتاریو", { abbr: "OINP" }),
  T("pnp", "Manitoba Provincial Nominee Program", "برنامه استانی مانیتوبا", { abbr: "MPNP" }),
  T("pnp", "Saskatchewan Immigrant Nominee Program", "برنامه استانی ساسکاچوان", { abbr: "SINP" }),
  T("pnp", "Nova Scotia Nominee Program", "برنامه استانی نوا اسکوشیا", { abbr: "NSNP" }),
  T("pnp", "New Brunswick Provincial Nominee Program", "برنامه استانی نیوبرانزویک", { abbr: "NBPNP" }),
  T("pnp", "Newfoundland and Labrador Provincial Nominee Program", "برنامه استانی نیوفاندلند و لابرادور", { abbr: "NLPNP" }),
  T("pnp", "Prince Edward Island Provincial Nominee Program", "برنامه استانی جزیره پرنس ادوارد", { abbr: "PEI PNP" }),
  T("pnp", "Yukon Nominee Program", "برنامه استانی یوکان", { abbr: "YNP" }),
  T("pnp", "Northwest Territories Nominee Program", "برنامه استانی قلمروهای شمال غربی", { abbr: "NTNP" }),
  T("pnp", "Skilled Worker stream", "استریم نیروی کار ماهر"),
  T("pnp", "Semi-Skilled Worker stream", "استریم نیروی کار نیمه‌ماهر"),
  T("pnp", "International Graduate stream", "استریم فارغ‌التحصیلان بین‌المللی"),
  T("pnp", "Entrepreneur stream", "استریم کارآفرینان"),
  T("pnp", "Tech Worker stream", "استریم نیروی کار حوزه فناوری", { spoken: "استریم تِک" }),
  T("pnp", "Critical Worker stream", "استریم نیروی کار حیاتی"),
  T("pnp", "Physician stream", "استریم پزشکان"),
  T("pnp", "International Education Stream", "استریم آموزش بین‌المللی"),
  T("pnp", "Skilled Worker Overseas", "نیروی کار ماهر خارج از مانیتوبا"),
  T("pnp", "Human Capital", "سرمایه انسانی", { note: "شاخهٔ سرمایه انسانی انتاریو" }),
  T("pnp", "Employer Job Offer", "پیشنهاد شغلی کارفرما", { note: "شاخهٔ انتاریو" }),
  T("pnp", "Masters Graduate stream", "استریم فارغ‌التحصیلان کارشناسی ارشد"),
  T("pnp", "PhD Graduate stream", "استریم فارغ‌التحصیلان دکتری"),
  T("pnp", "International Post-Graduate stream", "استریم تحصیلات تکمیلی بین‌المللی"),
  T("pnp", "connection to the province", "ارتباط با استان"),
  T("pnp", "statement of intent", "بیانیه قصد"),
  T("pnp", "statement of commitment", "بیانیه تعهد"),

  // provinces and territories
  T("provinces", "province", "استان", { avoid: "ایالت" }),
  T("provinces", "territory", "قلمرو", { avoid: "منطقه" }),
  T("provinces", "Alberta", "آلبرتا"),
  T("provinces", "British Columbia", "بریتیش کلمبیا", { abbr: "BC" }),
  T("provinces", "Manitoba", "مانیتوبا"),
  T("provinces", "New Brunswick", "نیوبرانزویک"),
  T("provinces", "Newfoundland and Labrador", "نیوفاندلند و لابرادور"),
  T("provinces", "Nova Scotia", "نوا اسکوشیا"),
  T("provinces", "Ontario", "انتاریو", { avoid: "اونتاریو" }),
  T("provinces", "Prince Edward Island", "جزیره پرنس ادوارد", { abbr: "PEI" }),
  T("provinces", "Quebec", "کبک"),
  T("provinces", "Saskatchewan", "ساسکاچوان"),
  T("provinces", "Northwest Territories", "قلمروهای شمال غربی"),
  T("provinces", "Yukon", "یوکان"),
  T("provinces", "Nunavut", "نوناووت"),
  T("provinces", "Atlantic provinces", "استان‌های آتلانتیک"),
  T("provinces", "Toronto", "تورنتو"),
  T("provinces", "Vancouver", "ونکوور"),
  T("provinces", "Montreal", "مونترال"),
  T("provinces", "Calgary", "کلگری"),
  T("provinces", "Ottawa", "اتاوا"),

  // work
  T("work", "work permit", "اجازه کار", { avoid: "مجوز کار، ورک پرمیت، ویزای کار" }),
  T("work", "open work permit", "اجازه کار آزاد", { abbr: "OWP", avoid: "اپن ورک پرمیت، اجازه کار باز" }),
  T("work", "employer-specific work permit", "اجازه کار بسته", { note: "مخصوص یک کارفرما", avoid: "اجازه کار اختصاصی" }),
  T("work", "Post-Graduation Work Permit", "اجازه کار پس از تحصیل", { abbr: "PGWP", avoid: "مجوز کار پس از فارغ‌التحصیلی، پی‌جی‌دبلیوپی" }),
  T("work", "Spousal Open Work Permit", "اجازه کار آزاد همسر", { abbr: "SOWP" }),
  T("work", "Bridging Open Work Permit", "اجازه کار پل", { abbr: "BOWP" }),
  T("work", "Iranian Open Work Permit", "اجازه کار آزاد ایرانیان", { avoid: "اپن ورک پرمیت ایرانیان" }),
  T("work", "job offer", "پیشنهاد شغلی", { spoken: "جاب‌آفر", avoid: "پیشنهاد کار، آفر کاری" }),
  T("work", "arranged employment", "پیشنهاد استخدام سازماندهی‌شده"),
  T("work", "Labour Market Impact Assessment", "ارزیابی تأثیر بازار کار", { abbr: "LMIA", spoken: "ال‌ام‌آی‌ای" }),
  T("work", "LMIA-exempt", "معاف از LMIA"),
  T("work", "Temporary Foreign Worker Program", "برنامه نیروی کار خارجی موقت", { abbr: "TFWP" }),
  T("work", "International Mobility Program", "برنامه تحرک بین‌المللی", { abbr: "IMP" }),
  T("work", "Intra-Company Transfer", "انتقال درون‌شرکتی", { abbr: "ICT" }),
  T("work", "National Occupational Classification", "سیستم طبقه‌بندی مشاغل کانادا", { abbr: "NOC", spoken: "ناک" }),
  T("work", "NOC code", "کد ناک"),
  T("work", "TEER", "سطح TEER", { abbr: "TEER", note: "سطح‌های ۰ تا ۵ در NOC" }),
  T("work", "skilled worker", "نیروی کار ماهر", { avoid: "کارگر ماهر، اسکیل ورکر" }),
  T("work", "semi-skilled worker", "نیروی کار نیمه‌ماهر"),
  T("work", "temporary foreign worker", "نیروی کار خارجی موقت"),
  T("work", "work experience", "سابقه کار", { avoid: "تجربه کاری" }),
  T("work", "Canadian work experience", "سابقه کار کانادایی"),
  T("work", "full-time", "تمام‌وقت"),
  T("work", "part-time", "پاره‌وقت", { avoid: "نیمه‌وقت" }),
  T("work", "employer", "کارفرما"),
  T("work", "designated employer", "کارفرمای تأییدشده"),
  T("work", "in-demand occupations", "مشاغل مورد تقاضا"),
  T("work", "labour shortage", "کمبود نیروی کار"),
  T("work", "construction workers", "کارگران ساختمانی"),
  T("work", "reference letter", "نامه سابقه کار", { note: "نامهٔ کارفرما", avoid: "نامه مرجع" }),
  T("work", "pay stub", "فیش حقوقی"),

  // study
  T("study", "study permit", "اجازه تحصیل", { avoid: "مجوز تحصیل، استادی پرمیت، ویزای تحصیلی (برای خود اجازه)" }),
  T("study", "Designated Learning Institution", "مؤسسه آموزشی تعیین‌شده", { abbr: "DLI" }),
  T("study", "Letter of Acceptance", "نامه پذیرش", { abbr: "LOA" }),
  T("study", "Provincial Attestation Letter", "نامه تأییدیه استانی", { abbr: "PAL", note: "TAL برای قلمروها" }),
  T("study", "international student", "دانشجوی بین‌المللی", { avoid: "دانشجوی خارجی" }),
  T("study", "study permit cap", "سقف اجازه تحصیل"),
  T("study", "public DLI", "دانشگاه دولتی"),
  T("study", "tuition", "شهریه"),
  T("study", "scholarship", "بورسیه"),
  T("study", "full funding", "فول فاند"),
  T("study", "GPA", "معدل", { abbr: "GPA" }),
  T("study", "transcripts", "ریزنمرات"),
  T("study", "custodian", "سرپرست", { note: "ویزای گاردین برای همراه دانش‌آموز زیر ۱۸ سال" }),
  T("study", "co-op", "کارآموزی", { abbr: "co-op" }),
  T("study", "diploma", "دیپلم"),
  T("study", "college", "کالج"),
  T("study", "bachelor's", "کارشناسی", { avoid: "لیسانس" }),
  T("study", "master's", "کارشناسی ارشد", { avoid: "فوق لیسانس" }),
  T("study", "PhD", "دکتری", { avoid: "دکترا" }),
  T("study", "dual intent", "نیت دوگانه"),
  T("study", "off-campus work", "کار پاره‌وقت حین تحصیل"),

  // family
  T("family", "family sponsorship", "اسپانسرشیپ خانوادگی", { avoid: "حمایت خانوادگی، کفالت" }),
  T("family", "spousal sponsorship", "اسپانسرشیپ همسر"),
  T("family", "sponsor", "اسپانسر", { avoid: "حامی، کفیل" }),
  T("family", "sponsored person", "اسپانسرشونده"),
  T("family", "spouse", "همسر"),
  T("family", "common-law partner", "شریک زندگی عرفی"),
  T("family", "conjugal partner", "شریک زندگی زناشویی"),
  T("family", "dependent child", "فرزند وابسته"),
  T("family", "parents and grandparents", "والدین و پدربزرگ و مادربزرگ", { abbr: "PGP" }),
  T("family", "undertaking", "تعهد مالی", { note: "تعهد اسپانسر" }),
  T("family", "genuine relationship", "رابطه واقعی"),
  T("family", "inland sponsorship", "اسپانسرشیپ از داخل کانادا", { spoken: "اینلند" }),
  T("family", "outland sponsorship", "اسپانسرشیپ از خارج کانادا", { spoken: "اوت‌لند" }),
  T("family", "marriage certificate", "سند ازدواج"),

  // business
  T("business", "business immigration", "مهاجرت تجاری"),
  T("business", "Start-up Visa", "ویزای استارتاپ", { abbr: "SUV", avoid: "استارتاپ ویزا" }),
  T("business", "designated organization", "سازمان تعیین‌شده"),
  T("business", "letter of support", "نامه حمایت", { avoid: "نامه ساپورت" }),
  T("business", "commitment certificate", "گواهی تعهد"),
  T("business", "Self-employed Persons Program", "برنامه خوداشتغالی فدرال", { avoid: "ویزای خود اشتغالی" }),
  T("business", "self-employed", "خوداشتغال"),
  T("business", "entrepreneur", "کارآفرین"),
  T("business", "entrepreneur program", "برنامه کارآفرینی", { avoid: "ویزای کارآفرینی" }),
  T("business", "investment", "سرمایه‌گذاری"),
  T("business", "company registration", "ثبت شرکت"),
  T("business", "venture capital fund", "صندوق سرمایه‌گذاری خطرپذیر"),
  T("business", "angel investor group", "گروه سرمایه‌گذار فرشته"),
  T("business", "business incubator", "انکوباتور کسب‌وکار"),
  T("business", "net worth", "ارزش خالص دارایی"),

  // language
  T("language", "language test", "آزمون زبان"),
  T("language", "IELTS General Training", "آیلتس جنرال", { abbr: "IELTS" }),
  T("language", "CELPIP", "سلپیپ", { abbr: "CELPIP" }),
  T("language", "PTE Core", "PTE Core", { abbr: "PTE" }),
  T("language", "TEF Canada", "TEF Canada"),
  T("language", "TCF Canada", "TCF Canada"),
  T("language", "Canadian Language Benchmark", "سطح CLB", { abbr: "CLB" }),
  T("language", "official languages", "زبان‌های رسمی"),
  T("language", "Francophone", "فرانسوی‌زبان"),
  T("language", "four skills", "مهارت‌های چهارگانه", { note: "خواندن، نوشتن، شنیدن، صحبت کردن" }),

  // documents
  T("documents", "Educational Credential Assessment", "ارزیابی مدرک تحصیلی", { abbr: "ECA", avoid: "ارزیابی اعتبار آموزشی" }),
  T("documents", "World Education Services", "سازمان WES", { abbr: "WES" }),
  T("documents", "biometrics", "بیومتریک", { note: "انگشت‌نگاری" }),
  T("documents", "medical exam", "معاینه پزشکی"),
  T("documents", "police certificate", "گواهی عدم سوءپیشینه", { avoid: "گواهی ترخیص پلیس" }),
  T("documents", "proof of funds", "اثبات تمکن مالی", { avoid: "اثبات وجوه" }),
  T("documents", "settlement funds", "تمکن مالی"),
  T("documents", "passport", "پاسپورت", { avoid: "گذرنامه" }),
  T("documents", "travel document", "مدرک سفر"),
  T("documents", "birth certificate", "شناسنامه"),
  T("documents", "military service certificate", "گواهی پایان خدمت سربازی"),
  T("documents", "certified translation", "ترجمه رسمی"),
  T("documents", "settlement plan", "برنامه اسکان"),

  // process
  T("process", "application", "درخواست", { avoid: "اپلیکیشن" }),
  T("process", "applicant", "متقاضی", { avoid: "درخواست‌کننده" }),
  T("process", "apply", "اقدام کردن"),
  T("process", "eligible", "واجد شرایط"),
  T("process", "requirements", "شرایط"),
  T("process", "processing time", "زمان پردازش", { avoid: "زمان بررسی، پراسسینگ تایم" }),
  T("process", "application fee", "هزینه درخواست"),
  T("process", "Right of Permanent Residence Fee", "هزینه حق اقامت دائم", { abbr: "RPRF" }),
  T("process", "government fees", "هزینه‌های دولتی"),
  T("process", "processing fee", "هزینه پردازش"),
  T("process", "online account", "حساب کاربری آنلاین"),
  T("process", "PR portal", "پورتال اقامت دائم"),
  T("process", "paper-based application", "درخواست کاغذی"),
  T("process", "online application", "درخواست آنلاین"),
  T("process", "Acknowledgement of Receipt", "تأییدیه دریافت پرونده", { abbr: "AOR" }),
  T("process", "refusal", "رد درخواست", { avoid: "ریجکت" }),
  T("process", "approval", "تأیید درخواست", { avoid: "اپروال" }),
  T("process", "renewal", "تمدید"),
  T("process", "extension", "تمدید"),
  T("process", "change of status", "تغییر وضعیت اقامت"),
  T("process", "valid", "معتبر"),
  T("process", "expired", "منقضی‌شده"),
  T("process", "removal order", "دستور اخراج"),
  T("process", "deportation", "اخراج از کانادا", { avoid: "دیپورت" }),
  T("process", "inadmissibility", "ممنوعیت ورود"),
  T("process", "misrepresentation", "ارائه اطلاعات نادرست"),
  T("process", "criminal record", "سابقه کیفری"),
  T("process", "security screening", "بررسی امنیتی"),
  T("process", "health care", "خدمات درمانی"),
  T("process", "public health insurance", "بیمه سلامت عمومی"),
  T("process", "social assistance", "کمک‌های اجتماعی"),
  T("process", "social benefits", "مزایای اجتماعی"),
  T("process", "Charter of Rights and Freedoms", "منشور حقوق و آزادی‌ها"),
  T("process", "refugee", "پناهنده"),
  T("process", "refugee protection", "حمایت پناهندگی"),
  T("process", "asylum claim", "درخواست پناهندگی"),
  T("process", "Interim Federal Health Program", "برنامه بیمه سلامت موقت فدرال", { abbr: "IFHP" }),

  // institutions
  T("institutions", "Immigration, Refugees and Citizenship Canada", "اداره مهاجرت کانادا", { abbr: "IRCC", note: "نام کامل: اداره مهاجرت، پناهندگی و شهروندی کانادا", avoid: "سازمان مهاجرت، وزارت مهاجرت" }),
  T("institutions", "Canada Border Services Agency", "آژانس خدمات مرزی کانادا", { abbr: "CBSA" }),
  T("institutions", "Employment and Social Development Canada", "وزارت اشتغال و توسعه اجتماعی کانادا", { abbr: "ESDC" }),
  T("institutions", "Statistics Canada", "اداره آمار کانادا"),
  T("institutions", "federal government", "دولت فدرال"),
  T("institutions", "provincial government", "دولت استانی"),
  T("institutions", "immigration officer", "افسر مهاجرت", { avoid: "آفیسر" }),
  T("institutions", "Regulated Canadian Immigration Consultant", "مشاور رسمی مهاجرت", { abbr: "RCIC" }),
  T("institutions", "immigration lawyer", "وکیل مهاجرت"),
  T("institutions", "immigration consultant", "مشاور مهاجرت"),
  T("institutions", "settlement agencies", "آژانس‌های اسکان"),

  // legal
  T("legal", "Federal Court", "دادگاه فدرال کانادا"),
  T("legal", "judicial review", "بازنگری قضایی"),
  T("legal", "mandamus", "دستور الزام"),
  T("legal", "procedural fairness", "انصاف رویه‌ای"),
  T("legal", "Canada Gazette", "روزنامه رسمی کانادا"),
  T("legal", "ruling", "رأی دادگاه", { avoid: "حکم" }),
  T("legal", "allowed", "پذیرفته شد", { note: "نتیجهٔ یک پرونده" }),
  T("legal", "dismissed", "رد شد", { note: "نتیجهٔ یک پرونده" }),

  // europe
  T("europe", "Opportunity Card", "کارت فرصت آلمان", { abbr: "Chancenkarte" }),
  T("europe", "EU Blue Card", "بلوکارت اروپا"),
  T("europe", "Schengen", "شینگن"),
  T("europe", "residence permit", "اجازه اقامت", { avoid: "مجوز اقامت" }),

  // general
  T("general", "immigration", "مهاجرت"),
  T("general", "immigration programme", "برنامه مهاجرتی"),
  T("general", "Canadian dollar", "دلار کانادا", { abbr: "CAD" }),
  T("general", "cost of living", "هزینه زندگی"),
  T("general", "multicultural", "چندفرهنگی"),
];

// ---- rows → entries ------------------------------------------------------------------------

export function keyOf(en) {
  return String(en || "").trim().toLowerCase().replace(/\s+/g, " ");
}

const OFF = new Set(["no", "off", "0", "false", "خیر", "نه", "غیرفعال"]);

export function cleanEntry(row) {
  if (!row || typeof row !== "object") return null;
  const s = (k) => String(row[k] == null ? "" : row[k]).trim();
  const en = s("en");
  const fa = s("fa");
  if (!en || !fa) return null;
  return {
    en: en.slice(0, 120),
    abbr: s("abbr").slice(0, 40),
    fa: fa.slice(0, 160),
    spoken: s("spoken").slice(0, 120),
    avoid: s("avoid").slice(0, 300),
    group: GROUPS[s("group")] ? s("group") : "general",
    note: s("note").slice(0, 300),
    active: !OFF.has(s("active").toLowerCase()),
  };
}

// ---- loading: the Sheet first, the built-in list as seed and fallback -------------------------

const TTL = 10 * 60 * 1000;
let cache = { at: 0, items: BUILTIN.map(cleanEntry).filter(Boolean), source: "builtin", rows: 0, error: "", seeded: false };
let loading = null;

function sheetUrl() {
  return process.env.SHEET_WEBHOOK_URL;
}
function sheetSecret() {
  return process.env.SHEET_SECRET;
}

async function fetchRows() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${sheetUrl()}?secret=${encodeURIComponent(sheetSecret())}&type=glossary`, { redirect: "follow", signal: ctrl.signal });
    if (!res.ok) throw new Error("sheet GET " + res.status);
    const data = await res.json();
    if (data && data.error) throw new Error(String(data.error));
    if (!data || !Array.isArray(data.items)) throw new Error("old Apps Script (no Glossary tab support; redeploy google-apps-script.gs)");
    return data.items;
  } finally {
    clearTimeout(timer);
  }
}

// Add the built-in terms the tab does not have yet. The script matches on `en`, so the team's
// edited rows are never touched and a row they deleted on purpose comes back only through this.
export async function seedSheet() {
  if (!sheetEnabled()) throw new Error("the Google Sheet is not configured (SHEET_WEBHOOK_URL / SHEET_SECRET)");
  const res = await fetch(sheetUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({ secret: sheetSecret(), glossary_seed: BUILTIN.map((t) => ({ ...t, active: "yes" })) }),
  });
  if (!res.ok) throw new Error("sheet POST " + res.status);
  const out = await res.json();
  if (out && out.error) throw new Error(String(out.error));
  cache.at = 0;
  return out;
}

async function load() {
  if (!sheetEnabled()) {
    cache = { ...cache, at: Date.now(), source: "builtin", rows: 0, error: "" };
    return cache;
  }
  try {
    let rows = await fetchRows();
    // An empty tab (first run after the script was deployed) is filled from this file once, so the
    // team finds every term in the Sheet and edits it there.
    if (!rows.length && !cache.seeded) {
      cache.seeded = true;
      await seedSheet().catch((e) => console.log("[glossary] seed failed:", String(e.message || e)));
      rows = await fetchRows().catch(() => []);
    }
    const items = rows.map(cleanEntry).filter(Boolean);
    const seen = new Set();
    const active = items.filter((t) => {
      const k = keyOf(t.en);
      if (!t.active || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    if (active.length) cache = { ...cache, at: Date.now(), items: active, source: "sheet", rows: items.length, error: "" };
    else cache = { ...cache, at: Date.now(), items: BUILTIN.map(cleanEntry).filter(Boolean), source: "builtin", rows: items.length, error: items.length ? "every row is switched off" : "the Glossary tab is empty" };
  } catch (e) {
    // A Sheet that cannot be read never stops the content from being written: the last good list
    // (or the built-in one) stays, and the error shows on /api/status and /api/glossary.
    cache = { ...cache, at: Date.now(), error: String(e.message || e) };
    console.log("[glossary] sheet unreadable:", cache.error);
  }
  return cache;
}

export async function loadGlossary({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < TTL) return cache.items;
  if (!loading) loading = load().then(shareWithWorker).finally(() => (loading = null));
  await loading;
  return cache.items;
}

// The video-editing worker (english-sugimotovisa: subtitles, motion graphics) reads its state from
// the editing-data branch, so the glossary is kept there too, as glossary/terms.json, rewritten
// only when the terms change. Best effort: a store that is off or refuses never costs a piece of
// content.
let shared = "";
async function shareWithWorker() {
  try {
    const store = await import("./editing/store.js");
    if (!store.storeConfigured()) return;
    const items = cache.items.map((t) => ({ en: t.en, abbr: t.abbr, fa: t.fa, spoken: t.spoken, avoid: t.avoid, group: t.group, note: t.note }));
    const hash = (await import("node:crypto")).createHash("sha1").update(JSON.stringify(items)).digest("hex");
    if (hash === shared) return;
    const cur = await store.get("glossary/terms.json").catch(() => null);
    if (cur && cur.data && cur.data.hash === hash) {
      shared = hash;
      return;
    }
    await store.put("glossary/terms.json", { hash, source: cache.source, at: new Date().toISOString(), rules: { fa: RULE_FA, en: RULE_EN }, items }, cur ? cur.sha : null, "app: glossary " + hash.slice(0, 7));
    shared = hash;
  } catch (e) {
    console.log("[glossary] not shared with the worker:", String(e.message || e));
  }
}

// What is in use right now, without waiting: the last loaded list, else the built-in one.
export function glossarySync() {
  return cache.items;
}

export function glossaryStatus() {
  return { source: cache.source, terms: cache.items.length, rows: cache.rows, error: cache.error, loaded_at: cache.at ? new Date(cache.at).toISOString() : "", sheet: sheetEnabled() };
}

// ---- the block that goes into the prompts ----------------------------------------------------

function line(t) {
  const head = t.abbr && !t.fa.includes(t.abbr) ? `${t.en} (${t.abbr})` : t.en;
  let s = `${head} → ${t.fa}`;
  if (t.spoken) s += ` · گفتاری: ${t.spoken}`;
  if (t.avoid) s += ` · نه: ${t.avoid}`;
  if (t.note) s += ` [${t.note}]`;
  return s;
}

export function formatGlossary(items, lang = "fa") {
  const list = (items || []).filter(Boolean);
  if (lang === "en") {
    // English output needs the official names and their acronyms, not the Persian column.
    const named = list.filter((t) => t.abbr && t.abbr !== t.en);
    return named.map((t) => `${t.en} (${t.abbr})`).join(" · ");
  }
  const byGroup = new Map();
  for (const t of list) (byGroup.get(t.group) || byGroup.set(t.group, []).get(t.group)).push(t);
  const out = [];
  for (const [g, terms] of byGroup) out.push(`— ${(GROUPS[g] || GROUPS.general)[0]} —\n${terms.map(line).join("\n")}`);
  return out.join("\n");
}

const RULE_FA = `واژه‌نامهٔ سوگیموتو ویزا (الزامی در تمام متن فارسی، در همهٔ بخش‌ها: سناریو، پست، مقاله، کاروسل، استوری، زیرنویس، موشن‌گرافیک): هر اصطلاح مهاجرتی همیشه با همین نام فارسی نوشته می‌شود و نه هیچ معادل دیگری. بار اول، نام یا مخفف انگلیسی داخل پرانتز می‌آید (اگر مردم اصطلاح را با آن می‌شناسند)، بعد از آن فقط نام فارسی. هرگز مخفف انگلیسیِ خالی به‌جای نام فارسی نیاید. فرم‌های بعد از «نه:» هرگز به کار نرود. «گفتاری:» فرم کوتاهی است که در محتوای گفتاری (سناریو، پست تلگرام) بعد از اولین ذکر کامل مجاز است. اصطلاحی که در فهرست نیست: اول واژهٔ فارسی، بعد انگلیسی داخل پرانتز، فقط یک بار. اسم افراد و پرونده‌ها همان‌طور که هست می‌ماند. این فهرست منبع هیچ فکتی نیست؛ فقط نام‌هاست.`;

const RULE_EN = `GLOSSARY (required in all English text): name programmes, permits, documents and institutions with their official English names below, the acronym in parentheses on first mention and the acronym alone afterwards. Never a bare acronym the first time, never an invented or shortened name. This list is a source of names only, never of facts.`;

export async function glossaryBlock(lang = "fa") {
  const items = await loadGlossary().catch(() => glossarySync());
  const body = formatGlossary(items, lang);
  if (!body) return "";
  return lang === "en" ? `\n\n${RULE_EN}\n${body}\n` : `\n\n${RULE_FA}\n${body}\n`;
}
