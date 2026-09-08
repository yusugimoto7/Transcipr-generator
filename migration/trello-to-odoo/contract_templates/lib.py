"""HTML/QWeb builders for the sample agreements (Option D rendering test)."""
import base64, html, pathlib
HERE = pathlib.Path(__file__).parent
FONT_DIR = HERE / "fonts"

def b64(p): return base64.b64encode(pathlib.Path(p).read_bytes()).decode()

FONT_MODE = "data"   # "url" -> /web/content attachments on the DB, "data" -> base64 inline
FONT_URLS = {"regular": "/web/content/13642/Vazirmatn-NL-Regular.ttf", "bold": "/web/content/13643/Vazirmatn-NL-Bold.ttf"}
def font_css():
    if FONT_MODE == "url":
        r, b = FONT_URLS["regular"], FONT_URLS["bold"]
    else:
        r = "data:application/x-font-ttf;base64," + b64(FONT_DIR / "Vazirmatn-NL-Regular.ttf")
        b = "data:application/x-font-ttf;base64," + b64(FONT_DIR / "Vazirmatn-NL-Bold.ttf")
    return f"""
@font-face{{font-family:'VazirNL';font-style:normal;font-weight:400;src:url('{r}') format('truetype');}}
@font-face{{font-family:'VazirNL';font-style:normal;font-weight:700;src:url('{b}') format('truetype');}}
"""

CSS = """
.page{font-family:'Lato','DejaVu Sans',sans-serif;font-size:9pt;line-height:1.4;color:#111;}
.fa,[dir=rtl]{font-family:'VazirNL','Lato','DejaVu Sans',sans-serif;direction:rtl;text-align:right;line-height:1.75;}
div.fa{display:block;page-break-inside:auto;}
table.bi tr,table.bi td{page-break-inside:auto;}
.en{direction:ltr;text-align:left;}
table.bi{width:100%;border-collapse:collapse;table-layout:fixed;}
table.bi td{width:50%;vertical-align:top !important;padding:3px 8px 3px 0;border-bottom:1px solid #e3e3e3;}
table.bi td.facell{padding:3px 0 3px 8px;}
table.bi tr.h td{border-bottom:0;padding-top:10px;}
h1.t{font-size:17pt;margin:0 0 2px 0;font-weight:700;}
h2.c{font-size:10pt;margin:5px 0 2px 0;font-weight:700;line-height:1.3;}
p{margin:0 0 5px 0;}
ul,ol{margin:0 0 5px 0;padding-left:18px;}
[dir=rtl] ul,[dir=rtl] ol{padding-left:0;padding-right:18px;}
li{margin:0 0 2px 0;}
table.fee{border-collapse:collapse;margin:4px 0 6px 0;min-width:70%;}
table.fee td{padding:2px 8px;border:1px solid #bbb;}
table.fee td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;}
[dir=rtl] table.fee td.n{text-align:left;}
table.fee tr.tot td{font-weight:700;background:#f2f2f2;}
.meta{font-size:9pt;color:#333;}
.sig{margin-top:22px;page-break-inside:avoid;}
.sig table{width:100%;border-collapse:collapse;}
.sig td{vertical-align:bottom;padding:18px 10px 4px 0;width:50%;}
.line{border-top:1px solid #111;padding-top:3px;font-size:8.5pt;}
.hdr{width:100%;border-bottom:1px solid #999;padding-bottom:4px;margin-bottom:6px;font-size:8.5pt;color:#333;}
.hdr img{height:40px;}
.ftr{border-top:1px solid #999;padding-top:4px;font-size:8pt;color:#333;text-align:center;line-height:1.35;}
.pb{page-break-before:always;}
.box{border:1px solid #bbb;padding:6px 8px;margin:4px 0;}
.small{font-size:8.5pt;}
"""

import re as _re
_URL = _re.compile(r"(https?://[^\s<>\"']+)")
def esc(s):
    t = html.escape(s, quote=False)
    return _URL.sub(r'<span dir="ltr" style="unicode-bidi:embed">\1</span>', t)

