# Contract templates – Option D sample renders

Proof-of-concept for generating retainer agreements as QWeb HTML → PDF inside Odoo
(English-only and English + Farsi two-column layouts).

* `lib.py` – page CSS, embedded Vazirmatn (Non-Latin subset) font, bilingual row builder,
  header/footer, QWeb arch assembly. Header/footer use inline styles only because Odoo
  extracts them into separate documents; page CSS must sit inside `div.article`.
* `sg_clauses.py` – Sugimoto Visa clause library (EN + FA) copied from the current Word templates.
* `sb_clauses.py` – Sparkbridge clause library (EN + FA).
* `build.py` – assembles nine sample documents with real numbers
  (SG-TR, SG-PR, SG-SPON, SG-ENT, SB-A, SB-C, SB-D, SB-E, SB-F) and writes `out/*.arch.xml`
  plus a plain HTML preview.
* `render.py` – pushes each arch to the **test** database as a `qweb` view + `ir.actions.report`
  on `res.company`, renders it server-side through `_render_qweb_pdf`, pulls the PDF back and
  rasterises a few pages for inspection. Run from `migration/trello-to-odoo`:

      .venv/bin/python contract_templates/render.py            # all nine
      .venv/bin/python contract_templates/render.py sg_tr sb_a # a subset

Findings that shaped the code: wkhtmltopdf shapes Arabic script correctly; fonts must be
inlined as base64 (a `/web/content` URL is not resolvable from the report worker); every Farsi
block needs its own `dir="rtl"` container (a div inside the cell, not the `td`); URLs inside
Farsi text are wrapped in `dir="ltr"` spans; a compact paper format (22 mm margins) avoids the
large default header gap.
