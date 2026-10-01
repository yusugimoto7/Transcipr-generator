/**
 * The client questionnaire: the firm's Form 124 (Personal Profile) and Form
 * 128 (Background Information) as one page the client fills in, in Persian
 * (default) or English. Each family member gets their own page.
 *
 * What the platform already knows (from the documents and the intake) is
 * filled in before the client opens it (`prefill`); the client completes the
 * rest, confirms that everything is true and submits. The team then reviews
 * the answers and accepts them into the intake (`toIntake`) — answers with no
 * place in the intake (bank accounts, property, parents' health …) stay with
 * the questionnaire for the team and the letters.
 *
 * Pure: used by the client page, the staff review panel and the API.
 */

import { filledRows } from './schema';

const o = (v, fa, en = v) => ({ v, fa, en });
const YESNO = [o(true, 'بله', 'Yes'), o(false, 'خیر', 'No')];
const MARITAL = [
  o('Never Married / Single', 'مجرد', 'Single'),
  o('Married', 'متأهل', 'Married'),
  o('Common-Law', 'زندگی مشترک بدون ازدواج رسمی', 'Common-law'),
  o('Divorced', 'مطلقه', 'Divorced'),
  o('Separated', 'جدا شده', 'Separated'),
  o('Widowed', 'همسر فوت شده', 'Widowed'),
];
const MARITAL_PERSON = [
  o('Single', 'مجرد', 'Single'),
  o('Married', 'متأهل', 'Married'),
  o('Divorced', 'مطلقه', 'Divorced'),
  o('Widowed', 'همسر فوت شده', 'Widowed'),
];
const EDU_LEVELS = [
  o('High school', 'دبیرستان', 'High school'),
  o('Pre-university', 'پیش‌دانشگاهی', 'Pre-university'),
  o('Vocational', 'فنی و حرفه‌ای', 'Vocational / trade'),
  o('Associate', 'کاردانی', 'Associate degree'),
  o('Bachelor', 'کارشناسی', "Bachelor's degree"),
  o('Master', 'کارشناسی ارشد', "Master's degree"),
  o('PhD', 'دکترا', 'Doctorate (PhD)'),
  o('Professional', 'دکترای حرفه‌ای (پزشکی، دندانپزشکی…)', 'Professional degree (medicine, dentistry…)'),
];
const PURPOSE = [
  o('Tourism', 'گردشگری', 'Tourism'),
  o('Family visit', 'دیدار خانواده', 'Family visit'),
  o('Business', 'کاری / تجاری', 'Business'),
  o('Study', 'تحصیل', 'Study'),
  o('Work', 'کار', 'Work'),
  o('Medical', 'درمان', 'Medical'),
  o('Transit', 'ترانزیت', 'Transit'),
  o('Other', 'سایر', 'Other'),
];
const VISA_KIND = [
  o('Visitor visa', 'ویزای توریستی / دیدار', 'Visitor visa'),
  o('Study permit', 'ویزای تحصیلی', 'Study permit'),
  o('Work permit', 'ویزای کاری', 'Work permit'),
  o('Permanent residence', 'اقامت دائم', 'Permanent residence'),
  o('Other', 'سایر', 'Other'),
];
const LANG_TEST = [o('IELTS', 'آیلتس', 'IELTS'), o('TOEFL', 'تافل', 'TOEFL'), o('PTE', 'PTE'), o('CELPIP', 'CELPIP'), o('TEF/TCF (French)', 'آزمون فرانسه (TEF/TCF)', 'French (TEF/TCF)'), o('Duolingo', 'دولینگو', 'Duolingo')];

/* Field helpers. `en: true` = answer in English (Latin letters) only. */
const q = (id, fa, en, type = 'text', extra = {}) => ({ id, fa, en, type, ...extra });
const nameEn = (id, fa = 'نام و نام خانوادگی به انگلیسی (مطابق پاسپورت)', en = 'Full name in English (as in the passport)') => q(id, fa, en, 'text', { latin: true });
const nameFa = (id) => q(id, 'نام و نام خانوادگی به فارسی', 'Full name in Persian', 'text');

/** Person-in-the-family columns (children, siblings). */
const PERSON_COLS = [
  q('nameEn', 'نام و نام خانوادگی به انگلیسی', 'Full name in English', 'text', { latin: true, required: true }),
  q('nameFa', 'نام و نام خانوادگی به فارسی', 'Full name in Persian'),
  q('sex', 'جنسیت', 'Sex', 'select', { options: [o('M', 'مرد', 'Male'), o('F', 'زن', 'Female')] }),
  q('dob', 'تاریخ تولد (میلادی)', 'Date of birth', 'date', { required: true }),
  q('birthCountry', 'کشور محل تولد', 'Country of birth', 'text', { latin: true }),
  q('birthCity', 'شهر محل تولد', 'City of birth', 'text', { latin: true }),
  q('occupation', 'شغل (عنوان دقیق، به انگلیسی)', 'Occupation (exact title, in English)', 'text', { latin: true }),
  q('marital', 'وضعیت تأهل', 'Marital status', 'select', { options: MARITAL_PERSON }),
  q('address', 'آدرس منزل با کدپستی — در صورت فوت: شهر و تاریخ فوت (به انگلیسی)', 'Home address with postal code — if deceased: city and date of death (in English)', 'text', { latin: true, wide: true }),
];

/**
 * The questionnaire, section by section. `show(answers)` hides a question or a
 * section that does not apply; `required` questions must be answered before
 * submitting.
 */
