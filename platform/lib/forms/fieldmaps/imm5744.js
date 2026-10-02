/**
 * Field map: IMM 5744 (Consent for an Access to Information and Personal
 * Information Request) — the client consents to the firm requesting their
 * file (GCMS notes) from IRCC.
 *
 * Designated requester: the firm's RCIC, the firm, its address and email
 * (lib/firm.js, through imm5476Data). Applicant: the client's name and date
 * of birth. Signatures and dates are left for the client.
 */

const P = 'IMM_5744/Page1';

export function imm5744FieldMap() {
  return [
    { som: `${P}/DRI_Sub/DRInfoSub1/Family_name`, from: '_repFamilyName' },
    { som: `${P}/DRI_Sub/DRInfoSub1/Given_name`, from: '_repGivenName' },
    { som: `${P}/DRI_Sub/DRInfoSub1/Firm`, from: '_firmName' },
    { som: `${P}/DRI_Sub/DRInfoSub2/Address`, from: '_firmAddress' },
    { som: `${P}/DRI_Sub/DRInfoSub2/EmailAddress`, from: '_firmEmail' },
    { som: `${P}/AppIndividSub/AppInfoSub/Family_name`, from: 'familyName', need: 'Applicant family name', field: 'familyName' },
    { som: `${P}/AppIndividSub/AppInfoSub/Given_name`, from: 'givenName', field: 'givenName' },
    { som: `${P}/AppIndividSub/AppInfoSub/DateBirth`, from: 'dob', need: 'Applicant date of birth', field: 'dob' },
  ];
}
