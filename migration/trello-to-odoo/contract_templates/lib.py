"""HTML/QWeb builders for the sample agreements (Option D rendering test).

House rules encoded here (set by the client on 2026-09-08):
 1. Every document starts with its title (Retainer Agreement / Service Agreement) and file number.
 2. Paper: US Letter (paperformat created by render.py).
 3. Body 11pt (was 9pt); Farsi in Vazirmatn.
 4. Paragraphs justified.
 5. English + Farsi documents are always a two-column table, one clause per row.
 6. No empty sections: long clauses are split into one row per paragraph / list item so pages fill.
 7. Signature blocks get real room (name, signature line, date).
 8. Official company logo top-left of every page.
"""
import base64, html, pathlib, re
HERE = pathlib.Path(__file__).parent
FONT_DIR = HERE / "fonts"

def b64(p): return base64.b64encode(pathlib.Path(p).read_bytes()).decode()

def font_css():
    r = b64(FONT_DIR / "Vazirmatn-NL-Regular.ttf"); b = b64(FONT_DIR / "Vazirmatn-NL-Bold.ttf")
    return (f"@font-face{{font-family:'VazirNL';font-weight:400;src:url(data:application/x-font-ttf;base64,{r}) format('truetype');}}"
            f"@font-face{{font-family:'VazirNL';font-weight:700;src:url(data:application/x-font-ttf;base64,{b}) format('truetype');}}")

CSS = """
.page{font-family:'Lato','DejaVu Sans',sans-serif;font-size:11pt;line-height:1.5;color:#111;}
.fa{font-family:'VazirNL','Lato','DejaVu Sans',sans-serif;direction:rtl;text-align:right;unicode-bidi:embed;line-height:1.85;display:block;}
.fa p,.fa li{text-align:justify;}
.en p,.en li,.page p,.page li{text-align:justify;}
table.bi{width:100%;border-collapse:collapse;table-layout:fixed;}
table.bi tr{page-break-inside:avoid;}
table.bi td{vertical-align:top !important;padding:5px 9px 5px 0;border-bottom:1px solid #d9d9d9;}
table.bi td.facell{padding:5px 0 5px 9px;}
table.bi td.full{padding:5px 0;}
h1.t{font-size:18pt;margin:0 0 4px 0;font-weight:700;text-align:center;}
h2.c{font-size:11.5pt;margin:2px 0 3px 0;font-weight:700;}
p{margin:0 0 6px 0;}
p.li{margin:0 0 4px 0;}
p.meta{font-size:10pt;text-align:center;}
ul,ol{margin:0 0 6px 0;padding-left:22px;}
.fa ul,.fa ol{padding-left:0;padding-right:22px;}
li{margin:0 0 4px 0;}
table.fee{border-collapse:collapse;margin:4px 0 8px 0;min-width:75%;}
table.fee td{padding:3px 9px;border:1px solid #bbb;}
table.fee td.n{text-align:right;white-space:nowrap;}
.fa table.fee td.n{text-align:left;}
table.fee tr.tot td{font-weight:700;background:#f2f2f2;}
.sig{margin-top:22px;page-break-inside:avoid;}
.sig table{width:100%;border-collapse:collapse;table-layout:fixed;border:0 !important;}
.sig,.sig *{border:0 !important;outline:0 !important;box-shadow:none !important;}
.sig td{vertical-align:top;padding:6px 18px 6px 0;border:0;}
.sig .lbl{margin-bottom:4px;}
.sig .room{height:80px;}
div.sig div.line{border-top:1px solid #111 !important;padding-top:4px;font-size:10pt;line-height:1.5;}
.sig .date{font-size:10pt;margin-top:10px;}
table.bi td.nb{border-bottom:0;}
.small{font-size:9.5pt;}
.ltr{direction:ltr;unicode-bidi:embed;}
"""

def esc(s): return html.escape(s, quote=False)
_URL = re.compile(r"(https?://[^\s<]+|[\w.+-]+@[\w-]+\.[\w.-]+)")
def _iso(s):
    """Keep URLs / e-mails as LTR runs inside RTL text."""
    return _URL.sub(lambda m: f'<span class="ltr">{m.group(0)}</span>', esc(s))