export const CLIENT_SECTIONS = [
  {
    id: 'applicant',
    fa: 'مشخصات متقاضی',
    en: 'Your details',
    fields: [
      q('givenName', 'نام به انگلیسی (مطابق پاسپورت)', 'Given name(s) (as in the passport)', 'text', { latin: true, required: true }),
      q('familyName', 'نام خانوادگی به انگلیسی (مطابق پاسپورت)', 'Family name (as in the passport)', 'text', { latin: true, required: true }),
      nameFa('nameFa'),
      q('dob', 'تاریخ تولد (میلادی)', 'Date of birth', 'date', { required: true }),
      q('birthCountry', 'کشور محل تولد', 'Country of birth', 'text', { latin: true, required: true }),
      q('birthCity', 'شهر محل تولد (به انگلیسی، مطابق پاسپورت)', 'City of birth (in English, as in the passport)', 'text', { latin: true, required: true }),
      q('email', 'آدرس ایمیل', 'Email address', 'email', { required: true }),
      q('mobile', 'شماره موبایل (با کد کشور، مثلاً +98 912 …)', 'Mobile number (with country code, e.g. +98 912 …)', 'tel', { required: true }),
      q('landline', 'شماره ثابت', 'Landline number', 'tel'),
      q('addressStreet', 'آدرس منزل به انگلیسی (خیابان، پلاک، واحد)', 'Home address in English (street, number, unit)', 'text', { latin: true, required: true, wide: true }),
      q('addressCity', 'شهر', 'City', 'text', { latin: true, required: true }),
      q('addressProvince', 'استان', 'Province', 'text', { latin: true }),
      q('addressPostal', 'کد پستی', 'Postal code', 'text', { required: true }),
      q('addressCountry', 'کشور', 'Country', 'text', { latin: true, required: true }),
      q('addressFa', 'آدرس منزل به فارسی', 'Home address in Persian', 'text', { wide: true }),
      q('nameChange', 'اگر نام یا نام خانوادگی شما تغییر کرده (صفحه سوم شناسنامه)، نام قبلی و توضیح', 'Any change of name or family name (page 3 of the birth certificate): the earlier name and an explanation', 'textarea'),
    ],
  },
  {
    id: 'passport',
    fa: 'پاسپورت و کارت ملی',
    en: 'Passport and national ID',
    fields: [
      q('passportNumber', 'شماره پاسپورت', 'Passport number', 'text', { latin: true, required: true }),
      q('passportIssue', 'تاریخ صدور پاسپورت (میلادی)', 'Passport issue date', 'date', { required: true }),
      q('passportExpiry', 'تاریخ انقضای پاسپورت (میلادی)', 'Passport expiry date', 'date', { required: true }),
      q('passportCountry', 'کشور صادرکننده', 'Issuing country', 'text', { latin: true, required: true }),
      q('nationalIdNumber', 'شماره ملی', 'National ID number', 'text'),
      q('nationalIdIssue', 'تاریخ صدور کارت ملی (میلادی)', 'National ID issue date', 'date'),
      q('nationalIdExpiry', 'تاریخ انقضای کارت ملی (میلادی)', 'National ID expiry date', 'date'),
    ],
  },
  {
    id: 'companions',
    fa: 'همراهان',
    en: 'People applying with you',
    help: { fa: 'همسر، فرزندان یا دیگرانی که با شما همراه هستند.', en: 'Your spouse, children or others travelling with you.' },
    fields: [
      q('companions', 'همراهان', 'Companions', 'rows', {
        add: { fa: 'افزودن همراه', en: 'Add a companion' },
        columns: [
          q('nameEn', 'نام و نام خانوادگی به انگلیسی', 'Full name in English', 'text', { latin: true, required: true }),
          q('nameFa', 'نام و نام خانوادگی به فارسی', 'Full name in Persian'),
          q('relationship', 'نسبت با شما', 'Relationship to you', 'text', { required: true }),
          q('dob', 'تاریخ تولد (میلادی)', 'Date of birth', 'date'),
          q('applyingTogether', 'همزمان با شما اقدام می‌کند؟', 'Applying at the same time as you?', 'yesno'),
        ],
      }),
    ],
  },
  {
    id: 'parents',
    fa: 'مشخصات پدر و مادر',
    en: 'Your parents',
    fields: [
      nameEn('motherNameEn', 'نام و نام خانوادگی مادر به انگلیسی', "Mother's full name in English"),
      q('motherNameFa', 'نام و نام خانوادگی مادر به فارسی', "Mother's full name in Persian"),
      q('motherMarital', 'وضعیت تأهل مادر', "Mother's marital status", 'select', { options: MARITAL_PERSON }),
      q('motherOccupation', 'شغل مادر (به انگلیسی)', "Mother's occupation (in English)", 'text', { latin: true }),
      q('motherBirthCountry', 'کشور محل تولد مادر', "Mother's country of birth", 'text', { latin: true }),
      q('motherBirthCity', 'شهر محل تولد مادر', "Mother's city of birth", 'text', { latin: true }),
      q('motherDob', 'تاریخ تولد مادر (میلادی)', "Mother's date of birth", 'date'),
      q('motherAddress', 'آدرس مادر با کدپستی — در صورت فوت: شهر و تاریخ فوت (به انگلیسی)', "Mother's address — if deceased: city and date of death (in English)", 'text', { latin: true, wide: true }),
      nameEn('fatherNameEn', 'نام و نام خانوادگی پدر به انگلیسی', "Father's full name in English"),
      q('fatherNameFa', 'نام و نام خانوادگی پدر به فارسی', "Father's full name in Persian"),
      q('fatherMarital', 'وضعیت تأهل پدر', "Father's marital status", 'select', { options: MARITAL_PERSON }),
      q('fatherOccupation', 'شغل پدر (به انگلیسی)', "Father's occupation (in English)", 'text', { latin: true }),
      q('fatherBirthCountry', 'کشور محل تولد پدر', "Father's country of birth", 'text', { latin: true }),
      q('fatherBirthCity', 'شهر محل تولد پدر', "Father's city of birth", 'text', { latin: true }),
      q('fatherDob', 'تاریخ تولد پدر (میلادی)', "Father's date of birth", 'date'),
      q('fatherAddress', 'آدرس پدر با کدپستی — در صورت فوت: شهر و تاریخ فوت (به انگلیسی)', "Father's address — if deceased: city and date of death (in English)", 'text', { latin: true, wide: true }),
    ],
  },
  {
    id: 'spouse',
    fa: 'وضعیت تأهل و همسر',
    en: 'Marital status and spouse',
    fields: [
      q('marital', 'وضعیت تأهل شما', 'Your marital status', 'select', { options: MARITAL, required: true }),
      ...[
        q('spouseGivenName', 'نام همسر به انگلیسی (مطابق پاسپورت)', "Spouse's given name(s) (as in the passport)", 'text', { latin: true, required: true }),
        q('spouseFamilyName', 'نام خانوادگی همسر به انگلیسی', "Spouse's family name", 'text', { latin: true, required: true }),
        q('spouseNameFa', 'نام و نام خانوادگی همسر به فارسی', "Spouse's full name in Persian"),
        q('spouseOccupation', 'شغل همسر (به انگلیسی)', "Spouse's occupation (in English)", 'text', { latin: true }),
        q('spouseBirthCountry', 'کشور محل تولد همسر', "Spouse's country of birth", 'text', { latin: true }),
        q('spouseBirthCity', 'شهر محل تولد همسر', "Spouse's city of birth", 'text', { latin: true }),
        q('spouseDob', 'تاریخ تولد همسر (میلادی)', "Spouse's date of birth", 'date', { required: true }),
        q('marriageDate', 'تاریخ ازدواج (میلادی)', 'Date of marriage', 'date', { required: true }),
        q('spouseAddress', 'آدرس منزل همسر (به انگلیسی)', "Spouse's home address (in English)", 'text', { latin: true, wide: true }),
        q('spouseLanguage', 'آیا همسر به زبان انگلیسی یا فرانسه تسلط دارد؟', 'Does your spouse speak English or French?', 'yesno'),
        q('spouseLanguageTest', 'آیا همسر در آزمون زبان شرکت کرده است؟ (نوع و نمره)', 'Has your spouse taken a language test? (which, score)', 'text'),
      ].map((f) => ({ ...f, show: (a) => ['Married', 'Common-Law'].includes(a.marital) })),
      q('previouslyMarried', 'آیا قبلاً ازدواج کرده‌اید (یا زندگی مشترک داشته‌اید)؟', 'Have you been married (or in a common-law relationship) before?', 'yesno', { required: true }),
      ...[
        q('prevSpouseGivenName', 'نام همسر قبلی به انگلیسی', "Previous spouse's given name(s)", 'text', { latin: true, required: true }),
        q('prevSpouseFamilyName', 'نام خانوادگی همسر قبلی به انگلیسی', "Previous spouse's family name", 'text', { latin: true, required: true }),
        q('prevSpouseNameFa', 'نام و نام خانوادگی همسر قبلی به فارسی', "Previous spouse's full name in Persian"),
        q('prevSpouseOccupation', 'شغل همسر قبلی', "Previous spouse's occupation", 'text', { latin: true }),
        q('prevSpouseBirthPlace', 'کشور و شهر محل تولد همسر قبلی', "Previous spouse's country and city of birth", 'text', { latin: true }),
        q('prevSpouseDob', 'تاریخ تولد همسر قبلی (میلادی)', "Previous spouse's date of birth", 'date'),
        q('prevMarriageDate', 'تاریخ ازدواج قبلی (میلادی)', 'Date of the previous marriage', 'date', { required: true }),
        q('prevDivorceDate', 'تاریخ طلاق / پایان (میلادی)', 'Date of divorce / end', 'date', { required: true }),
        q('prevSpouseAddress', 'آدرس همسر قبلی — در صورت فوت: شهر و تاریخ فوت', "Previous spouse's address — if deceased: city and date of death", 'text', { latin: true, wide: true }),
      ].map((f) => ({ ...f, show: (a) => a.previouslyMarried === true })),
    ],
  },
  {
    id: 'children',
    fa: 'فرزندان',
    en: 'Your children',
    help: { fa: 'همه فرزندان، از جمله فرزندان بزرگسال یا ناتنی که همراه شما نیستند.', en: 'All your children, including adult or step-children who are not coming with you.' },
    fields: [
      q('hasChildren', 'آیا فرزند دارید؟', 'Do you have children?', 'yesno', { required: true }),
      q('children', 'فرزندان', 'Children', 'rows', {
        show: (a) => a.hasChildren === true,
        add: { fa: 'افزودن فرزند', en: 'Add a child' },
        columns: [...PERSON_COLS, q('languageAbility', 'تسلط به انگلیسی یا فرانسه / آزمون زبان', 'English or French ability / language test', 'text')],
      }),
    ],
  },
  {
    id: 'siblings',
    fa: 'خواهران و برادران',
    en: 'Your brothers and sisters',
    help: { fa: 'به ترتیب سن. اگر ناتنی هستند در توضیحات بنویسید که پدر یا مادر مشترک است.', en: 'By age. For half-siblings, say in the notes which parent you share.' },
    fields: [
      q('hasSiblings', 'آیا خواهر یا برادر دارید؟', 'Do you have brothers or sisters?', 'yesno', { required: true }),
      q('siblings', 'خواهران و برادران', 'Brothers and sisters', 'rows', {
        show: (a) => a.hasSiblings === true,
        add: { fa: 'افزودن خواهر یا برادر', en: 'Add a brother or sister' },
        columns: PERSON_COLS,
      }),
      q('familyNotes', 'توضیحات (خواهر و برادر ناتنی؛ خانواده درجه یک در کانادا)', 'Notes (half-siblings; close family in Canada)', 'textarea'),
    ],
  },
  {
    id: 'education',
    fa: 'سوابق تحصیلی',
    en: 'Education',
    help: { fa: 'همه مقاطع از دبیرستان به بعد، آخرین مقطع اول.', en: 'Every level from high school on, most recent first.' },
    fields: [
      q('education', 'مقاطع تحصیلی', 'Studies', 'rows', {
        required: true,
        add: { fa: 'افزودن مقطع تحصیلی', en: 'Add a level of study' },
        columns: [
          q('level', 'مقطع', 'Level', 'select', { options: EDU_LEVELS, required: true }),
          q('school', 'نام مدرسه / دانشگاه (به انگلیسی)', 'School / university (in English)', 'text', { latin: true, required: true }),
          q('field', 'رشته تحصیلی (به انگلیسی)', 'Field of study (in English)', 'text', { latin: true }),
          q('city', 'شهر', 'City', 'text', { latin: true, required: true }),
          q('country', 'کشور', 'Country', 'text', { latin: true, required: true }),
          q('from', 'شروع (ماه و سال میلادی)', 'From (month and year)', 'month', { required: true, notFuture: true }),
          q('to', 'پایان (ماه و سال میلادی)', 'To (month and year)', 'month', { required: true, notFuture: true }),
          q('address', 'آدرس', 'Address', 'text', { wide: true }),
        ],
      }),
      q('educationNotes', 'توضیحات', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'language',
    fa: 'مدرک زبان',
    en: 'Language test',
    fields: [
      q('hasLanguageTest', 'مدرک زبان دارید؟ (آیلتس، تافل، PTE، فرانسه)', 'Do you have a language test result? (IELTS, TOEFL, PTE, French)', 'yesno', { required: true }),
      ...[
        q('languageTest', 'نوع مدرک', 'Test', 'select', { options: LANG_TEST, required: true }),
        q('languageScore', 'نمره کلی', 'Overall score', 'text', { required: true }),
        q('languageTestDate', 'تاریخ دریافت مدرک (میلادی)', 'Date of the result', 'date', { notFuture: true }),
      ].map((f) => ({ ...f, show: (a) => a.hasLanguageTest === true })),
    ],
  },
  {
    id: 'military',
    fa: 'خدمت سربازی',
    en: 'Military service',
    fields: [
      q('served', 'خدمت سربازی (یا هر خدمت نظامی، انتظامی یا امنیتی) انجام داده‌اید؟', 'Have you done military service (or any military, police or security service)?', 'yesno', { required: true }),
      ...[
        q('serviceFrom', 'شروع خدمت (ماه و سال میلادی)', 'Service from (month and year)', 'month', { required: true, notFuture: true }),
        q('serviceTo', 'پایان خدمت (ماه و سال میلادی)', 'Service to (month and year)', 'month', { required: true, notFuture: true }),
        q('serviceOrg', 'ارگان محل خدمت (به انگلیسی)', 'Organization / unit (in English)', 'text', { latin: true, required: true }),
        q('serviceCity', 'شهر محل خدمت', 'City of service', 'text', { latin: true, required: true }),
      ].map((f) => ({ ...f, show: (a) => a.served === true })),
      q('exemption', 'در صورت معافیت، نوع معافیت', 'If exempted, the type of exemption', 'text', { show: (a) => a.served === false }),
    ],
  },
  {
    id: 'travel',
    fa: 'سوابق سفر',
    en: 'Travel history',
    help: { fa: 'همه سفرهای خارجی ۵ سال گذشته (به جز سفر به ایران)، از آخرین سفر.', en: 'Every trip abroad in the past 5 years (except to Iran), most recent first.' },
    fields: [
      q('travelled', 'در ۵ سال گذشته به کشور دیگری سفر کرده‌اید؟', 'Have you travelled to another country in the past 5 years?', 'yesno', { required: true }),
      q('trips', 'سفرها', 'Trips', 'rows', {
        show: (a) => a.travelled === true,
        add: { fa: 'افزودن سفر', en: 'Add a trip' },
        columns: [
          q('from', 'تاریخ ورود (ماه و سال میلادی)', 'Arrival (month and year)', 'month', { required: true, notFuture: true }),
          q('to', 'تاریخ خروج (ماه و سال میلادی)', 'Departure (month and year)', 'month', { required: true, notFuture: true }),
          q('country', 'کشور مقصد', 'Country', 'text', { latin: true, required: true }),
          q('city', 'شهر مقصد', 'City', 'text', { latin: true, required: true }),
          q('purpose', 'هدف از سفر', 'Purpose', 'select', { options: PURPOSE, required: true }),
        ],
      }),
      q('travelNotes', 'اگر الان در کشور دیگری هستید یا بیش از ۶ ماه در کشوری بوده‌اید، توضیح دهید', 'If you are abroad now, or stayed more than 6 months in a country, explain', 'textarea'),
    ],
  },
  {
    id: 'refusals',
    fa: 'ویزاهای رد شده و پرونده‌های قبلی',
    en: 'Refused visas and earlier applications',
    fields: [
      q('refused', 'آیا تا به حال ویزای شما (از هر کشوری) رد شده است؟', 'Has a visa ever been refused to you (by any country)?', 'yesno', { required: true }),
      q('refusals', 'ویزاهای رد شده', 'Refused visas', 'rows', {
        show: (a) => a.refused === true,
        add: { fa: 'افزودن ویزای رد شده', en: 'Add a refused visa' },
        columns: [
          q('country', 'کشور', 'Country', 'text', { latin: true, required: true }),
          q('city', 'شهر (سفارت)', 'City (embassy)', 'text', { latin: true }),
          q('kind', 'نوع ویزا', 'Type of visa', 'select', { options: VISA_KIND, required: true }),
          q('decided', 'تاریخ دریافت نتیجه (ماه و سال میلادی)', 'Date of the result (month and year)', 'month', { required: true, notFuture: true }),
        ],
      }),
      q('canadaFile', 'آیا پرونده قبلی برای کانادا داشته‌اید (رد یا قبول)؟', 'Have you applied to Canada before (refused or approved)?', 'yesno', { required: true }),
      q('canadaFileDetails', 'توضیح کامل: نوع پرونده، تاریخ، نتیجه، تاریخ و شهر اولین ورود، هدف از سفر', 'Full details: type of application, date, result, date and city of first entry, purpose', 'textarea', { show: (a) => a.canadaFile === true, required: true }),
      q('biometrics', 'اگر انگشت‌نگاری یا فلگ‌پولینگ انجام داده‌اید، تاریخ دقیق', 'If you gave biometrics or did flagpoling, the exact date', 'text'),
    ],
  },
  {
    id: 'work',
    fa: 'سوابق کاری',
    en: 'Work history',
    help: {
      fa: 'همه فعالیت‌های ۱۰ سال گذشته بدون فاصله، از جمله دوران دانشجویی، بیکاری، خانه‌داری یا یادگیری زبان. شغل فعلی اول.',
      en: 'Every activity of the past 10 years with no gaps — including study, unemployment, homemaking or language study. Current job first.',
    },
    fields: [
      q('jobs', 'فعالیت‌ها', 'Activities', 'rows', {
        required: true,
        firstLabel: { fa: 'شغل / فعالیت فعلی', en: 'Current job / activity' },
        add: { fa: 'افزودن شغل قبلی', en: 'Add a previous job' },
        columns: [
          q('from', 'شروع (ماه و سال میلادی)', 'From (month and year)', 'month', { required: true, notFuture: true }),
          q('to', 'پایان (ماه و سال میلادی) — برای شغل فعلی خالی بگذارید', 'To (month and year) — leave empty for the current one', 'month', { notFuture: true }),
          q('title', 'عنوان دقیق شغل (به انگلیسی)', 'Exact job title (in English)', 'text', { latin: true, required: true }),
          q('company', 'نام شرکت (به انگلیسی)', 'Company (in English)', 'text', { latin: true }),
          q('city', 'شهر محل کار', 'City', 'text', { latin: true, required: true }),
          q('country', 'کشور محل کار', 'Country', 'text', { latin: true, required: true }),
        ],
      }),
      q('workNotes', 'توضیحات', 'Notes', 'textarea'),
    ],
  },
  {
    id: 'finances',
    fa: 'وضعیت مالی',
    en: 'Finances',
    fields: [
      q('accounts', 'حساب‌های بانکی', 'Bank accounts', 'rows', {
        add: { fa: 'افزودن حساب', en: 'Add an account' },
        columns: [
          q('type', 'نوع حساب (جاری، پس‌انداز، ارزی…)', 'Type (current, savings, foreign currency…)', 'text', { required: true }),
          q('notes', 'توضیحات (بانک، به نام چه کسی)', 'Notes (bank, whose name)', 'text'),
          q('balance', 'موجودی فعلی (با واحد پول)', 'Current balance (with currency)', 'text', { required: true }),
        ],
      }),
      q('properties', 'اسناد و املاک', 'Property', 'rows', {
        add: { fa: 'افزودن ملک یا سند', en: 'Add a property' },
        columns: [
          q('type', 'نوع (آپارتمان، خانه، زمین، دفتر کار، خودرو…)', 'Type (apartment, house, land, office, car…)', 'text', { required: true }),
          q('value', 'ارزش تقریبی (با واحد پول)', 'Approximate value (with currency)', 'text'),
        ],
      }),
    ],
  },
  {
    id: 'background',
    fa: 'اطلاعات تکمیلی',
    en: 'Background questions',
    fields: [
      q('tb', 'در دو سال گذشته، آیا شما یا یکی از اعضای خانواده‌تان به سل مبتلا شده یا با فرد مبتلا به سل در تماس نزدیک بوده‌اید؟', 'In the past two years, have you or a family member had tuberculosis, or been in close contact with someone who has?', 'yesno', { required: true }),
      q('medical', 'آیا اختلال جسمی یا ذهنی دارید که در کانادا (جز دارو) به خدمات درمانی یا اجتماعی نیاز داشته باشد؟', 'Do you have a physical or mental disorder that would need health or social services (other than medication) in Canada?', 'yesno', { required: true }),
      q('medicalDetails', 'توضیح کامل و نام عضو خانواده', 'Full details and the family member’s name', 'textarea', { show: (a) => a.tb === true || a.medical === true, required: true }),
      q('refusedEntry', 'آیا ویزای شما از کانادا یا کشور دیگری رد شده، از ورود شما جلوگیری شده یا دستور ترک کشوری را گرفته‌اید؟', 'Have you been refused a visa by Canada or another country, denied entry, or ordered to leave a country?', 'yesno', { required: true }),
      q('overstay', 'آیا پس از اتمام اعتبار اقامت، تحصیل یا کار بدون مجوز در کانادا مانده، درس خوانده یا کار کرده‌اید؟', 'Have you stayed beyond your status, or studied or worked without authorization, in Canada?', 'yesno', { required: true }),
      q('appliedCanada', 'آیا تا به حال برای ورود یا ماندن در کانادا درخواست داده‌اید؟', 'Have you ever applied to enter or remain in Canada?', 'yesno', { required: true }),
      q('historyDetails', 'توضیح کامل (تاریخ اولین ورود، شهر ورود، هدف از سفر، نتیجه درخواست‌ها)', 'Full details (date and city of first entry, purpose, results of the applications)', 'textarea', {
        show: (a) => a.refusedEntry === true || a.overstay === true || a.appliedCanada === true,
        required: true,
      }),
      q('criminal', 'آیا سابقه دستگیری یا سوء پیشینه کیفری در هر کشوری دارید؟', 'Have you ever been arrested for, charged with or convicted of a crime in any country?', 'yesno', { required: true }),
      q('criminalDetails', 'توضیح کامل', 'Full details', 'textarea', { show: (a) => a.criminal === true, required: true }),
      q('organization', 'آیا عضو یا حامی گروه‌های تروریستی یا سیاسی‌ای بوده‌اید که از خشونت استفاده کرده‌اند؟', 'Have you been a member or supporter of a terrorist or political group that used violence?', 'yesno', { required: true }),
      q('illTreatment', 'آیا در آزار زندانیان یا غیرنظامیان، یا غارت یا تخریب اماکن مذهبی شاهد یا شریک بوده‌اید؟', 'Have you witnessed or taken part in the ill treatment of prisoners or civilians, or the looting or desecration of religious buildings?', 'yesno', { required: true }),
      q('parentsIllness', 'آیا پدر یا مادر شما بیماری خاصی دارند؟ (توضیح دهید)', 'Do your parents have a serious illness? (explain)', 'text'),
      q('openFile', 'آیا پرونده مهاجرتی باز دارید؟ (توضیح دهید)', 'Do you have an open immigration application? (explain)', 'text'),
      q('relativesCanada', 'آیا اقوامی در کانادا دارید؟ (نسبت، شهر، وضعیت اقامت)', 'Do you have relatives in Canada? (relationship, city, status)', 'text'),
    ],
  },
];

export const CONFIRM_TEXT = {
  fa: 'اینجانب تأیید می‌کنم که تمام پاسخ‌هایم به سؤالات این فرم صادقانه، درست و کامل است و می‌دانم که در صورت وارد کردن اطلاعات نادرست، مسئولیت آن بر عهده اینجانب است.',
  en: 'I confirm that all my answers in this form are truthful, correct and complete, and I understand that I am responsible for any incorrect information.',
};

const ALL = CLIENT_SECTIONS.flatMap((s) => s.fields.map((f) => ({ ...f, section: s.id })));
const shown = (f, a) => (f.show ? f.show(a) : true);
const empty = (v) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !filledRows(v).length);
const LATIN_ONLY = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);

