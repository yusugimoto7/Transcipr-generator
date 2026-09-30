# IRCC portal — work permit family (principal + spouse OWP + child study permit)

Captured 2026-09-30 from the IRCC Authorized Paid Representatives (APR) portal
("Apply for a visitor visa, study or work permit" → eApp questionnaire → document checklist).

Draft left in the account (not signed, not submitted, not paid):
**Your Case Id `TEST-WP-FAMILY-DOCRESEARCH`**, listed under "Continue an application you haven't
submitted". It expires by itself after 60 days, or can be deleted from the account home.

## How the portal builds the list

1. The questionnaire asks a few questions per person, then shows a **required** list and a
   pool of **optional** "additional documents you may select", grouped by category.
2. Every optional document you tick is added to the final checklist **marked "(required)"**:
   the checklist can't tell you which items were optional to start with. For this capture I ticked
   every optional item so that IRCC's help text for each one showed on the checklist. So the
   required/optional status below comes from the questionnaire, not from the checklist.
3. Some "required" lines in the questionnaire are conditional ("Required only if…",
   "Unless exempt") and only land on the checklist when the condition applies. Those that did not
   appear for this family are marked *not added* below.
4. Help text is the same for a document whatever the applicant (compared across all three).

## Questionnaire answers used

| | TEST Principal | TEST Spouse | TEST Child (10) |
|---|---|---|---|
| Group | Family (3 applicants) | | |
| Application type | Work Permit from Outside Canada | Work Permit from Outside Canada | Study Permit from Outside Canada |
| Minor? | No | No | Yes, accompanied by both parents or legal guardians |
| Other questions asked | "Does this applicant have a spouse in Canada who is a student?" → No | *(none before documents)* | "Does the applicant have a provincial or territorial attestation letter or meet an exception…?" → meets an exception |
| After documents | "Is the worker exempt from a Labour Market Impact Assessment?" → No; "Did ESDC issue the worker's LMIA under the Global Talent Stream?" → No | "Is the worker exempt from a Labour Market Impact Assessment?" → Yes | — |
| Fees ticked | Work Permit; Biometrics | Work Permit; Open Work Permit Holder Fee; Biometrics | Study Permit; Biometrics - Fee Exempt |

The portal never asks for the principal's country of residence (Iran), the job offer itself, or
whether the spouse's permit is open or employer-specific. The only open-permit signal is the
**Open Work Permit Holder Fee** tick box. The portal also never links the spouse or child to the
principal. They are just three clients in one "Family" group.

Fee estimate shown: Work Permit 2 × $155, Biometrics 2 × $85, Open Work Permit Holder Fee 1 × $100,
Biometrics (exempt) 1 × $0, Study Permit 1 × $150 = **CAD $730**.

Fee-type options offered for a work permit: Work Permit; Open Work Permit Holder Fee; Performing
Artist; Biometrics; Biometrics - Performing Artist; Work Permit - Fee Exempt; Performing Artist -
Fee Exempt; Biometrics - Fee Exempt; Biometrics - Performing Artist - Fee Exempt. For a study
permit: Study Permit; Study Permit - Fee Exempt; Biometrics; Biometrics - Fee Exempt.

---

## TEST Principal and TEST Spouse (work permit from outside Canada)

The questionnaire showed the **same required list and the same optional pool** for both.

### Required (questionnaire wording)

| Document | On final checklist? |
|---|---|
| Application for Work Permit Made Outside of Canada (IMM1295) | Yes (both), under "Application Form(s)" |
| Use of Representative (IMM5476) | Yes (both) |
| Passport or Travel document | Yes, as "Passport" (both) |
| Digital Photo | Yes (both) |
| Custody Documents, including a Parental Consent Letter, if the minor is not accompanied by a parent or legal guardian | *not added* (adults) |
| Registration letter from a designated learning institution (DLI); OR attestation letter from DLI detailing enrollment; OR transcripts from current graduate program demonstrating active engagement. Required only if the spouse or common-law partner is a student | *not added* |
| Provincial attestation letter (Unless exempt) | *not added* |
| Proof of Language Proficiency (Unless exempt) | **Principal only.** It was ticked for the spouse as well, but the spouse's checklist doesn't have it (probably dropped by the "LMIA-exempt = Yes" answer) |

### Optional pool