# ---------- QWeb placeholders (data-driven templates) ----------
# V(expr) marks a value filled at render time; finalize() turns the marker
# into <t t-esc="expr"/>. The marker survives html escaping, so it can be
# passed through every clause builder like an ordinary string.
def V(expr):  return f"\x00{expr}\x00"
def DL(expr):
    """A list whose items come from the data (one bullet per item)."""
    return f'<div class="dl"><t t-foreach="{expr}" t-as="i"><p class="li">• <t t-esc="i"/></p></t></div>'
def NL(expr):
    """A numbered list from the data."""
    return f'<div class="dl"><t t-foreach="{expr}" t-as="i"><p class="li"><t t-esc="i_index + 1"/>. <t t-esc="i"/></p></t></div>'
def FEE_D(rows_expr, total_label, total_expr):
    return (f'<table class="fee"><t t-foreach="{rows_expr}" t-as="r"><tr><td><t t-esc="r[0]"/></td><td class="n"><t t-esc="r[1]"/></td></tr></t>'
            f'<tr class="tot"><td>{esc(total_label)}</td><td class="n"><t t-esc="{total_expr}"/></td></tr></table>')
def finalize(arch):
    return re.sub("\x00(.*?)\x00", lambda m: f'<t t-esc="{m.group(1)}"/>', arch)

# ---------- inline builders (return XHTML) ----------
def P(text, cls=""):   return f'<p class="{cls}">{_iso(text)}</p>' if cls else f"<p>{_iso(text)}</p>"
def PS(*texts):        return "".join(P(t) for t in texts)
def H(text):           return f'<h2 class="c">{esc(text)}</h2>'
def UL(items):         return "<ul>" + "".join(f"<li>{_iso(i)}</li>" for i in items) + "</ul>"
def OL(items):         return "<ol>" + "".join(f"<li>{_iso(i)}</li>" for i in items) + "</ol>"
def RAW(x):            return x

def FEE(rows, total, rtl=False):
    body = "".join(f'<tr><td>{esc(l)}</td><td class="n">{esc(a)}</td></tr>' for l, a in rows)
    body += f'<tr class="tot"><td>{esc(total[0])}</td><td class="n">{esc(total[1])}</td></tr>'
    return f'<table class="fee">{body}</table>'

def SIG(pairs):
    """pairs: list of (party label, caption under the line). Rule 7: ~80px of signing room per cell."""
    cells = "".join(
        f'<td><div class="lbl"><b>{esc(a)}</b></div><div class="room"></div>'
        f'<div class="line">{esc(b)}</div><div class="date">Date / تاریخ: ______________________</div></td>'
        for a, b in pairs)
    return f'<div class="sig"><table><tr>{cells}</tr></table></div>'

# ---------- row splitting (rule 6) ----------
_BLOCK = re.compile(r'(<h2 class="c">.*?</h2>|<p(?: class="[^"]*")?>.*?</p>|<ul>.*?</ul>|<ol>.*?</ol>|<table class="fee">.*?</table>|<div class="dl">.*?</div>)', re.S)
_LI = re.compile(r"<li>(.*?)</li>", re.S)

def _tokens(cell):
    """Top-level blocks of a cell. Lists are expanded into their items, tagged ('li', n, text)."""
    out = []
    for m in _BLOCK.finditer(cell):
        b = m.group(1)
        if b.startswith("<ol>") or b.startswith("<ul>"):
            items = _LI.findall(b)
            for i, it in enumerate(items, 1):
                out.append(("li", i if b.startswith("<ol>") else 0, it, len(items)))
        elif b.startswith("<h2"):
            out.append(("h", b))
        else:
            out.append(("b", b))
    return out

def _render(tok):
    if tok[0] == "li":
        n = tok[1]
        mark = f"{n}." if n else "•"
        room = '<div style="height:70px"></div>' if re.match(r"^(Signature|امضا)\s*:\s*$", tok[2].strip()) else ""
        return f'<p class="li">{mark} {tok[2]}</p>{room}'
    return tok[1]

def split_pair(en, fa):
    """Split one bilingual clause into aligned rows: heading+first block, then one row per block/item.
    Falls back to a single row when the two sides do not have the same shape."""
    te, tf = _tokens(en), _tokens(fa)
    shape_e = [(t[0], t[3] if t[0] == "li" else None) for t in te]
    shape_f = [(t[0], t[3] if t[0] == "li" else None) for t in tf]
    covered = lambda cell: "".join(m.group(1) for m in _BLOCK.finditer(cell)) == cell
    if not te or shape_e != shape_f or not covered(en) or not covered(fa):
        return [(en, fa)]
    rows, cur_e, cur_f = [], "", ""
    for a, b in zip(te, tf):
        if a[0] == "h":
            cur_e += a[1]; cur_f += b[1]; continue
        rows.append((cur_e + _render(a), cur_f + _render(b))); cur_e = cur_f = ""
    if cur_e: rows.append((cur_e, cur_f))
    return rows

