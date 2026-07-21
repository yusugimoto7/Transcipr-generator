# Official IRCC form filling (XFA)

IRCC forms (IMM 1294, 5257, 5645, 5476, …) are **Adobe LiveCycle dynamic XFA
forms**. Pure-JS PDF libraries (pdf-lib) cannot read or fill them. This module
fills them by injecting values into the form's XFA `datasets` packet using
**pikepdf** (qpdf). The applicant opens the filled form in Adobe Reader and
clicks **Validate** to generate the 2D barcode (no software can produce that
step — it is by design).

## Pieces

- `fill_form.py` — the filler. Reads a template PDF + instructions JSON on stdin,
  writes a filled PDF. Resolves coded fields (country, status, marital status…)
  via the form's own embedded value lists (LOVFile).
- `requirements.txt` — `pikepdf`, `lxml` (installed into the Docker image).
- `templates/` — **blank official IMM PDFs** (not committed here yet — add them).
- `fieldmaps/<form>.json` — maps our intake fields → XFA SOM paths (+ which value
  list to use for coded fields).

## To activate a form

1. Put the **blank official** `imm1294.pdf` (etc.) in `templates/`.
2. Derive its schema:
   `python3 -c "import pikepdf,sys; ..."` (dump leaf paths under `<xfa:data>`).
3. Author `fieldmaps/imm1294.json` mapping intake fields → SOM paths.
4. The Node wrapper (`lib/generators/xfaFill.js`) spawns `fill_form.py`; the
   generate route uses it when a template exists and falls back to the data
   sheet otherwise.

Blank templates contain **no personal data** — always start from the official
blank form, never from a completed client file.
