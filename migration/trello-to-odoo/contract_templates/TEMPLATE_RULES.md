# House rules for every agreement template (set by the client, 2026-09-08)

These apply to **all** Sugimoto Visa and Sparkbridge agreements generated from Odoo.
`lib.py`, `sg_clauses.py` and `sb_clauses.py` implement them; keep them true when adding a template.

1. **Title on the file.** Every document starts with its title (e.g. *Retainer Agreement*,
   *Service Agreement*) and the file/contract number, and repeats both in the page header.
2. **Paper: US Letter.** Reports use the `Contracts - US Letter` paper format (`render.py`
   creates it: Letter, margins 30/26/16/16 mm, header spacing 22, 90 dpi).
3. **Font size 11 pt** for body text (two sizes up from the old 9 pt); headings 11.5 pt,
   title 18 pt. Latin text in Lato, Farsi in Vazirmatn (embedded as base64 in the report).
4. **Justified paragraphs** in both languages.
5. **English + Farsi documents are always a two-column table**, English left, Farsi right
   (`div.fa dir="rtl"` inside the right cell, 50/50 `colgroup`).
6. **No void areas.** Each clause is split into one table row per paragraph / list item
   (`split_pair`), rows are `page-break-inside: avoid`, so pages fill instead of leaving a
   half-blank page before a long clause. Keep EN and FA clauses in the same shape (same
   number of paragraphs and list items) or the clause falls back to a single row.
7. **Room for signatures.** `SIG()` gives each signer a label, 80 px of signing space, a line,
   and a *Date / تاریخ* line; Sparkbridge-style "Signature:" list items get 70 px of room.
8. **Official logos top-left of every page**: `logos/logo_sugimotovisa.png` (wide logo) and
   `logos/logo_sparkbridge.png`, embedded as data URIs in the header.
9. **PR agreements name only the client's program.** Section 2 reads "…by following the
   program: <program>" – never a list of tick-box options.
10. **Dependants are named after the principal applicant** in the Responsibilities and
    Commitments section, as *accompanying spouse* / *dependent child(ren)* – in English and
    Farsi (`sg_clauses.parties()`; Sparkbridge `sbc_body(companions_en, companions_fa)`).

Also decided: the Sparkbridge SUV Canada template (SB-B) is retired; nine templates remain.

## Templates (2026-09-09)

Ten agreement templates: SG-TR, SG-PR, SG-SPON, SG-ENT, SG-PFL (procedural fairness letter
response, built on SG-TR with sections 2, 3, 4, 5, 7 and 12 rewritten), SB-A, SB-C, SB-D, SB-E, SB-F.
Services without one of these use the custom-agreement upload on the quotation
(`sign_contracts.py`, fields `x_custom_agreement` / `x_custom_agreement_url`).
