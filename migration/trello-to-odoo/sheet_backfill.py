"""Professional fees from the finance sheets onto the CRM cards.

The two finance sheets are the ledger of every contract the companies have
sent: Finance - Sugimoto Visa (tab "ALL Numbers") and Contracts - SparkBridge
(tab "Customer Info"). This reads both, finds the CRM card each contract
belongs to, and prepares one write per card: contract numbers, professional
fee per company (never government fees), currency, status as the sheet's
Status column says it, and the sent / signed / paid dates.

A contract with no card gets a card, archived, in the stage its status
implies, so the history is complete for reporting.

Two passes: `plan()` builds everything and writes a review workbook without
touching Odoo; `apply()` writes what the review showed. Cards that already
carry a quotation are left alone - the quotation owns their numbers.
"""

import collections
import datetime
import logging
import re
import unicodedata
import warnings

from openpyxl import Workbook, load_workbook

from odoo_client import OdooError

log = logging.getLogger(__name__)
warnings.filterwarnings("ignore")

SG_TAB = ("SG_live.xlsx", "ALL Numbers")
SB_TAB = ("SB_live.xlsx", "Customer Info")

EU_COUNTRIES = {"netherland", "netherlands", "germany", "finland", "france", "europe", "austria", "estonia",
                "england", "hungary", "spain", "greece", "portugal", "italy", "belgium", "sweden", "denmark",
                "ireland", "poland", "czech", "latvia", "lithuania", "malta", "cyprus", "luxembourg", "uk",
                "united kingdom", "switzerland", "norway", "slovakia", "slovenia", "croatia", "romania", "bulgaria"}

STATUS_MAP = {
    "draft sent": "draft_sent", "contract sent": "sent", "only signed": "signed",
    "signed and paid": "paid", "signed & paid": "paid", "only paid": "paid_only",
    "signed & partially paid": "signed_partial", "signed and partially paid": "signed_partial",
    "termination": "terminated", "terminated": "terminated", "other": "other",
}
STATUS_RANK = {"other": 0, "draft_sent": 1, "sent": 2, "signed": 3, "paid_only": 3, "signed_partial": 4,
               "paid": 5, "terminated": 6}
# Stage a card is created in when the contract has no card yet.
STATUS_STAGE = {"draft_sent": 41, "sent": 45, "signed": 14, "signed_partial": 25, "paid_only": 25,
                "paid": 17, "terminated": 46, "other": 45}
WON_STAGE = 17

FILE_NO = re.compile(r"\b(S[GB]?[A-Z]*\d{5,9}|C\d{4}|S\d\d-C\d{4})\b", re.I)


def norm_name(s):
    s = unicodedata.normalize("NFKD", str(s or "")).lower()
    return re.sub(r"[^a-z]", "", s)


def phone_key(s):
    d = re.sub(r"\D", "", str(s or ""))
    return d[-10:] if len(d) >= 10 else ""


def money(v):
    """Sheet cell -> float or None; '$3,600' style strings are read, junk is not."""
    if v in (None, "", False):
        return None
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", "").replace("،", "").replace("$", "").replace("€", "").replace("CAD", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def as_date(v):
    if isinstance(v, datetime.datetime):
        return v.date()
    if isinstance(v, datetime.date):
        return v
    if isinstance(v, str):
        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d"):
            try:
                return datetime.datetime.strptime(v.strip()[:10], fmt).date()
            except ValueError:
                pass
    return None


def read_tab(path, tab):
    ws = load_workbook(path, read_only=True, data_only=True)[tab]
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(c).strip() if c is not None else "" for c in rows[0]]
    out = []
    for i, r in enumerate(rows[1:], start=2):
        if any(c not in (None, "") for c in r):
            d = dict(zip(hdr, r))
            d["_row"] = i
            out.append(d)
    return out


def sheet_status(raw, signed, paid, issued):
    key = str(raw or "").strip().lower()
    if key in STATUS_MAP:
        return STATUS_MAP[key], False
    # No usable status: read it off the dates, and say so.
    if paid:
        return "paid", True
    if signed:
        return "signed", True
    if issued:
        return "sent", True
    return "other", True


