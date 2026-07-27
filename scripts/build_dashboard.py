#!/usr/bin/env python3
"""Rebuild the embedded data in dashboard/index.html from the leads spreadsheet.

    python3 scripts/build_dashboard.py leads.xlsx

`leads.xlsx` is the "Specific Access/Site-Assessments Leads" sheet exported as
xlsx (File -> Download -> Microsoft Excel, or the Drive API with
exportMimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet).
Do NOT use Drive's plain-text export: it silently truncates large sheets to a few
dozen rows per tab, which is how the first version of this dashboard ended up
reporting 243 leads instead of 11,000.

The script reads the first three tabs, de-duplicates, drops test rows, packs every
field into base36 columns and rewrites the `const PACK = {...};` line in
dashboard/index.html. Nothing else in that file is touched.
"""
import base64
import datetime
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

try:
    import openpyxl
except ImportError:
    sys.exit("openpyxl is required:  pip install openpyxl")

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "dashboard" / "index.html"

# ---------------------------------------------------------------- field mapping
C_NAME, C_DATE, C_AGE = "Name & Surname", "Created At", "سن شما"
C_DEST, C_METHOD, C_EDU = "مقصد مهاجرت", "روش مهاجرت", "آخرین مقطع تحصیلی؟"
C_FIELD, C_EMPLOYED, C_LANG = "رشته آخرین مقطع تحصیلی", "مشغول به کار", "سطح زبان"
C_MEETING, C_CHANNEL = "جلسه حضوری", "از چه طریقی با ما آشنا شدید؟"

FIELD_GROUPS = {
    "Engineering & tech": ["کامپیوتر", "مهندس", "برق", "مکانیک", "عمران", "نرم", "IT", "صنایع",
                            "فناوری", "رباتیک", "معدن", "پلیمر", "هوافضا", "ساخت", "نقشه",
                            "مخابرات", "متالورژ", "نفت"],
    "Business & finance": ["حسابدار", "مدیریت", "بازرگانی", "MBA", "اقتصاد", "بیمه", "بازاریابی",
                            "مالی", "بانک", "صنعتی"],
    "Health & medicine": ["پزشک", "پرستار", "دندان", "دارو", "بهداشت", "مامایی", "رادیولوژی",
                           "تغذیه", "فیزیوتراپ", "بینایی", "اتاق عمل", "هوشبری", "ماما"],
    "Arts & design": ["معماری", "گرافیک", "طراحی", "هنر", "موسیقی", "نقاش", "عکاس", "دوخت",
                       "پارچه", "صنایع دستی", "سینما", "انیمیشن"],
    "Law & social sciences": ["حقوق", "روانشناس", "علوم اجتماعی", "جامعه", "مشاوره", "تربیت",
                               "آموزش", "ادبیات", "زبان", "الهیات", "تاریخ", "سیاسی", "جغراف",
                               "انسانی", "حسابرس"],
    "Science & math": ["ریاضی", "فیزیک", "زیست", "آمار", "شیمی", "زمین", "تجربی", "میکروب",
                        "ژنتیک", "بیوتک"],
    "Trades & services": ["تراشکار", "جوشکار", "آشپز", "برقکار", "خدمات", "ورزش", "کشاورزی",
                           "دامپرور", "هتلدار", "گردشگری", "آرایش", "خیاط", "جوشک"],
}


def cell(v):
    if v is None:
        return ""
    if hasattr(v, "strftime"):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def norm_date(d):
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
        return d
    m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{4})", d)  # a few rows are US-format text
    return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else ""


def is_test(r):
    email = r.get("Email", "").lower()
    name = r.get(C_NAME, "").strip().lower()
    local = email.split("@")[0]
    if re.search(r"@(king|tri|eldrugstore)\.com$", email):
        return True
    if local in ("test", "tests", "testtest"):
        return True
    if re.fullmatch(r"(test|tset|testt)(\s.*|\d*)", name) or "budjet" in name:
        return True
    return False


def field_group(s):
    if not s or s.strip("-. ") == "":
        return ""
    for group, keywords in FIELD_GROUPS.items():
        if any(k in s for k in keywords):
            return group
    return "Other / unspecified"