- **Eligibility:** Certificat d'acceptation du Québec (CAQ) · Client Information · CV/résumé ·
  Education (diplomas/degrees) · Employer Payment Receipt · Employment Contract · Employment
  Reference Letter · Evidence of company relationship · IEC Conditional Acceptance Letter · IMM5802
  Offer of Employment to a Foreign National LMIA-Exempt · Invitation Letter · Labour Market Impact
  Assessment (LMIA) from ESDC · Letter from Current Employer · Offer of Employment · Proof of
  Language Proficiency · Proof of Membership · Proof of school registration · Provincial Nominee
  Program Certificate (PNC) · Representative's Submission Letter · Research Proposal
- **Financial:** LCP Employer - Proof of Financial Means
- **Admissibility:** Police certificate · Proof of upfront medical exam
- **Departmental Forms:** Authority to Release Personal Information to a Designated Individual
  (IMM5475) · Employer Questionnaire and Declaration · Family Information (IMM5645) · General
  Education and Employment Form · Schedule 1 - Application for a Temporary Resident Visa Made
  Outside Canada (IMM 5257) · Statutory Declaration of Common Law (IMM5409)
- **Identification/Travel Docs:** Birth Registration/Certificate · Family Member Proof of Status ·
  Marriage License/Certificate
- or "No additional documents required for this client"

Worth noting: a work permit has **no general proof-of-funds slot** (the only financial item is for
the Live-in Caregiver Program employer). Family Information (IMM5645) and Schedule 1 (IMM 5257) are
*optional* here, even though IRCC's own help text for both says "You must…".

---

## TEST Child (study permit from outside Canada, minor with both parents)

### Required (questionnaire wording)

| Document | On final checklist? |
|---|---|
| Application for Study Permit Made Outside of Canada (IMM1294) | Yes |
| Use of Representative (IMM5476) | Yes |
| Letter of Acceptance | Yes, as "Letter of Acceptance or Letter of Enrollment / Registration" |
| Passport or Travel document | Yes, as "Passport" |
| Digital Photo | Yes |
| Custody Documents, including a Parental Consent Letter, if the minor is not accompanied by a parent or legal guardian | *not added* (accompanied by both parents) |
| Provincial or Territorial Attestation Letter (PAL or TAL) or Proof of Provincial or Territorial Attestation Letter (PAL or TAL) Exception | Yes, as "Proof of Provincial or Territorial Attestation Letter (PAL or TAL) Exception" |
| Proof of Language Test Results (required only if the client is eligible to apply via the Francophone Minority Communities Student Pilot) | *not added* |

### Optional pool

- **Eligibility:** Certificat d'acceptation du Québec (CAQ) · Client Information · Evidence of Work
  Reqmnt Study: Evidence of Work Requirement in Study · Letter of Acceptance from a post-secondary
  Designated Learning Institution · Proof of Guaranteed Investment Certificate (GIC) · Proof of IELTS
  language test results · Proof of TEF language test results · Recent Education Transcript ·
  Representative's Submission Letter · Student Exchange Letter
- **Financial:** Proof of Means of Financial Support · Proof of tuition payment
- **Admissibility:** Police certificate · Proof of upfront medical exam
- **Departmental Forms:** IMM5475 · Employer Questionnaire and Declaration · Family Information
  (IMM5645) · General Education and Employment Form · Schedule 1 (IMM 5257) · Statutory Declaration
  of Common Law (IMM5409)
- **Identification/Travel Docs:** Marriage License/Certificate. **There's no Birth Certificate option
  for the child**, and no Family Member Proof of Status either.

Note: "Recent Education Transcript" was in the questionnaire pool but didn't show up as a
row on the final checklist.

---

## IRCC descriptions (help text on the checklist)

Verbatim, whitespace collapsed; links shown as their link text. "For" lists which of the three got
the slot in this capture. Items with no help text are marked.

**Application for Work Permit Made Outside of Canada (IMM1295).** For: Principal, Spouse.
Refer to the steps on completing the forms

**Application for Study Permit Made Outside of Canada (IMM1294).** For: Child.
This application form uses special features. You can't view it using your Internet browser. These features help us validate the form in our system. To view the form, you need to: use your computer (Mac or PC). The form won't open on mobile devices (iPads, tablets, mobile phones, etc.) install Adobe Reader 10 (or higher) download the PDF file to your computer. Save the file in a place you can remember. make sure you use Adobe Reader to open the form. Sometimes if you try to open the form directly, it will use your Internet browser to try to open it. Note: If you are applying online, you don't need to print and sign the form. Leave the signature section empty.

