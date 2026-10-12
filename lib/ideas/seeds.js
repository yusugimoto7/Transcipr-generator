// What the general-ideas section listens to, by subject. Ideas are not news:
// they are the questions people keep asking (how do I…, can I…, why was my…)
// that the brand can answer any week. Each subject has:
//   seeds    search phrases whose Google / YouTube autocompletions show what
//            people type, in English and in Persian (the Persian ones carry
//            the Iranian angle: «برای ایرانیان», «بدون مدرک زبان»…)
//   hc       IRCC Help Centre topic ids, whose question lists are what IRCC
//            itself gets asked most
//   pages    official canada.ca pages an idea on this subject is grounded on;
//            the model picks by id, never by free-text URL
// Add a subject here to widen the net; the harvester picks it up next run.

const CA = "https://www.canada.ca/en/immigration-refugees-citizenship/services";

export const SUBJECTS = [
  {
    id: "study",
    label: "Study permit",
    field: "Study",
    seeds: {
      en: ["study permit canada", "how to apply for study permit", "study permit refused", "study permit extension", "study permit inside canada", "canada student visa requirements"],
      fa: ["ویزای تحصیلی کانادا", "مجوز تحصیل کانادا", "ریجکت ویزای تحصیلی کانادا", "تمدید ویزای تحصیلی کانادا", "ویزای دانشجویی کانادا برای ایرانیان"],
      yt: ["study permit canada", "canada study permit refused"],
    },
    hc: [15],
    pages: [
      ["study-eligibility", "Study permit: who is eligible", `${CA}/study-canada/study-permit/eligibility.html`],
      ["study-documents", "Study permit: documents needed", `${CA}/study-canada/study-permit/get-documents.html`],
      ["study-apply", "Study permit: how to apply", `${CA}/study-canada/study-permit/apply.html`],
      ["study-after-apply", "Study permit: after you apply", `${CA}/study-canada/study-permit/after-apply-next-steps.html`],
      ["study-extend", "Extend a study permit", `${CA}/study-canada/extend-study-permit.html`],
      ["study-pal", "Provincial attestation letter (PAL/TAL)", `${CA}/study-canada/study-permit/get-documents/provincial-attestation-letter.html`],
      ["study-change-school", "Changing schools as a student", `${CA}/study-canada/change-schools.html`],
      ["study-minors", "Minor children studying in Canada", `${CA}/study-canada/study-permit/minor-children.html`],
      ["study-expired", "Expired study permit: restore status", `${CA}/study-canada/extend-study-permit/expired-permit.html`],
      ["study-work", "Working while studying", `${CA}/study-canada/work.html`],
      ["study-spouse-work", "Spouse of a student: work permit", `${CA}/study-canada/work/help-your-spouse-common-law-partner-work-canada.html`],
    ],
  },
  {
    id: "pgwp",
    label: "PGWP",
    field: "Study",
    seeds: {
      en: ["pgwp eligibility", "post graduation work permit", "pgwp refused", "pgwp extension"],
      fa: ["ویزای کار بعد از تحصیل کانادا", "پی جی دبلیو پی"],
      yt: ["pgwp canada"],
    },
    hc: [15, 17],
    pages: [
      ["pgwp-eligibility", "PGWP: who is eligible", `${CA}/study-canada/work/after-graduation/eligibility.html`],
      ["pgwp-apply", "PGWP: how to apply", `${CA}/study-canada/work/after-graduation/apply.html`],
    ],
  },
  {
    id: "work",
    label: "Work permits",
    field: "Work Permit",
    seeds: {
      en: ["work permit canada requirements", "open work permit canada", "spousal open work permit", "bridging open work permit", "work permit extension canada", "lmia work permit", "work permit refused canada", "restore status canada"],
      fa: ["ویزای کار کانادا", "ورک پرمیت کانادا", "ویزای کار کانادا برای ایرانیان", "اپن ورک پرمیت همسر", "ال ام آی ای کانادا", "تمدید ویزای کار کانادا"],
      yt: ["work permit canada", "lmia canada"],
    },
    hc: [17],
    pages: [
      ["work-eligibility", "Work permit: eligibility", `${CA}/work-canada/permit/temporary/eligibility.html`],
      ["work-apply", "Work permit: how to apply", `${CA}/work-canada/permit/temporary/apply.html`],
      ["work-extend", "Extend or change a work permit", `${CA}/work-canada/permit/temporary/extend.html`],
      ["work-need-permit", "Do you need a work permit", `${CA}/work-canada/permit/temporary/need-permit.html`],
      ["work-bowp", "Bridging open work permit (PR applicants)", `${CA}/work-canada/pr-work-permits/bridging.html`],
      ["work-sowp", "Open work permit for spouses and dependants of workers and PR applicants", `${CA}/work-canada/permit/temporary/open-work-permit-spouses-dependent-children/eligibility.html`],
      ["work-owp", "Open work permits: who can apply", `${CA}/work-canada/open-work-permit.html`],
      ["work-lmia", "Labour Market Impact Assessment (LMIA)", `${CA}/work-canada/hire-foreign-worker/temporary/find-need-labour-market-impact-assessment.html`],
      ["status-restore", "Restore your status and get a work permit", `${CA}/work-canada/restore.html`],
    ],
  },
  {
    id: "family",
    label: "Spousal and family sponsorship",
    field: "Family",
    seeds: {
      en: ["spousal sponsorship canada", "spousal sponsorship requirements", "spousal sponsorship refused", "sponsor parents canada", "super visa canada", "common law sponsorship canada", "inland vs outland sponsorship"],
      fa: ["اسپانسرشیپ همسر کانادا", "اسپانسر همسر کانادا", "اسپانسرشیپ والدین کانادا", "سوپر ویزا کانادا", "ویزای همراه کانادا"],
      yt: ["spousal sponsorship canada", "super visa canada"],
    },
    hc: [14],
    pages: [
      ["spouse-eligibility", "Sponsor a spouse or partner: eligibility", `${CA}/immigrate-canada/family-sponsorship/spouse-partner-children/eligibility.html`],
      ["spouse-apply", "Sponsor a spouse or partner: how to apply", `${CA}/immigrate-canada/family-sponsorship/spouse-partner-children/apply.html`],
      ["spouse-after", "Sponsor a spouse or partner: after you apply", `${CA}/immigrate-canada/family-sponsorship/spouse-partner-children/after-apply-next-steps.html`],
      ["spouse-owp", "Open work permit for a sponsored spouse in Canada", `${CA}/immigrate-canada/family-sponsorship/spouse-partner-children/spouse-common-law-partner-canada-open-work-permit.html`],
      ["parents-eligibility", "Sponsor parents and grandparents: eligibility", `${CA}/immigrate-canada/family-sponsorship/sponsor-parents-grandparents/eligibility.html`],
      ["parents-income", "Sponsor parents: income requirement", `${CA}/immigrate-canada/family-sponsorship/sponsor-parents-grandparents/eligibility/income.html`],
      ["super-visa", "Super visa: eligibility", `${CA}/visit-canada/parent-grandparent-super-visa/eligibility.html`],
    ],
  },
  {
    id: "express",
    label: "Express Entry",
    field: "Express Entry",
    seeds: {
      en: ["express entry eligibility", "canadian experience class requirements", "crs score calculator", "express entry documents", "proof of funds express entry", "express entry ita next steps", "category based draws"],
      fa: ["اکسپرس انتری کانادا", "اکسپرس انتری برای ایرانیان", "امتیاز اکسپرس انتری", "تمکن مالی اکسپرس انتری", "مدارک اکسپرس انتری"],
      yt: ["express entry canada", "canadian experience class"],
    },
    hc: [29],
    pages: [
      ["ee-eligibility", "Express Entry: who can apply", `${CA}/immigrate-canada/express-entry/eligibility.html`],
      ["ee-cec", "Canadian Experience Class", `${CA}/immigrate-canada/express-entry/eligibility/canadian-experience-class.html`],
      ["ee-fsw", "Federal Skilled Worker", `${CA}/immigrate-canada/express-entry/eligibility/federal-skilled-workers.html`],
      ["ee-crs", "CRS criteria", `${CA}/immigrate-canada/express-entry/eligibility/criteria-comprehensive-ranking-system.html`],
      ["ee-categories", "Category-based selection", `${CA}/immigrate-canada/express-entry/rounds-invitations/category-based-selection.html`],
      ["ee-documents", "Express Entry: documents", `${CA}/immigrate-canada/express-entry/documents.html`],
      ["ee-funds", "Proof of funds", `${CA}/immigrate-canada/express-entry/documents/proof-funds.html`],
      ["ee-language", "Language requirements", `${CA}/immigrate-canada/express-entry/documents/language-requirements.html`],
      ["ee-eca", "Educational credential assessment", `${CA}/immigrate-canada/express-entry/documents/education-assessed.html`],
      ["ee-profile", "Submit a profile", `${CA}/immigrate-canada/express-entry/submit-profile.html`],
      ["ee-apply", "After an invitation: apply for permanent residence", `${CA}/immigrate-canada/express-entry/apply-permanent-residence.html`],
      ["ee-after", "Express Entry: after you apply", `${CA}/immigrate-canada/express-entry/after-apply.html`],
    ],
  },
  {
    id: "pnp",
    label: "Provincial nominee programs",
    field: "PNP",
    seeds: {
      en: ["provincial nominee program requirements", "bc pnp", "oinp", "pnp without job offer"],
      fa: ["برنامه استانی کانادا", "پی ان پی کانادا", "مهاجرت استانی کانادا"],
      yt: ["pnp canada"],
    },
    hc: [6],
    pages: [
      ["pnp-overview", "Immigrate as a provincial nominee", `${CA}/immigrate-canada/provincial-nominees.html`],
      ["pnp-eligibility", "PNP through Express Entry: who can apply", `${CA}/immigrate-canada/provincial-nominees/express-entry/eligibility.html`],
      ["pnp-how", "How provincial nomination works", `${CA}/immigrate-canada/provincial-nominees/works.html`],
    ],
  },
  {
    id: "visit",
    label: "Visitor visa",
    field: "Policy",
    seeds: {
      en: ["visitor visa canada requirements", "visitor visa refused", "extend visitor status canada", "visitor record canada", "canada visitor visa proof of funds"],
      fa: ["ویزای توریستی کانادا", "ویزای توریستی کانادا برای ایرانیان", "ریجکت ویزای توریستی کانادا", "تمدید ویزای توریستی کانادا", "ویزای ملاقاتی کانادا"],
      yt: ["canada visitor visa"],
    },
    hc: [16, 22],
    pages: [
      ["visit-visa", "Visitor visa", `${CA}/visit-canada/visitor-visa.html`],
      ["visit-apply", "Apply for a visitor visa", `${CA}/visit-canada/apply-visitor-visa.html`],
      ["visit-extend", "Extend your stay as a visitor", `${CA}/visit-canada/extend-stay.html`],
      ["visit-eta", "Electronic travel authorization", `${CA}/visit-canada/eta.html`],
      ["visit-after", "Visitor visa: after you apply (approval, refusal)", `${CA}/visit-canada/after-apply-next-steps.html`],
    ],
  },
  {
    id: "citizenship",
    label: "Citizenship and PR status",
    field: "Citizenship",
    seeds: {
      en: ["canadian citizenship requirements", "citizenship test canada", "pr card renewal", "residency obligation canada", "pr card expired outside canada"],
      fa: ["شهروندی کانادا", "پاسپورت کانادا شرایط", "تمدید کارت اقامت کانادا", "اقامت دائم کانادا شرایط حفظ"],
      yt: ["canadian citizenship application"],
    },
    hc: [5, 10],
    pages: [
      ["cit-eligibility", "Citizenship: eligibility", `${CA}/canadian-citizenship/become-canadian-citizen/eligibility.html`],
      ["cit-apply", "Citizenship: how to apply", `${CA}/canadian-citizenship/become-canadian-citizen/apply.html`],
      ["pr-status", "Understand PR status and the residency obligation", `${CA}/new-immigrants/pr-card/understand-pr-status.html`],
      ["pr-renew", "Get, renew or replace a PR card", `${CA}/permanent-residents/card/apply.html`],
    ],
  },
  {
    id: "refusal",
    label: "Refusals, inadmissibility and process",
    field: "Policy",
    seeds: {
      en: ["canada visa refused what to do", "reconsideration request ircc", "judicial review immigration canada", "misrepresentation canada immigration", "inadmissible to canada", "ircc processing times", "biometrics canada", "medical exam immigration canada", "gcms notes"],
      fa: ["دلایل ریجکت ویزای کانادا", "ریجکت ویزای کانادا", "اعتراض به ریجکت ویزای کانادا", "انگشت نگاری ویزای کانادا", "آزمایش پزشکی مهاجرت کانادا", "زمان بررسی ویزای کانادا"],
      yt: ["canada visa refused", "gcms notes"],
    },
    hc: [3, 4, 8, 19, 23],
    pages: [
      ["inadmissibility", "Inadmissibility", `${CA}/immigrate-canada/inadmissibility.html`],
      ["inadmissibility-reasons", "Reasons for inadmissibility", `${CA}/immigrate-canada/inadmissibility/reasons.html`],
      ["inadmissibility-criminal", "Overcome criminal convictions", `${CA}/immigrate-canada/inadmissibility/overcome-criminal-convictions.html`],
      ["medical-exam", "Medical exams", `${CA}/application/medical-police/medical-exams.html`],
      ["biometrics", "Biometrics: facts", "https://www.canada.ca/en/immigration-refugees-citizenship/campaigns/biometrics/facts.html"],
      ["processing-times", "Processing times", `${CA}/application/check-processing-times.html`],
    ],
  },
  {
    id: "suv",
    label: "Start-up Visa",
    field: "Policy",
    seeds: {
      en: ["start-up visa canada requirements", "startup visa canada designated organizations"],
      fa: ["ویزای استارتاپ کانادا", "استارتاپ ویزا کانادا شرایط"],
      yt: ["start up visa canada"],
    },
    hc: [6],
    pages: [
      ["suv", "Start-up Visa", `${CA}/immigrate-canada/start-visa.html`],
      ["suv-eligibility", "Start-up Visa: eligibility", `${CA}/immigrate-canada/start-visa/eligibility.html`],
    ],
  },
];

export const ALL_PAGES = SUBJECTS.flatMap((s) => s.pages.map(([id, label, url]) => ({ id, label, url, subject: s.id, field: s.field })));

export const HC_TOPICS = {
  3: "Application status", 4: "Applying – general", 5: "Citizenship", 6: "Immigrating", 8: "Inadmissibility",
  10: "Permanent residents", 14: "Sponsoring your family", 15: "Studying", 16: "Visiting", 17: "Work permits",
  19: "Biometrics", 22: "Leaving / returning to Canada", 23: "Applying online", 29: "Express Entry",
};

// Reddit communities whose questions show what applicants struggle with.
export const SUBREDDITS = ["ImmigrationCanada"];