def sg_contracts(path):
    out = []
    for r in read_tab(path, SG_TAB[1]):
        no = str(r.get("Contract No.") or "").strip().upper()
        if not no:
            continue
        fee = money(r.get("Sugimoto professional Fee"))
        fee_src = "Sugimoto professional Fee"
        if fee is None:
            fee = money(r.get("Professional Fees"))
            fee_src = "Professional Fees"
        issued, signed, paid = as_date(r.get("issued day")), as_date(r.get("Signed Date")), as_date(r.get("Paid Date"))
        status, derived = sheet_status(r.get("Status"), signed, paid, issued)
        name = " ".join(str(r.get(c) or "").strip() for c in ("Name", "Family Name")).strip()
        out.append(dict(
            company="sg", row=r["_row"], no_sg=no, no_sb="", name=name or str(r.get("contract Name") or "").strip(),
            email=str(r.get("Email") or "").strip().lower(), phone=phone_key(r.get("Phone No.")),
            fee_sg=fee, fee_sb=None, fee_src=fee_src, fee_raw=r.get("Sugimoto professional Fee"),
            currency="CAD", status=status, status_raw=str(r.get("Status") or ""), status_derived=derived,
            issued=issued, signed=signed, paid=paid, agent=str(r.get("1St Agent") or "").strip(),
            kind=str(r.get("Type") or "").strip(), rcic=str(r.get("RCIC") or "").strip()))
    return out


def sb_contracts(path):
    out = []
    for r in read_tab(path, SB_TAB[1]):
        no = str(r.get("Contract No.") or "").strip().upper()
        if not no:
            continue
        country = str(r.get("Country") or "").strip().lower()
        kind = str(r.get("Type") or "").strip()
        eu = country in EU_COUNTRIES or "eu" in kind.lower().split("-")[-1].strip().split() or any(
            k in kind.lower() for k in ("netherland", "finland", "ausbildung", "blue", "spain", "greece", "fip", "dn -"))
        fee_sb = money(r.get("Spark professional Fee"))
        fee_sg = money(r.get("Sugimoto professional Fee"))
        no_sg = str(r.get("Sugimoto No.") or "").strip().upper()
        issued, signed, paid = as_date(r.get("Issued Date")), as_date(r.get("Signed Date")), as_date(r.get("Paid Date"))
        status, derived = sheet_status(r.get("Status"), signed, paid, issued)
        out.append(dict(
            company="sb", row=r["_row"], no_sg=no_sg, no_sb=no, name=str(r.get("Name") or "").strip(),
            email=str(r.get("Email") or "").strip().lower(), phone=phone_key(r.get("Phone No.")),
            fee_sg=fee_sg, fee_sb=fee_sb, fee_src="Spark professional Fee", fee_raw=r.get("Spark professional Fee"),
            currency="EUR" if eu else "CAD", status=status, status_raw=str(r.get("Status") or ""), status_derived=derived,
            issued=issued, signed=signed, paid=paid, agent=str(r.get("First Agent") or "").strip(),
            kind=kind, rcic=str(r.get("RCIC") or "").strip(), country=str(r.get("Country") or "").strip()))
    return out


