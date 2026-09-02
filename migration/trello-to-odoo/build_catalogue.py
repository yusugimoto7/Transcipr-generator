"""Build products.json from the Canada price list (Google Sheet, tab Canada).

Run once to (re)generate products.json; edit that file for tweaks afterwards.
Prices in CAD. Only services marked active (TRUE) in the sheet are included.
"""

import json
import pathlib

OUT = pathlib.Path(__file__).resolve().parent / "products.json"

# Shared government-fee products (pass-through, no margin).
GOV = {
    "GOV-SP":   ("Government fee – Study permit", 150),
    "GOV-WP":   ("Government fee – Work permit", 255),
    "GOV-TRV":  ("Government fee – Visitor visa", 100),
    "GOV-BIO":  ("Government fee – Biometrics (per person, max 170/family)", 85),
    "GOV-LMIA": ("Government fee – LMIA", 1000),
    "GOV-REST": ("Government fee – Restoration", 239.75),
}

# key: (English name, Persian name, principal price, add-ons, gov fees, payment terms)
SERVICES = {
    "EE": ("Express Entry – PR", "اکسپرس انتری", 4000,
           {"Spouse": 1000, "Child (each)": 500}, [],
           "Payment 1: 1,500 CAD at signing. Payment 2: balance after ITA. "
           "Or 4 instalments of 1,000 CAD: signing, +1 month, after ITA, before PR submission. "
           "Government fees extra."),
    "PNP": ("PNP – non-Express Entry stream", "PNP روش مستقیم", 4000,
            {"Spouse": 1000, "Child (each)": 500}, [],
            "Payment 1: 50% at signing. Payment 2: 50% after provincial nomination. "
            "Or 4 instalments of 1,000 CAD. Government fees extra."),
    "PNP-EE": ("PNP – Express Entry stream", "PNP روش اکسپرس انتری", 4500,
               {"Spouse": 1000, "Child (each)": 500}, [],
               "Payment 1: 50% at signing. Payment 2: 50% after provincial nomination. "
               "Or 4 instalments: 1,000 / 1,000 / 1,000 / 1,500 CAD. Government fees extra."),
    "SP-ADM": ("Admission + Study permit (college/university)", "پذیرش و ویزای تحصیلی", 2200,
               {"Spouse open work permit": 800, "Child study permit (each, max 500)": 250},
               ["GOV-SP", "GOV-WP", "GOV-BIO"],
               "50% at signing (admission process starts). 50% after the original letter of "
               "acceptance. Opening offer 2,200 CAD; floor 1,800 CAD. Government fees extra."),
    "SP-ADM-K12": ("Admission + Study permit (school student)", "پذیرش و ویزای تحصیلی دانش آموزی",
                   2200, {"Accompanying parent visitor visa": 800},
                   ["GOV-SP", "GOV-TRV", "GOV-BIO"],
                   "50% at signing. 50% after the original letter of acceptance. Government fees extra."),
    "SP-ONLY": ("Study permit only (admission in hand)", "فقط ویزای تحصیلی", 1400,
                {"Spouse open work permit": 800, "Child visitor visa (each)": 250},
                ["GOV-SP", "GOV-WP", "GOV-TRV", "GOV-BIO"],
                "Full contract amount plus government fees at signing."),
    "TRV": ("Visitor visa (TRV)", "ویزای ویزیتوری", 1200,
            {"Spouse": 300, "Child (each; 3rd child onward free)": 200},
            ["GOV-TRV", "GOV-BIO"],
            "Full contract amount plus government fees at signing."),
    "BV": ("Business visitor visa", "ویزای بیزنس ویزیتور", 1200,
           {"Spouse": 300, "Child (each; 3rd child onward free)": 200,
            "Event / conference invitation letter": 500},
           ["GOV-TRV", "GOV-BIO"],
           "Full contract amount plus government fees at signing."),
    "SUPERVISA": ("Parents' super visa", "سوپر ویزای والدین", 1500,
                  {"Spouse": 500}, ["GOV-TRV", "GOV-BIO"],
                  "Full contract amount plus government fees at signing."),
    "OWP-ACC": ("Accompanying work permit (spouse/children of student or worker)",
                "ورک پرمیت همراه", 1400, {"Child study permit (each)": 200}, [],
                "Full contract amount plus government fees at signing."),
    "IN-WP": ("In-Canada work permit (2025 update)", "ورک پرمیت داخل کانادا", 700,
              {"Spouse": 200}, ["GOV-WP"],
              "Full contract amount plus government fees at signing."),
    "IN-TRV": ("In-Canada visitor visa (TRV, permit holders)", "ویزای توریستی داخل کانادا", 700,
               {"Spouse": 200, "Child (one; further children free)": 200}, ["GOV-TRV"],
               "Full contract amount plus government fees at signing."),
    "VR": ("Visitor record", "ویزیتور ریکورد", 700, {}, ["GOV-TRV"],
           "Full contract amount plus government fees at signing."),
    "SPX": ("Study permit extension", "تمدید اجازه تحصیل", 700, {}, ["GOV-SP"],
            "Full contract amount plus government fees at signing."),
    "PGWP": ("Post-graduation work permit", "اجازه کار پس از تحصیل", 800,
             {"Spouse": 400}, ["GOV-WP"],
             "Full contract amount plus government fees at signing."),
    "PERMIT-AMEND": ("Permit amendment in Canada", "اصلاحیه پرمیت", 500, {}, [],
                     "Full contract amount at signing. No government fee."),
    "RESTORE": ("Restoration of status (added to the permit service)", "Restoration", 300, {},
                ["GOV-REST"], "Full contract amount plus government fee at signing."),
    "CAREGIVER": ("Caregiver – PR", "پرستار خانگی", 5000,
                  {"Spouse": 1000, "Child (each)": 500}, [],
                  "Stage 1: 2,000 CAD at signing. Stage 2: balance when 2026 details are announced, "
                  "before PR submission. 50% refund if we cannot submit. 2026 capacity: 5 contracts."),
    "WP-ABROAD": ("Work permit from outside Canada", "ورک پرمیت از خارج کانادا", 3000, {}, [],
                  "50% at signing, 50% before submission to IRCC."),
    "PRC-RENEW": ("PR card renewal (no issues)", "تمدید کارت اقامت دائم", 2000, {}, [], ""),
    "PR-RENOUNCE": ("PR renunciation", "PR Renounce", 1500, {}, [], ""),
    "PRC-LOST": ("Replacement of lost PR card", "صدور مجدد کارت PR", 1500, {}, [], ""),
    "CIT": ("Citizenship application", "درخواست شهروندی", 1500, {}, [], ""),
    "CIT-LEGAL": ("Citizenship application with legal issue", "شهروندی با مشکل قانونی", 6000,
                  {}, [], ""),
    "JR": ("Judicial review – refusal handled by us", "Judicial Review", 2500, {}, [],
           "Full amount at signing. Federal Court work is done with PAX Law."),
    "JR-REPEAT": ("Judicial review – second time on the same file", "Judicial Review دوم", 2000,
                  {}, [], "Full amount at signing. Federal Court work is done with PAX Law."),
    "JR-EXT": ("Judicial review – refusal not handled by us", "Judicial Review خارجی", 3500, {},
               [], "Full amount at signing (2,500 PAX Law + 1,000 SugimotoVisa)."),
    "MANDAMUS": ("Mandamus (delay litigation)", "مانداموس", 2500, {}, [],
                 "Stage 1: 750 CAD – demand letter. Stage 2: 1,750 CAD – Federal Court filing."),
    "PR-RO": ("PR residency obligation", "PR: Residency Obligation", 6000, {}, [],
              "Full amount at signing."),
    "PFL": ("Procedural fairness letter response", "پاسخ به PFL", 2500, {}, [],
            "Full amount at signing. Fixed at 3,000–5,000 CAD after reviewing the letter; "
            "payment plan available."),
    "HC": ("Humanitarian & compassionate (in Canada)", "روش بشر دوستانه H&C", 6500, {}, [],
           "2,000 CAD at signing, 2,000 CAD after 3 months, 1,500 CAD after 6 months. "
           "Delivered by Parsay; coordinate with Mr Hossein."),
    "REF": ("Refugee claim – without hearing", "پناهندگی بدون دادگاه", 4500, {}, [],
            "3,000 CAD at signing, 1,500 CAD after submission. Delivered by Parsay."),
    "REF-HEAR": ("Refugee claim – with hearing", "پناهندگی با دادگاه", 6500, {}, [],
                 "3,000 CAD at signing, 1,500 CAD after submission, 2,000 CAD after the hearing "
                 "notice. Delivered by Parsay."),
    "LMIA": ("LMIA with employer", "قرارداد LMIA", 4000, {}, ["GOV-LMIA"],
             "Full LMIA amount at signing. Work-permit contract starts after LMIA is issued."),
    "LMIA-WP": ("Work permit under LMIA", "ورک پرمیت LMIA", 2500,
                {"Spouse work permit": 1000, "Child visitor visa (each)": 500}, [],
                "50% at signing, 50% before submission to IRCC. Government fees extra."),
    "SPON-SPOUSE": ("Spousal / common-law sponsorship", "اسپانسرشیپ همسر", 4000, {}, [],
                    "50% at signing, 50% before submission. Or 4 monthly instalments of 1,000 CAD."),
    "SPON-CHILD": ("Child sponsorship", "اسپانسرشیپ فرزند", 4000, {}, [],
                   "50% at signing, 50% before submission."),
    "SPON-PARENT": ("Parent sponsorship", "اسپانسرشیپ والدین", 5000,
                    {"Second parent": 2000}, [],
                    "50% at signing, 50% before submission."),
    "SPON-REFUSED": ("Refused sponsorship", "رد شدن اسپانسرشیپ", 10000, {}, [], ""),
    "PROV-CERT": ("Provincial certification – specific occupations", "تایید استانی مشاغل خاص",
                  2000, {}, [], ""),
    "TD-REF": ("Travel document – refugee", "تراول داکیومنت Refugee", 2000, {}, [], ""),
    "TD-PR": ("Travel document – PR", "تراول داکیومنت PR", 0, {}, [],
              "Price not set in the price list."),
    "DETENTION": ("Immigration / border detention", "بازداشت مهاجرتی", 3000, {}, [],
                  "3,000–9,000 CAD depending on the case; quote per file."),
    "PRRA": ("Pre-removal risk assessment", "PRRA", 3000, {}, [],
             "3,000–9,000 CAD depending on the case; quote per file."),
}


def build():
    out = {"_gov": {k: {"name": n, "price": p} for k, (n, p) in GOV.items()}}
    for key, (en, fa, price, addons, gov, terms) in SERVICES.items():
        out[key] = {
            "name": f"{en} · {fa}",
            "price": price,
            "addons": addons,
            "gov": gov,
            "terms": terms,
            "template": True,
        }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {OUT} with {len(SERVICES)} services and {len(GOV)} government fees")


if __name__ == "__main__":
    build()
