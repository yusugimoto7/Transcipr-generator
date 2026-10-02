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
