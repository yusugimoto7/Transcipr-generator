# IRCC portal vs the platform — summary of differences

Compares the portal captures in this folder (all taken 2026-09-30) with
`platform/lib/appTypes.js` (application types, checklists, forms) and
`platform/lib/finalFiles.js` (final-file slots and their order per type).

Captures: [work-permit-family.md](work-permit-family.md) ·
[study-permit-outside.md](study-permit-outside.md) ·
[work-permit-extension.md](work-permit-extension.md) ·
[study-permit-extension.md](study-permit-extension.md) · [visitor-visa.md](visitor-visa.md) ·
[visitor-record.md](visitor-record.md) · [super-visa.md](super-visa.md)

Drafts left in the account (none signed, submitted or paid; all expire after 60 days):
`TEST-WP-FAMILY-DOCRESEARCH`, `TEST-SP-OUTSIDE-DOCRESEARCH`, `TEST-WP-EXT-DOCRESEARCH`,
`TEST-SP-EXT-DOCRESEARCH`, `TEST-TRV-DOCRESEARCH`, `TEST-VR-DOCRESEARCH`.

---

## 1. Application types: the portal has 7, the platform has 18

| Portal type | Platform types that land on it | Notes |
|---|---|---|
| Study Permit from Outside Canada | `study-permit`, `study-permit-minor`, `study-permit-child-of-worker` | Minors differ only by the "Is this applicant a minor?" answer. |
| Work Permit from Outside Canada | `owp-outside`, `owp-worker-spouse`, `imp-c11` | Portal never asks open vs employer-specific. The only signal is the "Open Work Permit Holder Fee" tick. |
| Temporary Resident Visa | `trv-outside`, `trv-spouse`, `trv-child`, `trv-business`, `trv-child-of-student`, **`super-visa`**, **`trv-inside`** | No follow-up questions at all. Super visa and "TRV from inside Canada" are the same portal flow as an ordinary TRV. |
| Work Permit Extension (In Canada) | `iranian-owp`, `pgwp`, `sowp-inside` | **There is no platform type for a plain employer-specific / LMIA work permit extension**, which is the portal's default use of this flow. |
| Study Permit Extension (In Canada) | `study-permit-inside`, `study-permit-inside-child` | |
| Visitor Record (In Canada) | `visitor-record` | Also the TRP-holder form (IMM5708). |
| Transit Visa | — | No platform type (not captured). |

## 2. Questions the portal asks that the intake should capture

| Portal question | Type | Platform today |
|---|---|---|
| Is this applicant a minor? (4 answers: not a minor / IMM 5646 custodianship / custody docs + consent / accompanied by both parents) | all | Minor handled by separate types; the 4-way answer that drives the custody slot isn't modelled. |
| Does this applicant have a spouse in Canada who is a student? | WP outside, WP extension | Not asked. "Yes" makes the DLI registration/attestation letter **required**. |
| PAL/TAL: has one / meets an exception, then which province | SP outside, SP extension | `palExempt` exists; province is not asked. |
| Is the student changing their DLI? | SP extension | Not asked. |
| Is the worker exempt from an LMIA? | WP outside, WP extension | Not asked. "Yes" drops the Proof of Language Proficiency requirement. |
| Did ESDC issue the LMIA under the Global Talent Stream? | WP outside only | Not asked. |
| Vulnerable-worker question (employer-specific permit holder at risk of abuse) | WP extension only | Not asked. |
| Fee types, incl. **Restoration of status** (WP ext, SP ext, VR), Open Work Permit Holder Fee, Family Rate, Single/Multiple Entry (TRV) | all | No restoration flag, no entry-type, no family-rate. |

## 3. Final-file slot names in `finalFiles.js` vs exact portal slot names