/** What is wrong with one answer (bilingual), or null. */
export function answerProblem(f, v) {
  if (empty(v)) return null;
  if (f.latin && typeof v === 'string' && LATIN_ONLY.test(v)) return { fa: 'لطفاً با حروف انگلیسی بنویسید', en: 'Please write it in English letters' };
  if (f.type === 'month' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v))) return { fa: 'ماه و سال را به صورت YYYY-MM وارد کنید', en: 'Use year and month: YYYY-MM' };
  if (f.type === 'month' && f.notFuture && String(v) > thisMonth()) return { fa: 'نمی‌تواند بعد از ماه جاری باشد', en: 'Cannot be later than this month' };
  if (f.type === 'date' && f.notFuture && String(v) > today()) return { fa: 'نمی‌تواند بعد از امروز باشد', en: 'Cannot be later than today' };
  if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) return { fa: 'ایمیل درست نیست', en: 'Not a valid email address' };
  return null;
}

/**
 * Everything still to answer or to correct before submitting:
 * [{ section, id, row?, col?, fa, en }].
 */
export function clientProblems(answers = {}) {
  const out = [];
  for (const f of ALL) {
    if (!shown(f, answers)) continue;
    const v = answers[f.id];
    if (f.type === 'rows') {
      const rows = filledRows(v);
      if (f.required && !rows.length) out.push({ section: f.section, id: f.id, fa: `${f.fa}: حداقل یک ردیف`, en: `${f.en}: at least one row` });
      rows.forEach((r, i) => {
        for (const c of f.columns) {
          const p = c.required && empty(r[c.id]) ? { fa: 'خالی است', en: 'missing' } : answerProblem(c, r[c.id]);
          if (p) out.push({ section: f.section, id: f.id, row: i, col: c.id, fa: `${f.fa} ${i + 1} — ${c.fa}: ${p.fa}`, en: `${f.en} ${i + 1} — ${c.en}: ${p.en}` });
        }
        if (r.from && r.to && String(r.to) < String(r.from)) out.push({ section: f.section, id: f.id, row: i, col: 'to', fa: `${f.fa} ${i + 1}: پایان قبل از شروع است`, en: `${f.en} ${i + 1}: ends before it starts` });
      });
      continue;
    }
    if (f.required && empty(v) && typeof v !== 'boolean') out.push({ section: f.section, id: f.id, fa: `${f.fa}: خالی است`, en: `${f.en}: missing` });
    else {
      const p = answerProblem(f, v);
      if (p) out.push({ section: f.section, id: f.id, fa: `${f.fa}: ${p.fa}`, en: `${f.en}: ${p.en}` });
    }
  }
  return out;
}