class Index:
    """Every opportunity, indexed the ways a sheet row can name it."""

    def __init__(self, odoo):
        fields = ["name", "email_from", "phone", "mobile", "stage_id", "active", "order_ids",
                  "x_contract_order_id", "x_fee_sg", "x_fee_sb", "x_fee_source", "x_contract_no_sg", "x_contract_no_sb",
                  "x_studio_contract_value", "user_id", "partner_id"]
        have = odoo.fields("crm.lead")
        fields = [f for f in fields if f in have]
        self.leads = {l["id"]: l for l in odoo.search_read("crm.lead", [("type", "=", "opportunity")], fields,
                                                            context={"active_test": False})}
        for l in self.leads.values():
            for f in ("x_contract_order_id", "x_fee_sg", "x_fee_sb", "x_fee_source", "x_contract_no_sg",
                      "x_contract_no_sb", "x_studio_contract_value"):
                l.setdefault(f, False)
        self.by_no, self.by_email, self.by_phone, self.by_name = (collections.defaultdict(list) for _ in range(4))
        for l in self.leads.values():
            for m in FILE_NO.findall(l["name"] or ""):
                self.by_no[m.upper()].append(l["id"])
            if l["email_from"]:
                self.by_email[l["email_from"].strip().lower()].append(l["id"])
            for ph in (l["phone"], l["mobile"]):
                k = phone_key(ph)
                if k:
                    self.by_phone[k].append(l["id"])
            nm = norm_name(FILE_NO.sub("", l["name"] or "").strip(" -"))
            if len(nm) >= 6:
                self.by_name[nm].append(l["id"])

    def find(self, c):
        """(lead_id, tier) or (None, reason)."""
        for no in (c["no_sb"], c["no_sg"]):
            if no and self.by_no.get(no):
                ids = self.by_no[no]
                return (self._prefer(ids), "contract no" if len(ids) == 1 else "contract no (several cards, newest)")
        if c["email"] and self.by_email.get(c["email"]):
            return self._prefer(self.by_email[c["email"]]), "email"
        if c["phone"] and self.by_phone.get(c["phone"]):
            return self._prefer(self.by_phone[c["phone"]]), "phone"
        nm = norm_name(c["name"])
        if len(nm) >= 6 and self.by_name.get(nm):
            ids = self.by_name[nm]
            if len(ids) > 1:
                return None, "name matches %d cards - decide by hand" % len(ids)
            return ids[0], "name"
        return None, "no card"

    def _prefer(self, ids):
        # Several cards for one person: the one that is furthest along, then newest.
        def key(i):
            l = self.leads[i]
            return (l["stage_id"][0] == WON_STAGE, l["active"], i)
        return sorted(ids, key=key)[-1]


def merge(rows):
    """Several sheet rows for one card -> one set of values (best of each)."""
    v = dict(no_sg="", no_sb="", fee_sg=None, fee_sb=None, currency="CAD", status="other",
             sent=None, signed=None, paid=None, sources=[], agent="", name="", kind="")
    for c in sorted(rows, key=lambda c: (c["issued"] or datetime.date.min)):
        v["no_sg"] = c["no_sg"] or v["no_sg"]
        v["no_sb"] = c["no_sb"] or v["no_sb"]
        if c["fee_sg"] is not None:
            v["fee_sg"] = c["fee_sg"]
        if c["fee_sb"] is not None:
            v["fee_sb"] = c["fee_sb"]
        if c["currency"] == "EUR":
            v["currency"] = "EUR"
        if STATUS_RANK[c["status"]] >= STATUS_RANK[v["status"]]:
            v["status"] = c["status"]
        for k, src in (("sent", "issued"), ("signed", "signed"), ("paid", "paid")):
            if c[src] and (v[k] is None or c[src] < v[k]):
                v[k] = c[src]
        v["sources"].append("%s row %d" % (c["company"].upper(), c["row"]))
        v["agent"] = v["agent"] or c["agent"]
        v["name"] = v["name"] or c["name"]
        v["kind"] = v["kind"] or c["kind"]
    return v


def plan(odoo, sg_path, sb_path):
    contracts = sg_contracts(sg_path) + sb_contracts(sb_path)
    idx = Index(odoo)
    per_lead = collections.defaultdict(list)
    unmatched, manual = [], []
    for c in contracts:
        lid, how = idx.find(c)
        c["how"] = how
        if lid:
            per_lead[lid].append(c)
        elif how.startswith("name matches"):
            manual.append(c)
        else:
            unmatched.append(c)
    writes, conflicts = [], []
    for lid, rows in per_lead.items():
        lead = idx.leads[lid]
        v = merge(rows)
        v["lead_id"], v["lead_name"], v["stage"] = lid, lead["name"], lead["stage_id"][1] if lead["stage_id"] else ""
        v["hows"] = sorted(set(c["how"] for c in rows))
        if lead["x_contract_order_id"] or lead["order_ids"]:
            v["why"] = "card has a quotation - quotation owns the numbers"
            conflicts.append(v)
            continue
        old = lead["x_studio_contract_value"] or 0.0
        new = (v["fee_sg"] or 0.0) + (v["fee_sb"] or 0.0)
        v["trello_value"] = old
        v["note"] = ""
        if old and new and abs(old - new) / max(old, new) > 0.10:
            v["note"] = "Trello contract value %.0f differs from sheet %.0f" % (old, new)
        writes.append(v)
    # Contracts with no card: group by person so an entrepreneur pair becomes one card.
    creates = []
    by_person = collections.defaultdict(list)
    for c in unmatched:
        key = c["no_sg"] or c["no_sb"]
        # a Sparkbridge row naming its Sugimoto number joins the Sugimoto row
        by_person[key].append(c)
    merged_keys = set()
    for key, rows in list(by_person.items()):
        for c in rows:
            if c["company"] == "sb" and c["no_sg"] and c["no_sg"] in by_person and c["no_sg"] != key:
                by_person[c["no_sg"]].append(c)
                merged_keys.add(key)
    for key, rows in by_person.items():
        if key in merged_keys:
            continue
        v = merge(rows)
        v["stage_id"] = STATUS_STAGE[v["status"]]
        v["email"] = next((c["email"] for c in rows if c["email"]), "")
        v["phone"] = next((c["phone"] for c in rows if c["phone"]), "")
        creates.append(v)
    junk = [c for c in contracts if c["fee_sg"] is None and c["fee_sb"] is None]
    return dict(contracts=contracts, writes=writes, conflicts=conflicts, creates=creates, manual=manual, junk=junk)