# ---------- document assembly ----------
def bilingual_rows(rows):
    out, tail = [], []
    for r in rows:
        if isinstance(r, tuple):
            for en, fa in split_pair(*r):
                out.append(f'<tr><td class="en">{en}</td><td class="facell"><div class="fa" dir="rtl">{fa}</div></td></tr>')
        elif r.startswith('<div class="sig"'):
            tail.append(r)   # signature blocks live outside the table so they can start a new page
        else:
            out.append(f'<tr><td class="full" colspan="2">{r}</td></tr>')
    return ('<table class="bi"><colgroup><col style="width:50%"/><col style="width:50%"/></colgroup>'
            + "".join(out) + "</table>" + "".join(tail))

def en_rows(rows): return "".join(rows)

COMPANY = {
  "SG": dict(name="Sugimoto Visa Inc.", lines=["501 - 3292 Production Way - Burnaby - Greater Vancouver - BC V5A 4R4",
                                              "Tel: +1 (778) 200-8856 - Legal@sugimotovisa.com", "www.sugimotovisa.com"],
             logo_file="logo_sugimotovisa.png", logo_h=40),
  "SB": dict(name="SPARKBRIDGE INCUBATOR LTD", lines=["250 - 997 Seymour St. Vancouver, BC",
                                              "Tel: +1 (604) 364-9012 - Contract@Sparkbridge.ca", "www.Sparkbridge.ca"],
             logo_file="logo_sparkbridge.png", logo_h=58),
}

def logo_tag(co):
    f = HERE / "logos" / co["logo_file"]
    if not f.exists():
        return f'<b>{esc(co["name"])}</b>'
    mime = "image/svg+xml" if f.suffix == ".svg" else "image/png"
    return f'<img src="data:{mime};base64,{b64(f)}" style="height:{co["logo_h"]}px"/>'

def title_rows(doc):
    """Rule 1: title + file line at the top of the body (bilingual or single column)."""
    t = f'<h1 class="t">{esc(doc["title"])}</h1><p class="meta">{esc(doc["file_label"])}</p>'
    return t

SIG_PAGE_CSS = ".sig{page-break-before:always;margin-top:0;} .sig+.sig{page-break-before:auto;margin-top:40px;}"

def qweb(key, doc):
    co = COMPANY[doc["company"]]
    header = ('<div class="header"><table style="width:100%;border:0;border-bottom:1px solid #999;margin-bottom:6px"><tr>'
              f'<td style="padding:0 0 4px 0;border:0;vertical-align:middle">{logo_tag(co)}</td>'
              f'<td style="text-align:right;font-size:9pt;color:#333;border:0;vertical-align:bottom;padding:0 0 4px 0">{esc(doc["title"])}<br/>{esc(doc["file_label"])}</td></tr></table></div>')
    footer_lines = "<br/>".join(esc(l) for l in [co["name"]] + co["lines"])
    footer = ('<div class="footer"><div style="border-top:1px solid #999;padding-top:4px;font-size:8.5pt;color:#333;text-align:center;line-height:1.35">'
              f'{footer_lines}<br/>Page <span class="page"/> of <span class="topage"/></div></div>')
    body = title_rows(doc) + (bilingual_rows(doc["rows"]) if doc["layout"] == "bilingual" else en_rows(doc["rows"]))
    style = "<style>" + font_css() + CSS + (SIG_PAGE_CSS if doc.get("sig_page") else "") + "</style>"
    return finalize(f'<t t-name="{key}"><t t-call="web.html_container"><t t-foreach="docs" t-as="o">'
                    f'{header}<div class="article">{style}<div class="page">{body}</div></div>{footer}'
                    f'</t></t></t>')

def preview_html(key, doc):
    arch = qweb(key, doc)
    inner = arch.split('t-as="o">', 1)[1].rsplit("</t></t></t>", 1)[0]
    return f'<!doctype html><meta charset="utf-8"><body style="max-width:820px;margin:20px auto">{inner}</body>'
