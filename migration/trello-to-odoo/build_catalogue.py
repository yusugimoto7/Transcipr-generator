"""Build products.json (the Odoo catalogue) from pricelist_data.py.

Services carry their currency (CAD or EUR); Odoo gets one pricelist per currency.
"""

import json
import pathlib

from pricelist_data import GOV, PLANS, SERVICES

OUT = pathlib.Path(__file__).resolve().parent / "products.json"


def _kind(key, s):
    """Agreement template (product tag) for a service."""
    cat = s.get("cat")
    if key == "CUSTOM":
        return ""
    if key == "PFL":
        return "PFL"
    if key == "EU-SUV":
        return "SB-C"
    if cat == "eu":
        return "SB-A"
    if cat == "spon":
        return "SPON"
    if cat in ("pr", "lit") or key == "PROV-CERT":
        return "PR"
    if cat == "biz":
        return "ENT"
    return "TR"


def build():
    out = {"_gov": {k: {"name": f"{en} · {fa}", "price": p} for k, (en, fa, p) in GOV.items()}}
    for key, s in SERVICES.items():
        entry = {
            "name": f"{s['en']} · {s['fa']}",
            "price": s.get("price", 0),
            "currency": s.get("currency", "CAD"),
            "contract": _kind(key, s),
            "addons": {label.split("|")[0]: price for label, price in s.get("addons", {}).items()},
            "gov": s.get("gov", []),
            "terms": "\n".join(t for t in (s.get("terms_en"), s.get("terms_fa")) if t),
            "template": True,
            "plan": ";".join(f"{sh}:{amt}:{due}" for sh, amt, due in PLANS.get(key, [])),
        }
        if s.get("components"):
            entry["components"] = [{"code": c, "name": f"{en} · {fa}", "price": p,
                                    "contract": "ENT" if c.endswith("-SV") else ("SB-E" if key.startswith("AB") else "SB-D")}
                                   for c, en, fa, p in s["components"]]
        out[key] = entry
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    eur = sum(1 for k, v in out.items() if not k.startswith("_") and v["currency"] == "EUR")
    print(f"wrote {OUT}: {len(out) - 1} services ({eur} in EUR), {len(GOV)} government fees")


if __name__ == "__main__":
    build()