**Authority to Release Personal Information to a Designated Individual (IMM5475).** For: all.
You may give permission for Immigration, Refugees and Citizenship Canada (IRCC) to release information about your application to another person. This person can be a friend, family member or anyone else of your choice. This person can obtain information about your case (verify the status of your application) change your address. This person cannot be paid by you act as your representative ask IRCC to take action on your file. If you are using an authorized immigration representative, you will need to provide another form. Find more information about immigration representatives and the Use of a Representative (IMM 5476) form.

**Birth Registration/Certificate.** For: Principal, Spouse.
Provide a birth certificate, or birth registration. This is the official document that includes a person's name, and place and date of birth.

**CV/résumé.** For: Principal, Spouse.
A curriculum vitae or résumé is a brief description of your • education; • qualifications; and • work experience (main duties for each job). It should also include your current job title and the city and country where you currently live.

**Certificat d'acceptation du Québec (CAQ).** For: all.
A Certificat d'acceptation du Québec (CAQ) is a document that shows you have been accepted to study or work in the province of Quebec. The Ministère de l'Immigration et des Communautés culturelles (MICC) issues this document. Your Certificat d'acceptation du Québec (CAQ) must be valid for the length of time that you are requesting to stay in Canada. Students who want to study in Québec have the option to submit an approval letter from the Ministère de l'immigration et des Communautés culturelles (MICC) instead of the CAQ. Approval letters are sent by MICC to applicants before the CAQ is issued. If you are applying to work in Canada, further information on the processing of labour market impact assessments and the Certificat d'acceptation du Quebec can be found on the Employment and Social Development Canada's website.

**Client Information.** For: all.
If you would like to provide more information about your application that you have not already provided, you can attach a letter of explanation to your application.

