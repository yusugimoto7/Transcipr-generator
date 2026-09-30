# Official IRCC form filling (XFA)

IRCC forms (IMM 1294, 1295, 5257, 5645, 5476, 5708, 5709, 5710, Schedule 1, …)
are **Adobe LiveCycle dynamic XFA forms**. Pure-JS PDF libraries (pdf-lib)
cannot read or fill them. This module fills them by writing values into the
form's XFA `datasets` packet using **pikepdf** (qpdf). The applicant opens the
filled form in Adobe Reader and clicks **Validate** to generate the 2D barcode
(no software can produce that step — it is by design).

## Pieces

- `xfa_fields.py` — resolves every field of a form to the data node Adobe binds
  it to: named subforms, `<bind match="dataRef" ref="$.A.B">` (Schedule 1 names
  its data differently from its boxes), repeating rows (`…Detail[0..3]`) and
  same-named groups (`BackgroundInfo/Choice` and `Choice[1]`). For each field:
  its kind (text, date, check, choice, radio), the values a tick stores (Y/N,
  true/false, 1/0), its value list (LOV) and caption.
- `fill_form.py` — the filler. Reads a template PDF + instructions JSON on
  stdin, writes a filled PDF. Converts each answer to what its field stores:
  drop-downs → the form's code ("Iran" → 223, "Female" → "F Female",
  "Iran" → "IRN (Iran)"), Yes/No → the group's own values, dates → YYYY-MM-DD.
  **English only**: text in any other script is not written (except IMM 5645
  name boxes, which take "English name + native name"); every refusal is
  reported back as a warning.
- `dump_schema.py` / `inspect_form.py` — list a form's resolved fields (JSON for
  the app; one line per field for authoring).
- `fieldmaps/ircc.js` — one map for the main application forms (IMM 1294, 1295,
  5257, 5708, 5709, 5710): rules by path ending, matched to each form's own
  fields, plus form-specific sections (intended work, study, visit, entry to
  Canada). Visible date boxes are filled together with their hidden
  year/month/day copies.
- `fieldmaps/imm5645.js`, `imm5257b.js`, `imm5476.js` — the family, Schedule 1
  and representative forms.
- `requirements.txt` — `pikepdf`, `lxml` (installed into the Docker image).

## How templates are sourced

Blank templates are **fetched live from canada.ca** by `fetchForms.js` (see
`registry.js`) and cached under `UPLOAD_DIR/forms-cache`. The platform always
uses the current official version.

## What staff see

Each pre-filled form carries its **checks**: intake answers the form needs
that are still empty ("Background 4a: military service (Yes/No) — not
answered in the intake") and answers the form refused ("City of birth: not in
English"). Final files lists them under the form's slot.

## To extend a form

1. `python3 lib/forms/inspect_form.py <blank.pdf>` — every field's data path,
   kind, tick values and value list.
2. Add rules to `fieldmaps/ircc.js` (`EXTRA_RULES[<key>]`) or a map of its own,
   reading intake fields (add questions to `lib/schema.js` if the intake lacks
   the answer — mark them `required`, with `showIf` for follow-up questions).
3. `node test/forms.test.mjs`.