# ---------- inline builders (return XHTML) ----------
def P(text, cls=""):   return f'<p class="{cls}">{esc(text)}</p>' if cls else f"<p>{esc(text)}</p>"
def PS(*texts):        return "".join(P(t) for t in texts)
def H(text):           return f'<h2 class="c">{esc(text)}</h2>'
def UL(items):         return "<ul>" + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul>"
def OL(items):         return "<ol>" + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ol>"
def RAW(x):            return x

def FEE(rows, total, rtl=False):
    """rows: list of (label, amount_str); total: (label, amount_str)"""
    body = "".join(f'<tr><td>{esc(l)}</td><td class="n">{esc(a)}</td></tr>' for l, a in rows)
    body += f'<tr class="tot"><td>{esc(total[0])}</td><td class="n">{esc(total[1])}</td></tr>'
    return f'<table class="fee">{body}</table>'

def SIG(pairs, rtl=False):
    """pairs: list of (line1 label, line2 label). Two per row."""
    cells = "".join(f'<td><div class="line">{esc(a)}<br/>{esc(b)}</div></td>' for a, b in pairs)
    return f'<div class="sig"><table><tr>{cells}</tr></table></div>'

# ---------- document assembly ----------
def bilingual_rows(rows):
    out = []
    for r in rows:
        if isinstance(r, tuple):
            en, fa = r
            out.append(f'<tr><td class="en">{en}</td><td class="facell"><div class="fa" dir="rtl">{fa}</div></td></tr>')
        else:  # full-width block
            out.append(f'<tr><td colspan="2">{r}</td></tr>')
    return '<table class="bi"><colgroup><col style="width:50%"/><col style="width:50%"/></colgroup>' + "".join(out) + "</table>"

def en_rows(rows):
    return "".join(rows)

COMPANY = {
  "SG": dict(name="Sugimoto Visa Inc.", lines=["501 - 3292 Production Way - Burnaby - Greater Vancouver - BC V5A 4R4",
                                              "Tel: +1 (778) 200-8856 - Legal@sugimotovisa.com", "www.sugimotovisa.com"], logo=None),
  "SB": dict(name="SPARKBRIDGE INCUBATOR LTD", lines=["250 - 997 Seymour St. Vancouver, BC",
                                              "Tel: +1 (604) 364-9012 - Contract@Sparkbridge.ca", "www.Sparkbridge.ca"], logo=None),
}

def qweb(key, doc):
    """Build a complete QWeb arch for one sample document."""
    co = COMPANY[doc["company"]]
    logo = (f'<img src="data:image/{co["logo_fmt"]};base64,{co["logo"]}" style="height:34px;width:auto;display:block"/>'
            if co.get("logo") else f'<b>{esc(co["name"])}</b>')
    fs = "font-family:'Lato','DejaVu Sans',sans-serif;font-size:8pt;color:#333;"
    header = (f'<div class="header"><table style="width:100%;border:0;border-collapse:collapse;border-bottom:1px solid #999;margin-bottom:6px;{fs}">'
              f'<tr><td style="border:0;padding:0 0 4px 0;vertical-align:bottom">{logo}</td>'
              f'<td style="border:0;padding:0 0 4px 0;text-align:right;vertical-align:bottom">{esc(doc["title"])}<br/>{esc(doc["file_label"])}</td></tr></table></div>')
    footer_lines = "<br/>".join(esc(l) for l in [co["name"]] + co["lines"])
    footer = (f'<div class="footer"><div style="border-top:1px solid #999;padding-top:4px;text-align:center;line-height:1.3;{fs}">{footer_lines}<br/>'
              f'Page <span class="page"/> of <span class="topage"/></div></div>')
    body = bilingual_rows(doc["rows"]) if doc["layout"] == "bilingual" else en_rows(doc["rows"])
    style = "<style>" + font_css() + CSS + "</style>"
    return (f'<t t-name="{key}"><t t-call="web.html_container"><t t-foreach="docs" t-as="o">'
            f'{header}<div class="article">{style}<div class="page">{body}</div></div>{footer}'
            f'</t></t></t>')

def preview_html(key, doc):
    """Stand-alone HTML for a quick local look (no QWeb)."""
    arch = qweb(key, doc)
    inner = arch.split('t-as="o">',1)[1].rsplit("</t></t></t>",1)[0]
    return f'<!doctype html><meta charset="utf-8"><body style="max-width:800px;margin:20px auto">{inner}</body>'