def review_workbook(p, path):
    wb = Workbook()
    ws = wb.active
    ws.title = "Summary"
    tot = collections.Counter()
    for c in p["contracts"]:
        tot[(c["company"], c["how"].split(" (")[0])] += 1
    ws.append(["What", "Count"])
    ws.append(["Sheet contracts read", len(p["contracts"])])
    ws.append(["  Sugimoto (ALL Numbers)", sum(1 for c in p["contracts"] if c["company"] == "sg")])
    ws.append(["  Sparkbridge (Customer Info)", sum(1 for c in p["contracts"] if c["company"] == "sb")])
    ws.append([])
    ws.append(["Cards that will be UPDATED (tab Update)", len(p["writes"])])
    ws.append(["Cards that will be CREATED, archived (tab Create)", len(p["creates"])])
    ws.append(["Left alone - card has an Odoo quotation (tab Conflicts)", len(p["conflicts"])])
    ws.append(["Need a human: name matches several cards (tab Manual)", len(p["manual"])])
    ws.append(["Rows with no readable professional fee (tab No fee)", len(p["junk"])])
    ws.append([])
    ws.append(["How rows were matched", "Sugimoto", "Sparkbridge"])
    for how in ("contract no", "email", "phone", "name", "no card"):
        ws.append([how, tot[("sg", how)], tot[("sb", how)]])
    ws.append([])
    ws.append(["Professional fees that will land in Odoo (sheet total, CAD / EUR)"])
    ws.append(["Company", "Currency", "Year of contract", "Contracts", "Professional fee"])
    agg = collections.defaultdict(lambda: [0, 0.0])
    for v in p["writes"] + p["creates"]:
        d = v["sent"] or v["signed"] or v["paid"]
        yr = d.year if d and 2015 <= d.year <= 2030 else ("bad date %s" % d if d else "no date")
        if v["fee_sg"]:
            a = agg[("Sugimoto", v["currency"], yr)]; a[0] += 1; a[1] += v["fee_sg"]
        if v["fee_sb"]:
            a = agg[("Sparkbridge", v["currency"], yr)]; a[0] += 1; a[1] += v["fee_sb"]
    for k in sorted(agg, key=lambda k: (k[0], k[1], str(k[2]))):
        ws.append([k[0], k[1], k[2], agg[k][0], round(agg[k][1], 2)])
    ws.append([])
    ws.append(["Check: Sparkbridge SUV-Canada rows carry 50,000-90,000 per contract and are treated as CAD; "
               "confirm that is the right currency."])

    def sheet(name, cols, rows):
        w = wb.create_sheet(name)
        w.append(cols)
        for r in rows:
            w.append([r.get(c) if not isinstance(r.get(c), (list, tuple)) else ", ".join(r.get(c)) for c in cols])
        w.freeze_panes = "A2"

    sheet("Update", ["lead_id", "lead_name", "stage", "hows", "sources", "no_sg", "no_sb", "fee_sg", "fee_sb", "currency",
                     "status", "sent", "signed", "paid", "trello_value", "note"], p["writes"])
    sheet("Create", ["name", "kind", "agent", "sources", "no_sg", "no_sb", "fee_sg", "fee_sb", "currency", "status",
                     "stage_id", "sent", "signed", "paid", "email", "phone"], p["creates"])
    sheet("Conflicts", ["lead_id", "lead_name", "stage", "why", "sources", "no_sg", "no_sb", "fee_sg", "fee_sb", "status"], p["conflicts"])
    sheet("Manual", ["company", "row", "no_sg", "no_sb", "name", "email", "how", "fee_sg", "fee_sb", "status_raw"], p["manual"])
    sheet("No fee", ["company", "row", "no_sg", "no_sb", "name", "fee_raw", "status_raw", "how"], p["junk"])
    wb.save(path)
    return path