**Digital photo.** For: all.
Temporary residents (students, workers, visitors), Express Entry and Canadian citizenship certificate The photo must show a full front view of the head and tops of shoulders, with the face in the middle of the photo. Size of the head, from chin to crown, must be between 31mm and 36mm. Image size: at least 420 x 540 pixels. We accept JPEG or JPEG2000 format. File size: approximately 240 kB, no more than 4 MB. Image must be in colour (24 bits per pixel) in RGB colour space, the common output for most digital cameras. Temporary residents and Express Entry The final frame size of the photo must be at least 35mm x 45mm. If you scan an existing photo, the minimum resolution must be 600 pixels per inch. Canadian citizenship certificate Final frame size of the photo must be 50mm x 70mm. Upload a colour digital photo taken by a commercial photographer (We don't accept black and white photos). Scanned photos are not accepted. Photo must be taken within the last 6 months. Don't use a smart phone to take the photo. Don't change the digital photos in any way. You must also upload the photographer's information (name, address and date the photo was taken) to the "Client Information" item, under Optional Documents. We accept the photographer's receipt or a text file.

**Education (diplomas/degrees).** For: Principal, Spouse.
You must provide proof that you completed your post-secondary education. Examples of proof of education include a diploma and/or degree. Examples of post-secondary education are: Trade/apprenticeship Training in a specific trade, such as carpentry or auto mechanics; Training in a profession that requires formal education but not at the university level (for example, dental technician or engineering technician); or Training not at the university level for which a certificate/diploma is awarded. Bachelor's degree This is an academic degree awarded by a college or university to those who completed an undergraduate curriculum (also called a baccalaureate). Example: a Bachelor of Arts, Science or Education. Master's degree This is an academic degree awarded by a graduate school of a college or university. Ph.D. This is the highest university degree, usually based on at least three years of graduate studies and a thesis. Normally, you must have completed a Master's degree before a Ph.D. can be earned.

**Employer Payment Receipt.** For: Principal, Spouse. *(no help text)*

**Employer Questionnaire and Declaration.** For: all.
In cases where the occupation does not require a Labour Market Impact Assessment (LMIA), the Employer Declaration form is filled out by the employer or employer's representative (not an agent or recruiter). This form is used along with an application for a work permit where the employer is specified for a foreign national. A Labour Market Impact Assessment (LMIA) assesses whether there are Canadian citizens available to do the job.

**Employment Contract.** For: Principal, Spouse.
You must submit a written employment contract with details of your job and the conditions of your employment. To ensure there is a fair working arrangement between you and your employer, an employment contract must show that the requirements of the immigration program you are applying for are met in the agreement. The contract should outline mandatory employer-paid benefits, including: job duties for each job hours of work wages accommodation arrangements (including room and board, if applicable) holiday and sick leave entitlements terms of resignation or termination transportation to Canada from your country of permanent residence or the country of habitual residence to the location of work in Canada medical insurance coverage provided from the date of your arrival until you are eligible for provincial health insurance workplace safety insurance coverage for the duration of the employment all recruitment fees, including any amount payable to a third-party recruiter or agents hired by the employer that would otherwise have been charged to you

**Employment Reference Letter.** For: Principal, Spouse.
You must provide an employment reference letter (an up-to-date reference from current or past employers). If you have had more than two employers in the last two years, please provide a letter from both employers. Reference letters must be written on company letterhead, show the company's full address and telephone and fax numbers, and be stamped with the company's official seal. The letter should include all of the following information: the specific period of your employment with the company the positions you held during the period of employment and the time spent in each position full details of your main responsibilities in each position your total annual salary plus benefits the signature of your immediate supervisor or the personnel officer at the company a business card of the person signing

**Evidence of company relationship.** For: Principal, Spouse.
You must provide proof of the relationship between the company you work for in your country of origin and the Canadian company you intend to work for while you are in Canada. Examples of evidence of company relationship include proof of your occupation and the duration of your employment at the company in your country of origin and proof of the proposed position at the Canadian company. The Canadian and foreign companies must be legal entities that have a parent, subsidiary, branch or affiliate business relationship. The Canadian and foreign companies must be doing business currently or will be doing business in the future.

**Evidence of Work Reqmnt Study: Evidence of Work Requirement in Study.** For: Child.
You must provide a letter or curriculum from your educational institution stating that work is a necessary requirement for the completion of your studies.

**Family Information (IMM5645).** For: all.
You must complete the Family Information form. This form requests information about your spouse or common-law partner, your parents, your children, step children and adopted children, and your brothers and sisters (including step-siblings and half-siblings). This information will become part of your immigration record and may be used to verify your personal information in future applications.

**Family Member Proof of Status.** For: Principal, Spouse.
You must provide a copy of your family member's Canadian Citizenship or Canadian immigration status document (e.g. Canadian passport, Permanent Resident Card, Study Permit, or Work Permit). Please provide a copy of both sides of the document.

**General Education and Employment Form.** For: all.
A general Education and Employment form must be filled out by residents of China.

**IEC Conditional Acceptance Letter.** For: Principal, Spouse.
International Experience Canada You may be eligible to come to Canada through the International Experience Canada initiative. Before applying for a work permit from IRCC, you must meet the criteria to participate in the International Experience Canada initiative. You will receive a conditional acceptance letter if you meet the criteria. You will need this letter in order to apply for a work permit.

**IMM5802 Offer of Employment to a Foreign National LMIA-Exempt.** For: Principal, Spouse. *(no help text)*

**Invitation Letter.** For: Principal, Spouse.
You must provide a letter of invitation from the person inviting you to Canada. The letter must be written by the host and should have specific information about the host and invitee. The letter should state the purpose and length of the visit, the nature of the relationship between you and the host, the contact information of the host, etc. If you are being invited to conduct business in Canada, a letter of invitation should be printed on the company's letterhead and include: the host's full name, title and business contact information a brief summary of the reason for the invitation, including details of the business or trade to be undertaken the full names of all employees from your company who are being invited by your host the intended duration and a detailed itinerary of the visit a statement specifying who will be responsible for all travel-related expenses

**LCP Employer - Proof of Financial Means.** For: Principal, Spouse.
The Canadian employer hiring you under the Live-in Caregiver Program must have the required financial means to employ you. Your employer will need to provide proof of financial means. This proof must come from a reliable or easily verifiable Canadian source such as a government department, bank or employer. This can be shown through at least one of the following documents: proof of their most recent income tax return (in Canada, this is known as a notice of assessment and is provided by Canada Revenue Agency) bank statements for the last 3 months a letter of employment stating salary and duration of employment pay stubs statements of remuneration financial statements prepared by a licensed professional. If you do not have this information but your employer has told you they will send their proof to IRCC, please attach a letter explaining this. Please ensure that your letter includes contact information for your employer (phone number and email address).

**Labour Market Impact Assessment (LMIA) from ESDC.** For: Principal, Spouse.
A Labour Market Impact Assessment (LMIA) is a document that an employer in Canada must usually get before hiring a foreign worker. An LMIA assesses whether there are Canadians available to do the job. A positive LMIA will show that there is a need for a foreign worker to fill the job and that no Canadian worker can do the job. A positive LMIA is sometimes called a Confirmation letter. Your proposed employer would have received the LMIA from Employment and Social Development Canada (ESDC).

**Letter from Current Employer.** For: Principal, Spouse.
You must provide a letter from your current employer or proof of annotated pay stubs from your employer. This is used to confirm the details of your financial profile Financial profile details include your job status (full‑time or part‑time), how long you have worked for the company, your occupation, etc.

**Letter of Acceptance or Letter of Enrollment / Registration.** For: Child (the required "Letter of Acceptance").
If you are applying for a Study Permit for the first time, please submit a Letter of Acceptance. A letter of acceptance is issued by the Designated Learning Institution, in Canada, on official letterhead, and shows the exact amount of tuition fees you are required to pay, the anticipated starting and finishing dates, and the date by which you need to register. If you are a student applying to extend your study permit please request the Designated Learning Institution, in Canada, to issue you a "Letter of Enrolment/Registration". The letter should include how long you have been studying at that institution, and if applicable, your expected graduation date. If you have studied at any other education institution while in Canada, you must include proof of studies, such as transcripts, certificates or diplomas since your last study permit. Please note that you must also submit a letter of acceptance if you will be continuing your studies at a new institution.

**Letter of Acceptance from a post-secondary Designated Learning Institution.** For: Child.
You must submit a copy of: • your Letter of Acceptance from a post-secondary Designated Learning Institution

**Marriage License/Certificate.** For: all.
If you were married in Canada: You must have a marriage certificate issued by the province or territory where the marriage took place. If you were married outside Canada: The marriage must be valid under the law of the country where it took place and under Canadian law. A marriage performed in an embassy or consulate must comply with the law of the host country where it took place, not the country of nationality of the embassy or consulate.

**Offer of Employment.** For: Principal, Spouse.
You must provide a job offer letter from the employer who wants to hire you. It must be printed on company letterhead, and state that you will be employed permanently in Canada by that company. The letter must specify whether the job is: for continuous, paid, full-time work (at least 30 hours a week), for work that is permanent and not seasonal, TEER 0, 1, 2 or 3 of the 2021 National Occupational Classification (NOC) (Note - in most cases, the job offer must be for a permanent job. For some types of jobs, it has to be for at least one year.) The job offer letter must include contact information for the company (address, telephone number and email address).
*(This is the permanent-residence wording, reused for a temporary work permit.)*

**Passport.** For: all.
You must submit a legible copy of your valid travel document which you will use to travel. If you have a passport, you must provide a copy of: the page that shows your birth date and country of origin, and any pages with stamps, visas or markings. If you do not have a passport and must use another travel document, it must be issued by a government and include your: name, date of birth, document number, citizenship or residency status, photo, and expiry date (if applicable).

**Police certificate.** For: all.
You must provide a police certificate from this country or territory. We use police certificates to find out if you have a criminal record. They help us make sure you are not a security risk to Canada. Find out how to get a police certificate.

**Proof of Guaranteed Investment Certificate (GIC).** For: Child.
You must have an eligible Guaranteed Investment Certificate (GIC) from a participating Canadian financial institution. This is to show that you have enough money to cover living expenses for your first year in Canada. You must submit a receipt from your financial institution showing your GIC amount.

**Proof of IELTS language test results.** For: Child.
You must submit a copy of: • your International English Language Testing System (IELTS)

**Proof of Language Proficiency.** For: Principal.
If you're applying for a Post-Graduation Work Permit (PGWP), you must provide proof of English or French language skills. The only exception is if you graduated from a PGWP-eligible flight school. You can learn more about the eligibility requirements. If you graduated from a PGWP-eligible flight school, you are not required to provide proof of language proficiency.
*(PGWP-only wording, even though the slot appears on an employer-specific application.)*

**Proof of Means of Financial Support.** For: Child.
Temporary Residents If you are visiting Canada, you must prove that you can support yourself and the family members who will be with you while you are in Canada. Provide as many of these documents as you can: your bank statements for the past four months a bank draft in convertible currency pay stubs an employment letter proof of assets or business proof of payment of tuition and accommodation fees tax reports, declarations or statements proof of a student/education loan from a financial institution a letter from the person or institution providing you with money proof of funding paid from within Canada, if you have a scholarship or are in a Canadian-funded educational program proof of a Canadian bank account in your name if money has been transferred to Canada Express Entry - Permanent Residents If you are applying for permanent residence in Canada, you must provide an official letter issued by your financial institution indicating your financial profile. This must: list of all your bank (chequing and savings) and investment accounts, the account numbers, dates each account was opened and the balance of each account over the past six months, list all outstanding debts, such as credit cards and loans, be printed on the letterhead of the financial institution, and include your name and the contact information of the financial institution (address, telephone number and e-mail address).

**Proof of Membership.** For: Principal, Spouse.
If your intended occupation in Canada is regulated, you must provide evidence that the responsible provincial, territorial or professional body has granted you the required licence or certification. Regulated occupations are also called professions, skilled trades or apprenticeable trades. If you are required to become a member of an association, include your membership document.

**Proof of Provincial or Territorial Attestation Letter (PAL or TAL) Exception.** For: Child.
Please upload a document showing the exception you meet. If you don't have a specific document that proves you meet one of the exceptions, please attach a letter of explanation to note how one of the exceptions applies to your situation.

**Proof of TEF language test results.** For: Child.
You must submit a copy of: • your Test d'évaluation de Français (TEF) score

**Proof of school registration.** For: Principal, Spouse.
You must provide a letter from your educational institution that shows that you are currently registered at that institution.

**Proof of tuition payment.** For: Child.
Your first year of tuition must already be paid. To show proof, you must submit something like: a tuition receipt a receipt from your bank that shows your funds have been transferred to the school you're attending

**Proof of upfront medical exam.** For: all.
You require a medical exam. Learn how to get an upfront medical exam. In order to submit your online application, you will need to upload the information printout sheet or the IMM 1017B Upfront Medical Report form. Your doctor will give you one of these forms when you complete your medical exam. If you cannot get a medical exam before the deadline to submit your application, you may submit proof that you have scheduled an appointment.

**Provincial Nominee Program Certificate (PNC).** For: Principal, Spouse.
You must provide your provincial nominee certificate. Certain provinces and territories in Canada have an agreement with the Government of Canada that allows them to nominate immigrants who wish to settle in that province or territory. If you choose to immigrate to Canada as a provincial nominee, you must first apply to the province or territory where you want to settle and complete its provincial nomination process. The province or territory will consider your application based on its immigration needs and your genuine intention to settle there. They will issue you a provincial nominee certificate under this program. Once you have been successfully nominated by a province or territory, you will receive confirmation of nomination from the province. Depending on which province or territory nominated you, this could be a nomination approval letter or other confirmation. You must submit a copy of this with your application to IRCC. Learn more about the Provincial Nominee Program.

**Representative's Submission Letter.** For: all.
If you have indicated that you are using the services of a paid representative, provide the representative's submission letter. This letter can be obtained from your paid representative, and must be attached to your application.

**Research Proposal.** For: Principal, Spouse.
Provide a summary of the research activities in which you will be participating in Canada.

**Schedule 1 - Application for a Temporary Resident Visa Made Outside Canada (IMM 5257).** For: all.
You must provide a Schedule 1 declaration. A Schedule 1 declaration is a form with questions about your personal history. You will be asked to list information such as any affiliations with organizations and any military or government service.

**Statutory Declaration of Common Law (IMM5409).** For: all.
You must provide proof that you and your common-law partner have combined your affairs and set up a household together. Proof can include: joint bank accounts or credit cards joint ownership of a home joint residential leases joint rental receipts joint utilities (electricity, gas, telephone) joint management of household expenses proof of joint purchases, especially for household items mail addressed to either person or both people at the same address

**Student Exchange Letter.** For: Child.
You must provide a letter issued by the educational institution, printed on official letterhead, stating that you will be completing an academic exchange in Canada. This letter: confirms your acceptance or registration describes the exchange program includes the duration of the program includes information on fees includes the name of the institution

**Use of Representative (IMM5476).** For: all.
You must provide a completed Use of a Representative form (IMM 5476). A representative (either paid or unpaid) can conduct business on your behalf. In other words, a representative can obtain information on the status of an application, request file separation or transfer, provide updated information on your behalf, request that an action be taken by Immigration, Refugees and Citizenship Canada, or change an address. You may only select one person to act as your representative.

General upload rules (instructions page): one file per document type, max 4 MB per file,
PDF/JPG/TIFF/PNG/DOC/DOCX; forms are not hand-signed online (a digital signature is given at
transmission); 60 days to submit.

---

## Compared with `owp-worker-spouse` ("Work Permit — Spouse of a Foreign Worker", platform/lib/appTypes.js)

**The scenarios don't match.** `owp-worker-spouse` is written for a spouse joining a worker who is
**already in Canada** (items 132–138: the spouse's work permit with 16+ months left, employment letter,
pay slips, funds, invitation letter, lease). In this family case the principal applies **at the
same time from Iran**, so none of those exist yet. What the spouse's file actually hangs on is the
principal's LMIA, job offer and contract, which the portal offers as slots on the spouse's
application too. The app has **no type for the principal** (an employer-specific, LMIA-based work
permit from outside Canada), so there's nothing to compare the principal's list with.

### In the portal but not in the checklist

| Portal item (spouse) | Status in portal | Note |
|---|---|---|
| Proof of upfront medical exam | optional | Not in the checklist at all. Decide per case whether an upfront medical is needed. |
| Labour Market Impact Assessment (LMIA) from ESDC | optional | For a spouse applying with the principal, this is the principal's LMIA. No checklist item. |
| Offer of Employment / Employment Contract | optional | The principal's offer and contract. No checklist item. (IRCC's Offer-of-Employment help text is PR wording.) |
| Family Member Proof of Status | optional | Closest match is 132 "Spouse's work permit". But the portal wants both sides of the status document, and when applying together there's no permit yet. |
| Representative's Submission Letter | optional | The app has it as a letter (`LETTER.submission`), not a checklist item. Fine as long as the letter reaches upload. |
| Proof of Language Proficiency | required "(Unless exempt)" | Checklist 110 says "not required for the spouse". It's consistent in practice: it didn't appear on the spouse's final checklist. |
| Client Information | optional | The upload slot for letters of explanation **and the photographer's details** (the Digital photo help requires them). The checklist doesn't mention the photographer's details. |