| `SLOT` key → platform name | Exact portal slot name | Match? |
|---|---|---|
| `passport` → Passport | Passport | ✓ |
| `photo` → Photo | **Digital photo** | rename |
| `client-info` → Client Information | Client Information | ✓ |
| `financial` → Financial Support | **Proof of Means of Financial Support** | rename. The portal also has separate **Proof of Financial Resource of Supporter**, **Letter of Support**, **Notice of Assessment**, **T4 or T1**, **Other Income/Financial Support**, **Accountant Letter** slots (TRV/VR). The platform merges supporter documents into one file. |
| `inviter` → Inviter's Documents | *no such slot anywhere.* Closest: **Inviter's Employment Letter** (TRV, VR) | used by `trv-*`, `super-visa`, `study-permit-child-of-worker`. Needs a real target slot. |
| `business` → Business Documents | **Business Registration**, **Business Activities Description**, **Purchase Order or Sales Contract** (TRV); none in the WP pool | split / rename |
| `marriage` → Marriage Certificate | **Marriage License/Certificate** | rename |
| `birth-nid` → Birth Certificate & National ID Card | **Birth Registration/Certificate**, TRV pool only. Not offered for SP/WP/VR. | For `owp-*` this file has no slot of its own and must go in Client Information. |
| `police` → Police Clearance Certificate | **Police certificate** (SP outside, WP outside, TRV). **Not offered** for WP ext, SP ext, VR. | rename; inside-Canada types shouldn't list it |
| `education` → Education and Certificates | SP outside: only **Recent Education Transcript**. WP outside: **Education (diplomas/degrees)**. | no slot for `study-permit`, which lists `education` |
| `transcript` → Recent Education Transcript | Recent Education Transcript | ✓ |
| `completion` → Completion of Studies Letter | Completion of Studies Letter (WP ext) | ✓ |
| `cv` → CV | **CV/résumé** | rename |
| `language` → Language Test Result | SP outside: **Proof of IELTS language test results**, **Proof of TEF language test results** (no TOEFL/Duolingo/CELPIP). WP: **Proof of Language Proficiency** | rename per type |
| `loa` → Letter of Acceptance | **Letter of Acceptance or Letter of Enrollment / Registration** (required). SP outside also has an optional **Letter of Acceptance from a post-secondary Designated Learning Institution**. | rename |
| `pal` → PAL / PAL Exemption | **Provincial or Territorial Attestation Letter (PAL or TAL)** *or* **Proof of Provincial or Territorial Attestation Letter (PAL or TAL) Exception**. The portal shows one or the other, depending on the answer. | rename both |
| `deposit` → Tuition Payment Confirmation (deposit + gic) | **Proof of tuition payment** and a separate **Proof of Guaranteed Investment Certificate (GIC)** | split |
| `relationship` → Proof of Relationship | Proof of Relationship (WP ext, SP ext, TRV, VR; not SP/WP outside) | ✓ |
| `family-status` / `spouse-status` → Family (Member) Proof of Status | **Family Member Proof of Status**. Only in the in-Canada pools (WP ext, SP ext, VR). | `owp-outside`/`owp-worker-spouse` use `spouse-status`, but WP-outside has no such slot. |
| `enrolment` → Proof of Student's Enrolment | "Registration letter from a designated learning institution (DLI); OR attestation letter from DLI detailing enrollment; OR transcripts from current graduate program…" (required only if the spouse is a student) | rename |
| `medical` → Medical Exam | **Proof of upfront medical exam** | rename |
| `insurance` → Health Insurance | **Medical Insurance Coverage** (TRV, VR) | rename |
| `employment` → Employment Documents | **Employment Letter**, **Employment Records** (TRV); **Letter from Current Employer**, **Employment Reference Letter** (WP outside) | rename per type |
| `custody` + `consent` → Custody Document, Consent for Travel | one required line: **Custody Documents, including a Parental Consent Letter** (minors only) | the portal combines them into one |
| `invitation` → Invitation Letter | **Invitation Letter** exists in WP and VR pools, **not in the TRV pool** | fine for `visitor-record`; super visa / TRV cannot have it as its own file |
| `submission` → Submission Letter | **Representative's Submission Letter** | rename |
| `forms` | IMM1294 / IMM1295 / IMM5257 / IMM5709 / IMM5710 / IMM5708 and IMM5476 are required. **Schedule 1 (IMM 5257) and Family Information (IMM5645) are optional** everywhere. **IMM5645 is not offered at all** for WP ext, SP ext or VR. | `appTypes` lists 5257B + 5645 as forms for most outside types, which is fine. No inside type lists 5645, which also matches. |