def _user_by_name(odoo):
    users = odoo.search_read("res.users", [("share", "=", False)], ["name"], context={"active_test": False})
    return {norm_name(u["name"]): u["id"] for u in users}


def apply(odoo, p, create=True):
    """Write the plan. Returns (updated, created)."""
    users = _user_by_name(odoo)
    n_up = 0
    for v in p["writes"]:
        vals = {"x_fee_sg": v["fee_sg"] or 0.0, "x_fee_sb": v["fee_sb"] or 0.0,
                "x_fee_total": round((v["fee_sg"] or 0.0) + (v["fee_sb"] or 0.0), 2),
                "x_fee_currency": v["currency"], "x_fee_source": "sheet", "x_contract_status": v["status"],
                "x_contract_no_sg": v["no_sg"] or False, "x_contract_no_sb": v["no_sb"] or False,
                "x_contract_sent_on": v["sent"] and v["sent"].isoformat() or False,
                "x_contract_signed_on": v["signed"] and v["signed"].isoformat() or False,
                "x_contract_paid_on": v["paid"] and v["paid"].isoformat() or False}
        if v["currency"] == "CAD":
            vals["expected_revenue"] = vals["x_fee_total"]
        try:
            odoo.write("crm.lead", [v["lead_id"]], vals)
            n_up += 1
        except OdooError as exc:
            log.warning("  lead %s: %s", v["lead_id"], str(exc)[-160:])
    n_new = 0
    if create:
        for v in p["creates"]:
            no = v["no_sg"] or v["no_sb"]
            vals = {"name": "%s - %s" % (no, v["name"]) if v["name"] else no, "type": "opportunity",
                    "company_id": 1, "active": False, "stage_id": v["stage_id"],
                    "email_from": v["email"] or False, "phone": v["phone"] or False,
                    "x_fee_sg": v["fee_sg"] or 0.0, "x_fee_sb": v["fee_sb"] or 0.0,
                    "x_fee_total": round((v["fee_sg"] or 0.0) + (v["fee_sb"] or 0.0), 2),
                    "x_fee_currency": v["currency"], "x_fee_source": "sheet", "x_contract_status": v["status"],
                    "x_contract_no_sg": v["no_sg"] or False, "x_contract_no_sb": v["no_sb"] or False,
                    "x_contract_sent_on": v["sent"] and v["sent"].isoformat() or False,
                    "x_contract_signed_on": v["signed"] and v["signed"].isoformat() or False,
                    "x_contract_paid_on": v["paid"] and v["paid"].isoformat() or False,
                    "description": "Created from the finance sheet (%s); no CRM card existed for this contract." % ", ".join(v["sources"])}
            uid = users.get(norm_name(v["agent"]))
            if uid:
                vals["user_id"] = uid
            if v["currency"] == "CAD":
                vals["expected_revenue"] = vals["x_fee_total"]
            if v["stage_id"] == WON_STAGE and v["paid"]:
                vals["date_closed"] = v["paid"].isoformat()
            try:
                odoo.create("crm.lead", vals, context={"mail_create_nolog": True, "mail_notrack": True, "tracking_disable": True})
                n_new += 1
            except OdooError as exc:
                log.warning("  create %s: %s", no, str(exc)[-160:])
    log.info("  updated %d cards, created %d", n_up, n_new)
    return n_up, n_new
