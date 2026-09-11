# Contract workflow guide

For staff who create, send, and follow up client agreements in Odoo. Covers both
Sugimoto Visa and Sparkbridge, all ten agreement templates, and the custom-upload path.

## 1. Before you start a quotation

Every agreement is generated from two places: the **quotation** (fees, payment plan,
service) and the **customer** (name, address, Farsi details, family members). Fill the
CRM card first — the quotation borrows nothing else.

On the CRM card, open the **Address & family** tab and enter:

- **Residential address** — street, city, province (Canada only), postal code, country.
  Country and province are required before a contract can be sent (they set the sales tax).
- **Name (Farsi)** and **Residential address (Farsi)** — printed on every bilingual agreement.
- **National ID / passport no.** — used on Sparkbridge retainers (SB-C/D/E).
- **Family members** table — one row per spouse, child, companion, guardian, or sponsor,
  with their name in English and Farsi. This is what makes an agreement read "...the
  Client, X, and the accompanying spouse, Y, and the dependent child, Z...". Leave it
  empty if the client has no dependents on the file.
- **Names are mandatory once a member is added.** Every spouse, child or companion row
  needs the name in English, and on bilingual agreements (TR, PFL, ENT, SB-A, SB-C, SB-D,
  SB-E) also the name in Farsi, plus the client's own Farsi name. Submit for Approval,
  Preview Agreement and Send Contract all refuse to generate the draft until these are
  filled, and the error lists exactly which names are missing.

Everything typed on the card is copied to the customer record automatically. Do **not**
edit the address on the customer directly — the next CRM card edit will overwrite it.

## 2. Building the quotation

1. Create a quotation from the correct **quotation template** (Sales → Quotations → New →
   pick the template matching the client's service, e.g. `SP-ADM`, `EE`, `EU-SUV`). The
   template's product carries the **agreement tag** (TR, PR, SPON, ENT, PFL, SB-A, SB-C,
   SB-D, SB-E, or SB-F) that decides which document gets generated. Do not mix products
   with different agreement tags on one quotation — the send action refuses that.
2. Check the **customer** field points at the right contact, with an email and a country
   (and province, for Canada) already set.
3. Open the **Payment plan** tab. A default plan is filled in automatically from the
   service the moment you save with the template's lines on the order — check the
   instalment amounts and due milestones make sense for this client, and edit any row if
   the client agreed to something different. Use "Recalculate amounts" if you change the
   fee lines and want the shares re-computed.
4. Open the **Agreement details** tab and fill in whatever the template needs:

   | Template | Fill in |
   |---|---|
   | TR | Nothing extra — the service list on the order supplies section 2. |
   | PR | Leave **Application / program** empty to print the service name, or set it (e.g. a free-text program under RCIP) if the client's file needs different wording. |
   | SPON | Choose the **Sponsor** contact — required, the send action refuses without it. |
   | ENT (entrepreneur) | Nothing extra; the province-specific scope text comes from the service (AB-ENT / BC-ENT). |
   | PFL | Fill **all four**: Application / program (EN + FA), IRCC application no., Letter date, IRCC deadline, and Documents due from client. The send action refuses without them. |
   | SB-A / SB-C | Set **Application / program** to the destination country (EN + FA) — it prints in section 1/2. |
   | SB-D / SB-E / SB-F | Nothing extra. |

## 3. Sending the agreement

Press **Send Contract** (top of the quotation, next to the state buttons).

- The system pulls the fees, discount, tax, payment plan, program line, and dependants
  from the quotation and customer, renders the correct PDF(s), and creates a Sign request
  with only signature and date boxes on a dedicated last page — nothing to hand-fill.
- A **contract number** is drawn automatically the first time a quotation is sent:
  `SyyNNN` for Sugimoto files, `SB0000yyNNN` for Sparkbridge contracts. An entrepreneur
  file (BC-ENT / AB-ENT) sends **two** agreements — Sparkbridge and Sugimoto — and the
  Sugimoto one carries `SG0000yyNNN` with the same digits as the Sparkbridge number.
  The number appears in the quotation's Customer Reference field; re-sending keeps it.