Portal slots with **no platform category**: Employer Questionnaire and Declaration · IMM5802 Offer
of Employment (LMIA-exempt) · Employer Payment Receipt · LMIA / LMIA or Proof of Submission ·
Proof that you Meet the Requirements of the Job · Co-op Letter (listed in the checklist, no slot) ·
Evidence of Work Requirement in Study · Student Exchange Letter · Proof of Next Terms Enrolment ·
Proof of Work Permit Exemption · Funding Letter · Travel History (TRV has its own slot; the platform
puts it inside Client Information) · Canadian Work or Study Permit (TRV) · EVN Document · CAQ / CSQ
· IMM5475 · IMM5409.

## 4. Per-type final-file lists (`LISTS`) that don't fit the portal

- **`super-visa`**: `inviter` and `birth-nid`/`employment` are fine to keep as content, but
  `inviter` has no slot. Host documents go to **Notice of Assessment / T4 or T1 / Inviter's
  Employment Letter / Proof of Financial Resource of Supporter / Letter of Support**. `invitation`
  must go in Client Information because the TRV pool has no Invitation Letter.
- **`trv-outside` / `trv-spouse` / `trv-child*`**: same `inviter` problem. `consent` and `custody`
  are one portal slot.
- **`visitor-record`**: matches the VR pool well. There is no police slot in the pool (the list
  doesn't have one ✓), and `invitation` + `relationship` exist ✓. The portal has no slot for
  current status or last entry, so keeping them in Client Information is right.
- **`study-permit`**: `education` has no slot (use Recent Education Transcript). `language`
  must be IELTS or TEF specifically. `deposit` should split tuition and GIC.
- **`study-permit-inside`**: the portal gives a **Proof of PAL/TAL Exception** slot for
  extensions. The platform only generates the PAL-exemption letter when `palExempt` is set.
- **`pgwp`**: the portal makes **Proof of Language Proficiency** required (unless LMIA-exempt).
  The PGWP checklist has language (110), but the final-file list has no `language` slot.
- **`iranian-owp` / `sowp-inside` (OWP_INSIDE)**: missing **Proof of Language Proficiency**
  (required unless exempt). `sowp-inside` has the `familyMemberStatus` package but no
  `family-status` entry in its list, although the portal has a **Family Member Proof of Status** slot.
- **`owp-outside` / `owp-worker-spouse`**: `spouse-status`, `birth-nid`, `education` have no own
  slot in the WP-outside pool. If `owp-outside`'s spouse is a student, the DLI registration letter
  is **required** (the `enrolment` slot ✓).

## 5. Help text that disagrees with platform hints

| Topic | Portal says | Platform says |
|---|---|---|
| Applicant bank statements | "your bank statements for the past **four months**" | FINANCIAL: "bank balance certificate + **6-month** statement" |
| Tuition (SP outside) | "Your **first year** of tuition must already be paid" | 109: receipt "after the first-term payment" |
| Medical insurance | "coverage for one year with a Canadian insurance company" (no amount) | 113: "at least $100,000 coverage" (the real super-visa rule, just not in the portal text) |
| Photo | 35 × 45 mm, head 31–36 mm, ≥ 420 × 540 px, JPEG, ≤ 4 MB | 104: 3.5 × 4.5 cm ✓ (no pixel/size rules) |
| Upload limits (all types) | one file per slot, **4 MB max**, PDF/JPG/TIFF/PNG/DOC/DOCX | the final-files builder should enforce 4 MB per file |