### In the checklist with no matching portal slot

These go into Client Information (or are firm-internal):
Form 100, Form 111 (POT questionnaire), Form 124 (profile), Form 128 (background), national ID, transcripts,
financial documents and source of funds (**work permits have no proof-of-funds slot**), social-insurance
record, certificates, residence-abroad certificate, business documents, title deeds, flight reservation,
Purpose of Travel letter, military service card, previous Canadian applications, and all the
"spouse in Canada" items 132–138 (pay slips, invitation letter, accommodation).
Invitation letter (137) *could* use the portal's "Invitation Letter" slot, but that help text is written for
visitors and business hosts.

### Matches

| Checklist | Portal slot |
|---|---|
| IMM 1295 (form) | Application for Work Permit Made Outside of Canada (IMM1295), required |
| IMM 5476 / REP | Use of Representative (IMM5476), required |
| 103 Passport | Passport or Travel document, required |
| 104 Digital photo | Digital Photo, required |
| IMM 5645 (form) | Family Information (IMM5645), optional |
| IMM 5257 Schedule 1 (form) | Schedule 1 (IMM 5257), optional |
| 101 Birth certificate | Birth Registration/Certificate, optional |
| 116 Marriage certificate | Marriage License/Certificate, optional |
| 115 Police clearance | Police certificate, optional |
| 105 Degree | Education (diplomas/degrees), optional |
| 127 CV (if available) | CV/résumé, optional |
| 113 Employment letter | Employment Reference Letter (optional). IRCC wants letterhead, full address, phone and fax, **company seal**, positions and time in each, annual salary **plus benefits**, supervisor signature **and the signer's business card**. The checklist hint doesn't mention the seal, fax, benefits or business card. |

### Child (for reference; no checklist of its own compared)

The closest app type is `study-permit-child-of-worker`, but it also assumes a parent already in Canada.
Differences from the portal: the portal **requires the PAL/TAL or proof of an exception**, which has no
checklist item (the app has `LETTER.palExemption`). The portal requires the Letter of Acceptance,
which the app marks "if available". And the portal gives the child **no birth-certificate slot**,
so the app's 101 has to go under Client Information.