/** Share of the questions asked that have an answer (0–1), for the progress bar. */
export function clientProgress(answers = {}) {
  const asked = ALL.filter((f) => shown(f, answers) && f.required);
  if (!asked.length) return 0;
  return asked.filter((f) => !empty(answers[f.id]) || typeof answers[f.id] === 'boolean').length / asked.length;
}

/** Only the answers the questionnaire knows, in their shape (a client cannot store anything else). */
export function cleanAnswers(input = {}) {
  const out = {};
  for (const f of ALL) {
    if (!(f.id in input)) continue;
    const v = input[f.id];
    if (f.type === 'rows') {
      if (!Array.isArray(v)) continue;
      out[f.id] = v.slice(0, 40).map((r) => Object.fromEntries(f.columns.filter((c) => r && r[c.id] != null).map((c) => [c.id, c.type === 'yesno' ? r[c.id] === true || r[c.id] === false ? r[c.id] : '' : String(r[c.id]).slice(0, 500)])));
    } else if (f.type === 'yesno') {
      if (v === true || v === false || v === '') out[f.id] = v;
    } else out[f.id] = String(v ?? '').slice(0, 4000);
  }
  return out;
}

/* ---------------------------- intake mapping ---------------------------- */

const pipe = (cells) => cells.map((c) => String(c ?? '').replace(/\|/g, '/').trim()).join(' | ');
const lines = (t) =>
  String(t || '')
    .split(/\n+/)
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.some(Boolean));
const toMarital5645 = (v) => ({ Single: 'Single', Married: 'Married-physically present', Divorced: 'Divorced', Widowed: 'Widowed' })[v] || v;
const fromMarital5645 = (v) => (/^Married/.test(v || '') ? 'Married' : ['Single', 'Divorced', 'Widowed'].includes(v) ? v : '');
const EDU_TO_INTAKE = {
  'High school': 'Secondary school (high school diploma)',
  'Pre-university': 'Secondary school (high school diploma)',
  Vocational: 'Trade / vocational certificate',
  Associate: 'College diploma / associate degree',
  Bachelor: "Bachelor's degree",
  Master: "Master's degree",
  PhD: 'Doctorate (PhD)',
  Professional: 'Professional degree (medicine, dentistry, pharmacy, law)',
};
const EDU_RANK = ['High school', 'Pre-university', 'Vocational', 'Associate', 'Bachelor', 'Master', 'PhD', 'Professional'];