def source_group(s):
    s = s.lower()
    if s.startswith("instagram"):
        return "Instagram"
    if "google" in s or s in ("site", "sem", "seo"):
        return "Site / Google"
    if "whatsapp" in s:
        return "WhatsApp"
    if "referral" in s or s == "ref":
        return "Referral"
    if "telegram" in s:
        return "Telegram"
    if "call" in s or "phone" in s:
        return "Phone"
    if "youtube" in s:
        return "YouTube"
    return "Untracked" if s in ("none", "") else "Other"


def referrer(v):
    if not v:
        return ""
    if " " in v or len(v) > 24:
        return "(website page title)"
    # the same affiliate is stored under two spellings; merge so credit is not split
    key = v.lower().replace("_", "-").replace(".", "-")
    return "mahdis-soltani" if key in ("mahdis-sultani", "mahdis-soltani") else v


def budget_currency(b):
    if "تومان" in b:
        return "toman"
    if "دلار" in b:
        return "CAD"
    if "یورو" in b:
        return "EUR"
    return ""


def as_int(s):
    try:
        return int(float(s))
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------- load & clean
def load(xlsx):
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    rows, tabs = [], []
    for ws in wb.worksheets[:3]:
        table = [[cell(c) for c in row] for row in ws.iter_rows(values_only=True)]
        table = [r for r in table if any(r)]
        header = {h: i for i, h in enumerate(table[0]) if h}
        for raw in table[1:]:
            rec = {h: (raw[i] if i < len(raw) else "") for h, i in header.items()}
            rec.pop("تاریخ دریافت مدرک تحصیلی", None)  # present on one tab only
            rec["_date"] = norm_date(rec.get(C_DATE, ""))
            rows.append(rec)
        tabs.append({"name": ws.title, "rows": len(table) - 1})
    return rows, tabs


def dedupe(rows):
    """Collapse rows repeated across tabs. The two dated tabs overlap for
    1 Jul - 4 Aug 2025 and the Main tab repeats rows from both."""
    seen, out = {}, []
    for r in rows:
        key = (r.get(C_NAME, ""), re.sub(r"\D", "", r.get("Mobile", "")),
               r.get("Email", "").lower(), r["_date"])
        if key in seen:
            prev = seen[key]
            if sum(1 for v in r.values() if v) > sum(1 for v in prev.values() if v):
                out[out.index(prev)] = r      # keep whichever copy is more complete
                seen[key] = r
            continue
        seen[key] = r
        out.append(r)
    return out


# ------------------------------------------------------------------------- packing
C36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def encode(nums):
    width, biggest = 1, max(nums) if nums else 0
    while 36 ** width <= biggest:
        width += 1
    chars = []
    for v in nums:
        s = ""
        for _ in range(width):
            s = C36[v % 36] + s
            v //= 36
        chars.append(s)
    return "".join(chars), width


