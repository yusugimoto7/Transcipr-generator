"""Sales tax by the client's location: GST/HST/QST per province, none abroad.

Every service product carries GST 5% as its default sale tax (the company
is in British Columbia). Fiscal positions, auto-applied from the customer's
country and province, swap that GST for the province's rate, or remove it
for customers outside Canada. Government-fee products carry no tax and are
never touched by the mapping.

Rates are the ones in force at the time of writing and must be confirmed
by the accountant; change PROVINCES and rerun `phase2 taxes` to update.
"""

import logging

log = logging.getLogger(__name__)

GST = ("GST", 5.0)
# province code -> list of (tax name, rate). BC/AB/SK/MB/territories: GST
# only (PST/RST does not apply to immigration consulting services).
PROVINCES = {
    "ON": [("HST", 13.0)],
    "NB": [("HST", 15.0)],
    "NL": [("HST", 15.0)],
    "PE": [("HST", 15.0)],
    "NS": [("HST", 14.0)],
    "QC": [GST, ("QST", 9.975)],
}
GOV_PREFIX = "GOV-"


def _tax(odoo, company_id, country_id, name, rate):
    key = f"{company_id}-{name}-{rate}"
    label = f"{name} {rate:g}%"
    group_id, _ = odoo.upsert("p2taxgrp", f"{company_id}-{name}", "account.tax.group",
                              {"name": name, "company_id": company_id, "country_id": country_id})
    tax_id, created = odoo.upsert("p2tax", key, "account.tax", {
        "name": label, "amount": rate, "amount_type": "percent", "type_tax_use": "sale",
        "company_id": company_id, "country_id": country_id, "description": label, "active": True,
        "tax_group_id": group_id,
    })
    if created:
        log.info("  tax %s created for company %s", label, company_id)
    return tax_id


def _ensure_accountant(odoo):
    """Creating taxes needs the Accountant group; give it to the migration user."""
    rows = odoo.search_read("ir.model.data", [("module", "=", "account"), ("name", "=", "group_account_manager")],
                            ["res_id"], limit=1)
    if rows:
        odoo.execute("res.users", "write", [odoo.uid], {"groups_id": [(4, rows[0]["res_id"])]})


def install(odoo):
    _ensure_accountant(odoo)
    canada = odoo.search_read("res.country", [("code", "=", "CA")], ["id"], limit=1)[0]["id"]
    states = {s["code"]: s["id"] for s in odoo.search_read(
        "res.country.state", [("country_id", "=", canada)], ["code"])}
    others = [c["id"] for c in odoo.search_read("res.country", [("id", "!=", canada)], ["id"])]
    group_id, _ = odoo.upsert("p2cgroup", "row", "res.country.group",
                              {"name": "Outside Canada", "country_ids": [(6, 0, others)]})

    gst_ids = []
    for company in odoo.search_read("res.company", [], ["id", "name"]):
        cid = company["id"]
        gst = _tax(odoo, cid, canada, *GST)
        gst_ids.append(gst)
        seq = 1
        for code, taxes in PROVINCES.items():
            if code not in states:
                continue
            dest = [_tax(odoo, cid, canada, n, r) for n, r in taxes]
            fp_id = odoo.ref("p2fpos", f"{cid}-{code}")
            vals = {"name": f"{code} – {' + '.join(f'{n} {r:g}%' for n, r in taxes)}",
                    "company_id": cid, "auto_apply": True, "country_id": canada,
                    "state_ids": [(6, 0, [states[code]])], "sequence": seq}
            if fp_id:
                odoo.write("account.fiscal.position", [fp_id], vals)
                old = odoo.search_read("account.fiscal.position.tax", [("position_id", "=", fp_id)], ["id"])
                if old:
                    odoo.execute("account.fiscal.position.tax", "unlink", [o["id"] for o in old])
            else:
                fp_id, _ = odoo.upsert("p2fpos", f"{cid}-{code}", "account.fiscal.position", vals)
            for d in dest:
                odoo.execute("account.fiscal.position.tax", "create",
                             {"position_id": fp_id, "tax_src_id": gst, "tax_dest_id": d})
            seq += 1
        # Outside Canada: GST mapped to nothing.
        vals = {"name": "Outside Canada – no tax", "company_id": cid, "auto_apply": True,
                "country_group_id": group_id, "sequence": 50}
        fp_id = odoo.ref("p2fpos", f"{cid}-ROW")
        if fp_id:
            odoo.write("account.fiscal.position", [fp_id], vals)
            old = odoo.search_read("account.fiscal.position.tax", [("position_id", "=", fp_id)], ["id"])
            if old:
                odoo.execute("account.fiscal.position.tax", "unlink", [o["id"] for o in old])
        else:
            fp_id, _ = odoo.upsert("p2fpos", f"{cid}-ROW", "account.fiscal.position", vals)
        odoo.execute("account.fiscal.position.tax", "create",
                     {"position_id": fp_id, "tax_src_id": gst, "tax_dest_id": False})
        log.info("  fiscal positions ready for %s", company["name"])

    # Default tax on the migration's service products; none on its government fees.
    mine = [r["res_id"] for r in odoo.search_read(
        "ir.model.data", [("module", "=", "__trello__"), ("model", "=", "product.template")], ["res_id"])]
    services = odoo.search_read("product.template", [("id", "in", mine), "|", ("default_code", "=", False),
                                                     ("default_code", "not like", GOV_PREFIX)], ["id"])
    if services:
        odoo.write("product.template", [p["id"] for p in services], {"taxes_id": [(6, 0, gst_ids)]})
    gov = odoo.search_read("product.template", [("id", "in", mine), ("default_code", "like", GOV_PREFIX)], ["id"])
    if gov:
        odoo.write("product.template", [p["id"] for p in gov], {"taxes_id": [(5, 0, 0)]})
    log.info("  GST 5%% set on %d service products, no tax on %d government fees",
             len(services), len(gov))
    return gst_ids