/** Persons of the intake's "children" / "siblings" lines → questionnaire rows. */
function personsFrom(text) {
  return lines(text).map(([nameEn, nameFa, dob, birthCountry, rel, marital, address, occupation]) => ({
    nameEn: nameEn || '', nameFa: nameFa || '', dob: dob || '', birthCountry: birthCountry || '',
    sex: /daughter|sister/i.test(rel || '') ? 'F' : /son|brother/i.test(rel || '') ? 'M' : '',
    marital: fromMarital5645(marital) || marital || '', address: address || '', occupation: occupation || '',
  }));
}
function personsTo(rows, female, male) {
  return filledRows(rows)
    .map((r) => pipe([r.nameEn, r.nameFa, r.dob, [r.birthCountry, r.birthCity].filter(Boolean).join(', ') || '', r.sex === 'F' ? female : r.sex === 'M' ? male : '', toMarital5645(r.marital), r.address, r.occupation, '']))
    .join('\n');
}

/**
 * The questionnaire's answers before the client opens it: what the intake
 * (filled from the passport and the other documents) already knows.
 */
export function prefill(d = {}) {
  const a = {
    givenName: d.givenName, familyName: d.familyName, nameFa: d.nativeName, dob: d.dob,
    birthCountry: d.countryOfBirth, birthCity: d.cityOfBirth, email: d.email,
    mobile: [d.phoneCountryCode && `+${String(d.phoneCountryCode).replace(/^\+/, '')}`, d.phoneNumber].filter(Boolean).join(' '),
    addressStreet: [d.mailingUnit && `Unit ${d.mailingUnit}`, d.mailingStreetNo, d.mailingStreet].filter(Boolean).join(' '),
    addressCity: d.mailingCity, addressProvince: d.mailingProvince, addressPostal: d.mailingPostal, addressCountry: d.mailingCountry,
    nameChange: d.otherNames,
    passportNumber: d.passportNumber, passportIssue: d.passportIssue, passportExpiry: d.passportExpiry, passportCountry: d.passportCountry,
    nationalIdNumber: d.nationalIdNumber, nationalIdIssue: d.nationalIdIssue, nationalIdExpiry: d.nationalIdExpiry,
    motherNameEn: d.motherName, motherNameFa: d.motherNameNative, motherMarital: fromMarital5645(d.motherMaritalStatus), motherOccupation: d.motherOccupation,
    motherBirthCountry: d.motherBirthCountry, motherDob: d.motherDob, motherAddress: d.motherAddress,
    fatherNameEn: d.fatherName, fatherNameFa: d.fatherNameNative, fatherMarital: fromMarital5645(d.fatherMaritalStatus), fatherOccupation: d.fatherOccupation,
    fatherBirthCountry: d.fatherBirthCountry, fatherDob: d.fatherDob, fatherAddress: d.fatherAddress,
    marital: d.maritalStatus, spouseGivenName: d.spouseGivenName, spouseFamilyName: d.spouseFamilyName, spouseNameFa: d.spouseNameNative,
    spouseOccupation: d.spouseOccupation, spouseBirthCountry: d.spouseCountryOfBirth, spouseDob: d.spouseDob, marriageDate: d.marriageDate, spouseAddress: d.spouseAddress,
    previouslyMarried: d.previouslyMarried, prevSpouseGivenName: d.prevSpouseGivenName, prevSpouseFamilyName: d.prevSpouseFamilyName,
    prevSpouseDob: d.prevSpouseDob, prevMarriageDate: d.prevRelationshipFrom, prevDivorceDate: d.prevRelationshipTo,
    languageTest: d.languageTest && d.languageTest !== 'None yet' ? d.languageTest : undefined,
    hasLanguageTest: d.languageTest === 'None yet' ? false : d.languageTest ? true : undefined,
    languageScore: d.languageScore, languageTestDate: d.languageTestDate,
    served: d.bgMilitary,
    travelled: d.travelledAbroad,
    tb: d.bgTbContact, medical: d.bgMedicalCondition, medicalDetails: d.medicalDetails,
    refusedEntry: d.previousRefusal, overstay: d.bgOverstay, appliedCanada: d.previousCanadaApplication, historyDetails: d.refusalDetails,
    canadaFile: d.previousCanadaApplication,
    criminal: d.bgCriminal, criminalDetails: d.criminalDetails, organization: d.bgOrganization, illTreatment: d.bgWitnessed,
  };
  const kids = personsFrom(d.children);
  if (kids.length) Object.assign(a, { hasChildren: true, children: kids });
  const sibs = personsFrom(d.siblings);
  if (sibs.length) Object.assign(a, { hasSiblings: true, siblings: sibs });
  const mil = filledRows(d.militaryService)[0];
  if (mil) Object.assign(a, { serviceFrom: mil.from, serviceTo: mil.to, serviceOrg: mil.location, serviceCity: mil.province });
  const jobs = filledRows(d.jobs);
  if (jobs.length) a.jobs = jobs.map((j) => ({ from: j.from, to: j.to, title: j.occupation, company: j.employer, city: j.city, country: j.country }));
  const trips = filledRows(d.trips);
  if (trips.length) Object.assign(a, { travelled: true, trips: trips.map((t) => ({ from: t.from, to: t.to, country: t.country, city: t.city, purpose: t.purpose })) });
  const refusals = filledRows(d.immigrationApps).filter((x) => x.result === 'Refused');
  if (refusals.length) Object.assign(a, { refused: true, refusals: refusals.map((x) => ({ country: x.country, kind: ['Visitor visa', 'Study permit', 'Work permit', 'Permanent residence'].includes(x.kind) ? x.kind : 'Other', decided: x.decided || x.applied })) });
  if (d.lastInstitution) {
    a.education = [{ level: Object.keys(EDU_TO_INTAKE).find((k) => EDU_TO_INTAKE[k] === d.highestEducation) || '', school: d.lastInstitution, field: d.lastFieldOfStudy, city: d.lastEduCity, country: d.lastEduCountry, from: d.lastEduFrom, to: d.lastEduTo }];
  }
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/**
 * The intake answers the questionnaire gives: { intakeFieldId: value }. Only
 * questions asked (a hidden follow-up gives nothing) and answered.
 */
export function toIntake(a = {}) {
  const on = (id) => {
    const f = ALL.find((x) => x.id === id);
    return f && shown(f, a) && !empty(a[id]);
  };
  const out = {};
  const set = (key, id, fn = (v) => v) => {
    if (on(id)) out[key] = fn(a[id]);
  };
  set('givenName', 'givenName'); set('familyName', 'familyName'); set('nativeName', 'nameFa'); set('dob', 'dob');
  set('countryOfBirth', 'birthCountry'); set('cityOfBirth', 'birthCity'); set('email', 'email');
  if (on('mobile')) {
    const m = String(a.mobile).replace(/[^\d+]/g, '');
    const cc = m.match(/^\+(98|1|90|44|49|971|61|33|86|91|7)/);
    if (cc) Object.assign(out, { phoneCountryCode: cc[1], phoneNumber: m.slice(cc[0].length).replace(/^0/, '') });
    else out.phoneNumber = m.replace(/^\+/, '');
  }
  set('mailingStreet', 'addressStreet'); set('mailingCity', 'addressCity'); set('mailingProvince', 'addressProvince');
  set('mailingPostal', 'addressPostal'); set('mailingCountry', 'addressCountry'); set('otherNames', 'nameChange');
  for (const k of ['passportNumber', 'passportIssue', 'passportExpiry', 'passportCountry', 'nationalIdNumber', 'nationalIdIssue', 'nationalIdExpiry']) set(k, k);
  set('motherName', 'motherNameEn'); set('motherNameNative', 'motherNameFa'); set('motherMaritalStatus', 'motherMarital', toMarital5645);
  set('motherOccupation', 'motherOccupation'); set('motherBirthCountry', 'motherBirthCountry'); set('motherDob', 'motherDob'); set('motherAddress', 'motherAddress');
  set('fatherName', 'fatherNameEn'); set('fatherNameNative', 'fatherNameFa'); set('fatherMaritalStatus', 'fatherMarital', toMarital5645);
  set('fatherOccupation', 'fatherOccupation'); set('fatherBirthCountry', 'fatherBirthCountry'); set('fatherDob', 'fatherDob'); set('fatherAddress', 'fatherAddress');
  set('maritalStatus', 'marital');
  set('spouseGivenName', 'spouseGivenName'); set('spouseFamilyName', 'spouseFamilyName'); set('spouseNameNative', 'spouseNameFa');
  set('spouseOccupation', 'spouseOccupation'); set('spouseCountryOfBirth', 'spouseBirthCountry'); set('spouseDob', 'spouseDob');
  set('marriageDate', 'marriageDate'); set('spouseAddress', 'spouseAddress');
  set('previouslyMarried', 'previouslyMarried');
  set('prevSpouseGivenName', 'prevSpouseGivenName'); set('prevSpouseFamilyName', 'prevSpouseFamilyName'); set('prevSpouseDob', 'prevSpouseDob');
  set('prevRelationshipFrom', 'prevMarriageDate'); set('prevRelationshipTo', 'prevDivorceDate');
  if (on('prevMarriageDate')) out.prevRelationshipType = 'Married';
  if (on('children')) out.children = personsTo(a.children, 'Daughter', 'Son');
  if (on('siblings')) out.siblings = personsTo(a.siblings, 'Sister', 'Brother');
  // Education: the highest level completed, and the most recent post-secondary studies.
  const edu = filledRows(a.education).filter((e) => shown(ALL.find((x) => x.id === 'education'), a));
  if (edu.length) {
    const top = [...edu].sort((x, y) => EDU_RANK.indexOf(y.level) - EDU_RANK.indexOf(x.level))[0];
    if (EDU_TO_INTAKE[top.level]) out.highestEducation = EDU_TO_INTAKE[top.level];
    const recent = [...edu].sort((x, y) => String(y.to || y.from || '').localeCompare(String(x.to || x.from || '')))[0];
    Object.assign(out, { lastInstitution: recent.school || '', lastFieldOfStudy: recent.field || '', lastEduFrom: recent.from || '', lastEduTo: recent.to || '', lastEduCity: recent.city || '', lastEduCountry: recent.country || '' });
  }
  if (typeof a.hasLanguageTest === 'boolean') {
    if (a.hasLanguageTest === false) out.languageTest = 'None yet';
    else {
      set('languageTest', 'languageTest'); set('languageScore', 'languageScore'); set('languageTestDate', 'languageTestDate');
    }
  }
  set('bgMilitary', 'served');
  if (a.served === true && on('serviceFrom')) out.militaryService = [{ from: a.serviceFrom || '', to: a.serviceTo || '', location: [a.serviceOrg, a.serviceCity].filter(Boolean).join(', '), province: '', country: 'Iran' }];
  set('travelledAbroad', 'travelled');
  if (on('trips')) out.trips = filledRows(a.trips).map((t) => ({ from: t.from || '', to: t.to || '', country: t.country || '', city: t.city || '', purpose: t.purpose || '' }));
  if (on('jobs')) out.jobs = filledRows(a.jobs).map((j) => ({ from: j.from || '', to: j.to || '', occupation: j.title || '', employer: j.company || '', city: j.city || '', country: j.country || '' }));
  if (on('refusals')) {
    out.immigrationApps = filledRows(a.refusals).map((r) => ({ country: r.country || '', kind: r.kind || 'Other', applied: r.decided || '', result: 'Refused', decided: r.decided || '', details: r.city ? `${r.city} office` : '' }));
  }
  set('bgTbContact', 'tb'); set('bgMedicalCondition', 'medical'); set('medicalDetails', 'medicalDetails');
  set('previousRefusal', 'refusedEntry'); set('bgOverstay', 'overstay'); set('previousCanadaApplication', 'appliedCanada');
  const hist = [on('historyDetails') && a.historyDetails, on('canadaFileDetails') && a.canadaFileDetails].filter(Boolean);
  if (hist.length) out.refusalDetails = hist.join('\n');
  set('bgCriminal', 'criminal'); set('criminalDetails', 'criminalDetails'); set('bgOrganization', 'organization'); set('bgWitnessed', 'illTreatment');
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/** Answers with no place in the intake, for the team (shown with the review). */
export function otherAnswers(a = {}) {
  const used = new Set([
    'companions', 'addressFa', 'motherBirthCity', 'fatherBirthCity', 'spouseBirthCity', 'spouseLanguage', 'spouseLanguageTest', 'prevSpouseNameFa', 'prevSpouseOccupation',
    'prevSpouseBirthPlace', 'prevSpouseAddress', 'familyNotes', 'educationNotes', 'exemption', 'travelNotes', 'biometrics', 'workNotes', 'accounts', 'properties',
    'parentsIllness', 'openFile', 'relativesCanada', 'landline',
  ]);
  return ALL.filter((f) => used.has(f.id) && shown(f, a) && !empty(a[f.id])).map((f) => ({ id: f.id, section: f.section, fa: f.fa, en: f.en, value: a[f.id], columns: f.columns }));
}