def build_pack(recs, day0):
    base = datetime.date.fromisoformat(day0)
    cols, dicts = {}, {}

    def col(name, fn, fold_above=None):
        vals = [fn(r) for r in recs]
        if name in ("dt", "a"):
            cols[name] = vals
            return
        counts = Counter(v for v in vals if v != "")
        keys = [k for k, _ in counts.most_common()]
        if fold_above and len(keys) > fold_above:
            keep = keys[:fold_above]
            other = f"Other ({len(keys) - fold_above} values)"
            keys = keep + [other]
            keepset = set(keep)
            vals = [v if v == "" or v in keepset else other for v in vals]
        table = [""] + keys
        index = {k: i for i, k in enumerate(table)}
        dicts[name] = table
        cols[name] = [index[v] for v in vals]

    g = lambda r, k: (r.get(k) or "").strip()
    col("dt", lambda r: (datetime.date.fromisoformat(r["_date"]) - base).days)
    col("a", lambda r: (as_int(g(r, C_AGE)) or (17 if "کمتر از 18" in g(r, C_AGE) else 0)))
    col("de", lambda r: g(r, C_DEST))
    col("m", lambda r: g(r, C_METHOD))
    col("e", lambda r: g(r, C_EDU))
    col("fg", lambda r: field_group(g(r, C_FIELD)))
    col("l", lambda r: g(r, C_LANG))
    col("b", lambda r: g(r, "Budget"))
    col("t", lambda r: ("" if as_int(g(r, "Lead_Type")) is None else str(as_int(g(r, "Lead_Type")))))
    col("em", lambda r: g(r, C_EMPLOYED))
    col("ch", lambda r: g(r, C_CHANNEL).replace("\\/", "/"))
    col("sg", lambda r: source_group(g(r, "Source")))
    col("s", lambda r: g(r, "Source").replace("،", "").lower())
    col("md", lambda r: g(r, "Medium").lower(), fold_above=34)
    col("cp", lambda r: g(r, "Campaign"), fold_above=34)
    col("ct", lambda r: g(r, "Content"), fold_above=34)
    col("f", lambda r: g(r, "Form (ID)"))
    col("rf", lambda r: referrer(g(r, "utm_term/Referrer")), fold_above=34)
    col("nat", lambda r: "" if g(r, "Nationality") == "^newOptionTest" else g(r, "Nationality"))
    col("ip", lambda r: "1" if g(r, C_MEETING) else "0")
    col("od", lambda r: "1" if g(r, "added_to_odoo") else "0")
    col("se", lambda r: "1" if g(r, "sent_email") else "0")
    col("ss", lambda r: "1" if g(r, "sent_sms") else "0")

    pack = {"n": len(recs), "d0": day0, "cols": {}}
    for name, nums in cols.items():
        s, width = encode(nums)
        entry = {"w": width, "s": s}
        if name in dicts:
            entry["dict"] = dicts[name]
        pack["cols"][name] = entry
    return pack


def people_stats(recs):
    """Approximate unique people: normalised phone where usable, else email."""
    ids = []
    for r in recs:
        digits = re.sub(r"\D", "", r.get("Mobile", "")).lstrip("0")
        if len(digits) >= 9:
            ids.append(digits[-10:])
        elif r.get("Email"):
            ids.append("E:" + r["Email"].lower())
    counts = Counter(ids)
    repeat = {k: v for k, v in counts.items() if v > 1}
    return len(counts), len(repeat), sum(v - 1 for v in repeat.values())


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    raw, tabs = load(sys.argv[1])
    tests = [r for r in raw if is_test(r)]
    live = [r for r in raw if not is_test(r)]
    recs = dedupe(live)
    dated = sorted((r for r in recs if r["_date"]), key=lambda r: r["_date"])

    pack = build_pack(dated, dated[0]["_date"])
    people, repeat_people, extra_subs = people_stats(recs)
    # Every figure the page states in prose is carried here, so a rebuild can never
    # leave the narrative contradicting the charts.
    pack["meta"] = {
        "tabs": tabs,
        "rawRows": len(raw),
        "testRows": len(tests),
        "dupes": len(live) - len(recs),
        "unique": len(recs),
        "dated": len(dated),
        "noDate": len(recs) - len(dated),
        "people": people,
        "repeatPeople": repeat_people,
        "extraSubs": extra_subs,
        "usTextDates": sum(1 for r in raw
                           if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", r.get(C_DATE, ""))),
        "firstDate": dated[0]["_date"],
        "lastDate": dated[-1]["_date"],
        "built": datetime.date.today().isoformat(),
    }
    payload = json.dumps(pack, ensure_ascii=False, separators=(",", ":"))

    html = TARGET.read_text(encoding="utf-8")
    new, count = re.subn(r"const PACK = \{.*?\};", f"const PACK = {payload};",
                         html, count=1, flags=re.S)
    if count != 1:
        sys.exit("could not find the `const PACK = {...};` line in dashboard/index.html")
    TARGET.write_text(new, encoding="utf-8")

    months = Counter(r["_date"][:7] for r in dated)
    print(f"rows across first 3 tabs : {len(raw):,}")
    print(f"test rows dropped        : {len(tests)}")
    print(f"duplicate rows collapsed : {len(live) - len(recs):,}")
    print(f"unique submissions       : {len(recs):,}  ({len(dated):,} dated)")
    print(f"date range               : {dated[0]['_date']} -> {dated[-1]['_date']}")
    print(f"last 3 months            : "
          + ", ".join(f"{m} {n}" for m, n in sorted(months.items())[-3:]))
    print(f"embedded payload         : {len(payload) / 1024:.0f} KB")
    print(f"wrote                    : {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
