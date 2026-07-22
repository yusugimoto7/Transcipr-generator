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

## How templates are sourced

Blank templates are **fetched live from canada.ca** by `fetchForms.js` (see
`registry.js`) and cached under `UPLOAD_DIR/forms-cache`. There is no committed
`templates/` folder — the platform always uses the current official version.

## To activate/extend a form

1. Confirm the form's XFA schema against the **blank** template:
   `GET /api/forms/<key>/schema` → returns all leaf SOM paths (no values).
2. Add/extend `fieldmaps/<key>.js` mapping intake fields → SOM paths (+ `lov`
   list names for coded fields like country/marital status).
3. `lib/generators/xfaFill.js` fetches the blank, runs `fill_form.py`, returns
   the filled PDF. The generate route offers it (e.g. `imm1294-filled`) and
   falls back to the data sheet if python/template is unavailable.

Coded fields are resolved to IRCC codes via the form's own embedded value lists;
unmatched values are **skipped** (left for the applicant) rather than guessed.