- **Sugimoto** agreements go to Hamed to sign first; **Sparkbridge** agreements go to Ken
  (`ken@sparkbridge.ca`) first. Either way, the client is e-mailed once the RCIC / Ken has
  signed and their filled-in values are visible.
- **Custom agreement.** If the service has no template of its own, or the client needs a
  negotiated document, upload a PDF in **Custom agreement (PDF)** on the quotation (a
  Google Docs link alone is not enough — download it as PDF first: File → Download → PDF).
  Send Contract then turns that PDF into a Sign template with boxes on its last page and
  opens the Sign editor so you can nudge the boxes before pressing Send.

### Resending

Use **Resend Contract** after editing the quotation (fee change, corrected address,
wrong program line). It cancels the previous request — unless it was already signed —
and sends a new one with the same contract number. A signed agreement is never replaced;
if something needs to change after signing, do it under Termination/Amendment, not by
resending.

## 4. Following up

- **Where to check status.** The quotation shows the linked Sign request(s) (Agreement
  details tab for the second one on an entrepreneur file). Open the request to see who
  has signed and who is pending.
- **Reminder.** Sign sends its own reminder e-mails; you can also open the request and use
  its "Remind" action if the client has gone quiet.
- **Client asks to change something before signing.** Edit the quotation (fees, plan,
  program line, address) and press Resend Contract — do not ask the client to edit the PDF.
- **Once everyone has signed:** the quotation confirms itself, the signed PDF is filed on
  the quotation and the opportunity, and the card automation moves the stage. Nothing
  further to do.
- **Wrong template used, or the client's service changed:** fix the order lines / template
  on the quotation, then Resend Contract — the new agreement matches the corrected lines.

## 5. Common errors and what they mean

| Message | What to do |
|---|---|
| "The customer has no e-mail address." | Add one on the customer, then send again. |
| "Set the customer's country..." / "...province..." | Fill the address on the CRM card (Address & family tab) — it syncs to the customer. |
| "The draft was not generated. Complete the family members on the CRM card..." | A spouse/child/companion row (or the client) is missing a name in English or Farsi. Fill it on the CRM card, Address & family tab, then try again. |
| "No agreement template is defined for: ..." | The product on that line has no agreement tag. Tag it under Sales → Products, or use the custom-agreement upload instead. |
| "The payment plan is empty." | Add at least one row on the Payment plan tab (or press Recalculate). |
| "The payment plan adds up to X but the contract total is Y." | Fix the instalment amounts, or set the last row's share to "Remainder" so it absorbs the difference. |
| "Choose the Sponsor..." | Sponsorship agreement — pick the sponsor contact on the Agreement details tab. |
| "For a PFL agreement fill in Agreement details..." | Fill all four PFL fields listed in section 2 of this guide. |
| "A link to the agreement was given but no PDF was uploaded." | Download the Google Doc as PDF and upload it in Custom agreement (PDF). |
| "Invalid fields: Account Receivable / Account Payable" when saving a contact | This should no longer happen (fixed 2026-09-10). If it recurs, reload the page first — it is a stale cached form, not a real requirement. |

## 6. The ten templates at a glance

| Code | Company | Language | Used for |
|---|---|---|---|
| TR | Sugimoto Visa | EN + FA | Study/work/visitor permits and related services |
| PR | Sugimoto Visa | EN | PR, citizenship, PR card, and related services |
| SPON | Sugimoto Visa | EN | Spousal/child/parent sponsorship |
| ENT | Sugimoto Visa | EN + FA | Sugimoto half of the BC/AB entrepreneur streams |
| PFL | Sugimoto Visa | EN + FA | Procedural Fairness Letter responses |
| SB-A | Sparkbridge | EN + FA | EU study admission |
| SB-C | Sparkbridge | EN + FA | EU start-up visa |
| SB-D | Sparkbridge | EN + FA | BC business advisory (Sparkbridge half of BC-ENT) |
| SB-E | Sparkbridge | EN + FA | Alberta designated-agency LoR (Sparkbridge half of AB-ENT) |
| SB-F | Sparkbridge | EN | Business event consulting |

House rules the templates always follow (paper size, fonts, logos, no blank sections,
signature spacing, one-program PR wording, dependants named after the applicant) are in
`TEMPLATE_RULES.md` in this folder — read it before changing any clause text.
