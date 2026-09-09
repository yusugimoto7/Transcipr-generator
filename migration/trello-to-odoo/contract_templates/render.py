"""Push the sample archs to the Odoo TEST database, render them to PDF server-side, pull them back."""
import os, sys, base64, pathlib, time
SAMPLES = pathlib.Path(__file__).parent
sys.path.insert(0, str(SAMPLES)); sys.path.insert(0, "/home/user/Transcipr-generator/migration/trello-to-odoo")
os.chdir("/home/user/Transcipr-generator/migration/trello-to-odoo")
from dotenv import load_dotenv; load_dotenv(".env")
from odoo_client import Odoo
import lib
URL = os.environ["ODOO_URL"].rstrip("/")
o = Odoo(URL, "test", os.environ["ODOO_USERNAME"], os.environ["ODOO_PASSWORD__TEST"]); o.login()
OUT = SAMPLES / "out"; OUT.mkdir(exist_ok=True)

# company logos from the test DB
for cid, code in ((1, "SG"), (2, "SB")):
    c = o.search_read("res.company", [("id", "=", cid)], ["logo_web"])[0]
    lg = c["logo_web"]
    if lg and code == "SG":   # test DB has only the placeholder logo for Sparkbridge -> use the wordmark
        lib.COMPANY[code]["logo"] = lg
        lib.COMPANY[code]["logo_fmt"] = "jpeg" if lg.startswith("/9j/") else "png"

import build
only = sys.argv[1:] or list(build.DOCS)
# US Letter paper format for the contract reports (rule 2)
pf = o.search_read("report.paperformat", [("name", "=", "Contracts - US Letter")], ["id"])
pf_vals = {"name": "Contracts - US Letter", "format": "Letter", "orientation": "Portrait", "margin_top": 30, "margin_bottom": 26,
           "margin_left": 16, "margin_right": 16, "header_line": False, "header_spacing": 22, "dpi": 90}
pf_id = pf[0]["id"] if pf else o.create("report.paperformat", pf_vals)
if pf: o.write("report.paperformat", [pf_id], pf_vals)
mid = o.search_read("ir.model", [("model", "=", "res.company")], ["id"])[0]["id"]
pf = o.search_read("report.paperformat", [("name", "=", "x Sample A4 compact")], ["id"])
pfvals = {"name": "x Sample A4 compact", "format": "A4", "orientation": "Portrait", "margin_top": 22, "margin_bottom": 22,
          "margin_left": 15, "margin_right": 15, "header_line": False, "header_spacing": 16, "dpi": 90}
pfid = pf[0]["id"] if pf else o.create("report.paperformat", pfvals)
if pf: o.write("report.paperformat", [pfid], pfvals)
results = {}
for k in only:
    d = build.DOCS[k]; key = f"x_sample.{k}"
    arch = lib.qweb(key, d)
    v = o.search_read("ir.ui.view", [("key", "=", key)], ["id"])
    if v: o.write("ir.ui.view", [v[0]["id"]], {"arch_db": arch}); vid = v[0]["id"]
    else: vid = o.create("ir.ui.view", {"name": f"sample {k}", "type": "qweb", "key": key, "arch_db": arch, "mode": "primary"})
    r = o.search_read("ir.actions.report", [("report_name", "=", key)], ["id"])
    rid = r[0]["id"] if r else o.create("ir.actions.report", {"name": f"sample {k}", "model": "res.company", "report_type": "qweb-pdf", "report_name": key, "binding_model_id": False})
    o.write("ir.actions.report", [rid], {"paperformat_id": pf_id})
    o.write("ir.actions.report", [rid], {"paperformat_id": pfid})
    cid = 1 if d["company"] == "SG" else 2
    fname = f"sample_{k}.pdf"
    code = f"""
pdf, _ = env['ir.actions.report']._render_qweb_pdf('{key}', [{cid}])
att = env['ir.attachment'].create({{'name': '{fname}', 'datas': b64encode(pdf), 'res_model': 'res.company', 'res_id': {cid}, 'mimetype': 'application/pdf'}})
"""
    a = o.search_read("ir.actions.server", [("name", "=", f"x sample render {k}")], ["id"])
    aid = a[0]["id"] if a else o.create("ir.actions.server", {"name": f"x sample render {k}", "model_id": mid, "state": "code", "code": code})
    if a: o.write("ir.actions.server", [aid], {"code": code})
    t = time.time()
    o.execute("ir.actions.server", "run", [aid], context={"active_model": "res.company", "active_id": cid, "active_ids": [cid]})
    att = o.search_read("ir.attachment", [("name", "=", fname), ("res_model", "=", "res.company")], ["id", "datas", "file_size"], order="id desc", limit=1)[0]
    p = OUT / fname; p.write_bytes(base64.b64decode(att["datas"]))
    results[k] = (att["file_size"], round(time.time() - t, 1))
    print(k, "view", vid, "report", rid, "->", p.name, att["file_size"], "bytes", results[k][1], "s", flush=True)

import pdfplumber, pypdfium2 as pdfium
for k in only:
    p = OUT / f"sample_{k}.pdf"
    with pdfplumber.open(str(p)) as doc:
        n = len(doc.pages)
        fonts = set()
        for pg in doc.pages: fonts |= {c.get("fontname", "").split("+")[-1] for c in pg.chars}
    print(f"{k}: {n} pages; fonts: {sorted(fonts)}")
    pdf = pdfium.PdfDocument(str(p))
    for i in {0, n // 2, n - 1}:
        img = pdf[i].render(scale=1.6).to_pil()
        img.save(OUT / f"{k}_p{i+1}.png")
