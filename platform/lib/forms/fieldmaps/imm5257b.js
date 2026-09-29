/**
 * Field map: IMM 5257 Schedule 1 (Application for Temporary Residence), form
 * version 01-09-2023 — 16 fields, all Yes/No questions with a details box.
 *
 * Only what the intake holds is filled: previous travel (the countries visited
 * in the last 10 years). Military service, organisations, government positions
 * and war-crimes questions are the applicant's to answer and sign.
 */

const has = (v) => String(v || '').trim().length > 0;
const P = 'Schedule1';

export const IMM5257B_FIELD_MAP = [
  { som: `${P}/PreviousTravelInfo/TraveledOtherCountry`, const: 'Y', when: (d) => has(d.countriesVisited) },
  { som: `${P}/PreviousTravelInfo/PreviousTravelDetails/PreviousTravelDetail`, from: 'countriesVisited' },
];
