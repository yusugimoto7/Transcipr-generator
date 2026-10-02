# End-to-end test log — fictional clients, every application type

Each run takes one fictional client per application type through the whole
process, the way the team works a file:

1. **Open the file** (client number and name).
2. **The client emails** their first documents to visa@ with messy file names
   (`passport.pdf`, `shenasnameh Neda.pdf`, `kart melli.pdf`, `daneshname.pdf`).
   The platform matches the email to the file, reads and names each document,
   and makes the client's Drive folder.
3. **The team uploads** the rest of the type's checklist.
4. **Read documents & fill intake.**
5. **The team finishes the intake.**
6. **Build the final files**: letters, the pre-filled IRCC forms and the
   numbered portal files, all saved to Drive.
7. **Download** every final file and the zip.
8. **Check every box** of every IRCC form, read back the way Adobe shows it,
   and the contents and order of every final file.

The runner is `test/e2e/run.mjs` (`node test/e2e/run.mjs <type>…`). The
fictional clients are in `test/e2e/profiles.mjs`, and the form checker is
`test/e2e/audit_form.py`. Each run writes `test/e2e/out/<type>/report.md`,
which lists every box filled and every box left empty, plus the downloaded
files.

Google Drive, the mailbox and the AI are stand-ins. The stand-in AI "reads"
each document exactly as the profile says it reads, so a run tests the
platform: where every answer goes, and how every form and file is built. All
names, numbers and addresses are invented.

---

## Loop 1

### Study permit — S27101 Arman Rezaei (married, military service, one earlier refusal, two trips)

First run: every step passed, but checking IMM 1294 box by box showed these
problems, all now fixed:

| Where | Problem | Fix |
|---|---|---|
| IMM 1294 — Details of intended study | **Field of study** empty | The form needs an entry from IRCC's own list (Computing/IT, Business…). The platform now takes it from the program name ("…Data Analytics" → Computing/IT), and a new intake question lets the team choose it |
| IMM 1294 — school address (a required box) | Empty | New intake question "School address" (read from the LOA) |
| IMM 1294 — Student ID, PAL expiry | Empty | New intake questions, read from the LOA / PAL |
| IMM 1294 — Cost of studies | Room and board and other costs empty | New intake questions, filled on the form |
| IMM 1294 — Expenses paid by | "Other" ticked with no explanation | The "Other" box now says who pays ("Myself and Hossein Rezaei (father)") |
| IMM 1294 / 1295 / 5257 / 5708–5710 — Employment | Only the current job; rows 2–3 empty although he studied 2016–2020 and did military service 2020–2022 | The past 10 years are built from jobs, military service and studies ("Student (Software Engineering)", "Military service (conscription)"). Gaps of 2 months or more are reported on the form's slot |
| IMM 5476 (version 11-2025) | Client's and representative's family names missing (the box moved in the new version) | Mapped to the new boxes |
| IMM 5476 | The type of application was in the "Application number" box | Moved to "Type of application" |
| IMM 5476 | The RCIC number was also in "Supervising lawyer membership ID" | Removed from that box. It stays under "Member of the CICC" |
| IMM 5476 | Client email, "appointing a representative" and "paid — CICC member" not filled | Filled and ticked |
| Every hand-mapped form (IMM 5645, 5476, Schedule 1) | A box that a new form version drops was written to the wrong place without warning | Such boxes are now skipped and listed on the form's slot |
| Drive — 01 - Documents | The birth certificate and the national ID card were both saved as "101 - Birth Certificate and National ID - Arman.pdf" | The client's own file name decides the checklist item (shenasnameh → 101 Birth Certificate, kart melli → 102 National ID Card, daneshname → 105, transcript → 106). A second document with the same name gets "(2)" |
| Financial Support — contents page | "My Supporter's Documents (Hossein Rezaei (father))" | "My Supporter's Documents — Hossein Rezaei (father)" |

After the fixes, the study permit run was clean:
- **IMM 1294:** 124 boxes filled. Every box still empty is either a question
  that doesn't apply (previous marriage, other countries of residence) or a
  box for the signature, barcode or the form's own calculation.
- **Schedule 1:** military service row, both trips, Q4–Q8 and the principal
  applicant box are right.
- **IMM 5645:** the applicant, spouse (not accompanying), both parents and
  the sister are filled, in English and Persian.
- **IMM 5476:** client, RCIC, firm address, CICC ticked.
- **Final files:** the 16 files are in the team's order, on Drive under
  "02 - Final Files", with the generated files in "91 - Generated Files".

### The other 21 types (loop 1)

Each client below went through the same steps. Problems found, and fixed:

| Type (fictional client) | Problem | Fix |
|---|---|---|
| Spouse OWP — outside (Neda Karimi), child visitors, minor study permit, accompanying spouse | **IMM 5713** (family member representative) could not be pre-filled at all. Its boxes have no names the automatic map recognises | Its own map: the representative (spouse, or the parent for a child) and each family member with relationship and date of birth |
| Every main form (IMM 1294, 1295, 5257, 5708–5710) | The form's hidden "adult / child" switch and age stayed at their blank values. The forms set them only when someone types the date of birth in Adobe, and their validation reads them for the background section | Set from the date of birth |
| C11 entrepreneur (Farhad Tehrani) | IMM 1295 "LMIA or offer of employment number" empty, although the intake has the employer portal offer number | Filled from the LMIA number, else the offer number. For LMIA-stream permits an empty box is flagged |
| Visitor visa (Parisa Jafari) | IMM 5257 hidden copies of the visit dates (year / month / day) empty | Filled, as for the date of birth |
| Accompanying spouse / child visitors | IMM 5257 "contact in Canada" empty: these types never asked about the host | They now ask. The form falls back to the Canadian business contact (business visit) or, for a child joining a parent in Canada, that parent |
| Super visa (Mahin Hosseini) | Purpose of visit "Family Visit" | "Super Visa: For Parents or Grandparents", IRCC's own entry |
| Visitor visa from inside Canada (Hamid Zand) | Purpose "Other / Other"; education and funds empty (the type never asked) | "Returning Student" (or "Returning Worker"); the type now asks about education and funds |
| Super visa, visitor record, visitor visa from inside | IMM 5257 / 5708 education section empty (no education step) | Education step added |
| PGWP (Arash Mohammadi) | IMM 5710 education empty, and his Canadian program missing from his activities (no education step) | Education step added. The education section and the activities fall back to the PGWP program |
| PGWP | "104 - Photo - Arash.jpg" was filed as the **completion letter**, because on PGWP files code 104 means the completion letter | A JPG / PNG named "Photo" is always the photo |
| Visitor record (Shirin Akbari) | IMM 5708 "My expenses will be paid by" (a required box) empty | Mapped: Myself / Parents / Other, with who ("Maryam Akbari (daughter)") |
| Study permit from inside (Pouya Rad), every form | Employment gaps reported for years at high school (only post-secondary studies counted) | The latest studies count at any level. No gaps before age 6. A gap before 18 suggests adding the school |
| Work permit extension (Sina Kazemi), every inside-Canada form | "Details of previous applications" used only the team's free text and ignored the immigration-history rows | Every Canadian application or refusal from the rows, then the team's own words |
| IMM 5709 (study inside) | Field of study, school address, student ID, room and board, other costs, PAL expiry, "Other" payer empty (same gaps as IMM 1294) | Filled like IMM 1294 |
| Reconsideration (Kaveh Amini) | IMM 5744 (ATIP consent) could not be pre-filled; the final set built **no files** | IMM 5744 map (the RCIC as requester, the client consenting). Final set: Reconsideration Request, IMM 5744, Refusal Letter and GCMS Notes |
| Families sharing one email (Sam, Tara, Kian, Nika) | The email matches two files and waits in the Email intake inbox | Correct behaviour: staff assign it, and the runner now does the same |

Checked and correct (no change needed):
- **IMM 1295 work sections:** LMIA job (employer, address, location, job, duties, LMIA no.), C11 business, open permits with boxes 2–4 left blank.
- **IMM 5710:** extension ticked, LMIA stream, employer, location and first entry.
- **IMM 5710 for the Iranian OWP and the spouse OWP inside:** "new permit" ticked, the spouse's Canadian status answered "No", and the gap since arriving as a visitor flagged.
- **IMM 5257 business visit:** purpose, dates, funds, job.
- **Schedule 1 for the accompanying spouse:** "spouse" ticked.
- **IMM 5645 for every type**, and **IMM 5476 for every type**.

**To decide (left as the firm set it):** IMM 5646 (custodianship) is listed for the *child of a worker*, whose parent is in Canada, but not for the *minor studying alone with a custodian*.

---

## Loop 2 (all types, every loop 1 fix in place)

Every type built its full set of final files. Problems found, and fixed:

| Type | Problem | Fix |
|---|---|---|
| Employer-specific work permit (Omid Rahmani) | "142 - Proof you meet the job requirements" not recognised: only document codes 100–139 were read from file names | Codes 100–199 are read (the work permit checklists use 140–143) |
| Study permit for a worker's child (Sam Sadeghi), minor study permit | **IMM 5646** (custodianship declaration) could not be pre-filled, and the intake had the custodian only as one line of text | New intake questions for the custodian: name, date of birth, citizen or PR, address, phone, relationship, and where the child will live. IMM 5646 both pages filled (student, school, both parents, custodian, ticks, declaration names) |
| Child visitors | "Highest level of education — not answered" for a 12-year-old | A child under 18 answers "No" to post-secondary studies |
| PGWP (Arash Mohammadi) | Province and city of work asked and flagged (a PGWP has no employer); his Canadian studies listed twice in the 10-year history | PGWP treated as an open permit; the same activity entered twice counts once |
| Reconsideration | IMM 5744 firm address "501-3292, Production Way, …" | "501-3292 Production Way, Burnaby, BC V5A 4R4, Canada" |

Confirmed in loop 2:
- **Every loop 1 fix shows on the forms:** IMM 5713 for spouses and children, the adult/child switch, super visa and returning-student purposes, contacts in Canada, "paid by" on IMM 5708, and the PGWP education and photo.
- **Previous applications** are described from the immigration-history rows.
- **Shared family emails** are assigned by staff.
- **Reconsideration** builds Request, IMM 5744, and Refusal Letter and GCMS Notes.

## Study permit — loop 3 and final

Loop 3 ran Arman again and added a second, deliberately different study
permit client: **S27123 Sara Mohseni**. She is single, on a PAL-exempt
master's, with parents paying. She spent two years as a student in Turkey,
had a UK refusal, has an alias, and speaks English and French.

| Problem | Fix |
|---|---|
| Her alias "Sarah Mohseni" went whole into the alias *family name* box | Split into family name "Mohseni" and given name "Sarah". A second alias is reported, since the form has room for one |

Confirmed on her IMM 1294:
- **Previous country of residence:** Turkey, as a student, with its dates and their hidden copies.
- **Languages:** both English and French, most at ease in English.
- **Study:** master's level, field "Biological/Biomed Sciences", parents paying.
- **Refusal:** "Yes", with the UK refusal described.
- **Activities:** her studies in Ankara.

**Final study permit run: every step passed for both clients.**
- **Arman:** IMM 1294 has 129 boxes filled and nothing to check.
- **Sara:** two genuine employment gaps in her own history are flagged.
