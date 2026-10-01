/**
 * Field map: IMM 5257 Schedule 1 (Application for Temporary Residence — Background
 * Declaration), form version 01-09-2023.
 *
 * This form binds its fields to data names of its own (the "Family name" box
 * is Schedule1/FamilyName, the rows of each table are …Details/…Detail[n]) and
 * its Yes/No questions store true / false. Paths below are the resolved data
 * paths (lib/forms/xfa_fields.py). Each table has four rows (question 5 has
 * three); more rows are reported so they can be added by hand.
 *
 * The tables come from the intake's lists (militaryService, witnessedEvents,
 * organizations, govPositions, trips — lib/schema.js), and every entry names
 * the intake answer it comes from (`field`), so a box left to do links to it.
 */

import { ym, normalizeUci } from './ircc';
import { filledRows } from '../../schema';

const P = 'Schedule1';
const tf = (v) => (v === true ? 'true' : v === false ? 'false' : '');
const row = (base, i) => `${base}${i ? `[${i}]` : ''}`;

/**
 * One table: From / To and the other columns of each row, up to `max` rows.
 * A row with a year but no month gets the year, and a note.
 */
function table(base, list, columns, field, what, notes, max = 4) {
  const out = [];
  list.slice(0, max).forEach((r, i) => {
    const b = row(base, i);
    const [fy, fm] = ym(r.from);
    const [ty, tm] = ym(r.to);
    out.push(
      { som: `${b}/From/Year`, const: fy, field },
      { som: `${b}/From/Month`, const: fm, field },
      { som: `${b}/To/Year`, const: ty, field },
      { som: `${b}/To/Month`, const: tm, field },
      ...Object.entries(columns).map(([col, key]) => ({ som: `${b}/${col}`, const: r[key], field, label: `${what} ${i + 1}: ${col.replace(/Code$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}` }))
    );
    const name = r.country || r.organization || r.location || '';
    if (!fy || !ty) notes.push({ text: `${what} ${i + 1}${name ? ` (${name})` : ''}: the ${!fy ? 'start' : 'end'} date is missing`, field });
    else if (!fm || !tm) notes.push({ text: `${what} ${i + 1}${name ? ` (${name})` : ''}: the month is missing (only the year is known)`, field });
  });
  if (list.length > max) notes.push({ text: `Schedule 1 has ${max} rows for ${what.toLowerCase()}s; ${list.length - max} more must be added in Adobe (the "+" button)`, field });
  return out;
}

/** Question 8 asks for trips since age 18 or in the past five years, whichever is more recent. */
export function tripsToDeclare(d = {}, today = new Date()) {
  const fiveYears = `${today.getFullYear() - 5}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const dob = String(d.dob || '').match(/^(\d{4})-(\d{2})/);
  const adult = dob ? `${Number(dob[1]) + 18}-${dob[2]}` : '';
  const since = adult > fiveYears ? adult : fiveYears;
  return filledRows(d.trips).filter((t) => {
    const end = String(t.to || t.from || '');
    if (!end) return true;
    // A bare year counts until the end of that year.
    return (end.length === 4 ? `${end}-12` : end) >= since;
  });
}

export function imm5257bFieldMap(d = {}, app = {}) {
  const notes = [];
  const trips = tripsToDeclare(d);
  const travelled = typeof d.travelledAbroad === 'boolean' ? d.travelledAbroad && (trips.length > 0 || !filledRows(d.trips).length) : trips.length ? true : undefined;
  const Q = (key, yes, list) => {
    const answer = typeof d[yes] === 'boolean' ? d[yes] : filledRows(d[list]).length ? true : undefined;
    return answer;
  };
  const military = Q('military', 'bgMilitary', 'militaryService');
  const witnessed = Q('witnessed', 'bgWitnessed', 'witnessedEvents');
  const member = Q('member', 'bgOrganization', 'organizations');
  const position = Q('position', 'bgGovPosition', 'govPositions');

  const map = [
    // The applicant of this file answers as the principal applicant, except an
    // accompanying spouse or adult child on the principal's application.
    { som: `${P}/PrincipalApplicant`, const: ['trv-spouse', 'trv-child'].includes(app.type) ? 'false' : 'true' },
    { som: `${P}/FamilyName`, from: 'familyName', need: 'Family name', field: 'familyName' },
    { som: `${P}/GivenName`, from: 'givenName', field: 'givenName' },
    { som: `${P}/ApplicantBirthDate/Year`, from: 'dob', transform: 'year', need: 'Date of birth', field: 'dob' },
    { som: `${P}/ApplicantBirthDate/Month`, from: 'dob', transform: 'month', field: 'dob' },
    { som: `${P}/ApplicantBirthDate/Day`, from: 'dob', transform: 'day', field: 'dob' },
    { som: `${P}/UCI`, const: normalizeUci(d.uci), field: 'uci' },

    { som: `${P}/MilitaryServiceInfo/ServedInMilitary`, const: tf(military), need: 'Question 4 — military service (Yes/No)', field: 'bgMilitary' },
    ...(military === true
      ? table(`${P}/MilitaryServiceInfo/MilitaryServiceDetails/MilitaryServiceDetail`, filledRows(d.militaryService), { Location: 'location', Province: 'province', CountryCode: 'country' }, 'militaryService', 'Military service', notes)
      : []),

    { som: `${P}/WarHumanityCrimesInfo/HaveWitnessedParticipated`, const: tf(witnessed), need: 'Question 5 — ill treatment, looting or desecration (Yes/No)', field: 'bgWitnessed' },
    ...(witnessed === true
      ? table(`${P}/WarHumanityCrimesInfo/WarHumanityCrimesDetails/WarHumanityCrimesDetail`, filledRows(d.witnessedEvents), { Location: 'location', Province: 'province', CountryCode: 'country', Details: 'details' }, 'witnessedEvents', 'Event', notes, 3)
      : []),

    { som: `${P}/MembershipAssociationInfo/BeenMemberAssociated`, const: tf(member), need: 'Question 6 — membership of organizations (Yes/No)', field: 'bgOrganization' },
    ...(member === true
      ? table(`${P}/MembershipAssociationInfo/MembershipAssociationDetails/MembershipAssociationDetail`, filledRows(d.organizations), { NameOfOrganization: 'organization', ActivitiesPositionHeld: 'activities', Province: 'province', CountryCode: 'country' }, 'organizations', 'Organization', notes)
      : []),

    { som: `${P}/GovernmentPositionsInfo/HeldGovernmentPositions`, const: tf(position), need: 'Question 7 — government positions (Yes/No)', field: 'bgGovPosition' },
    ...(position === true
      ? table(`${P}/GovernmentPositionsInfo/GovernmentPositionsDetails/GovernmentPositionsDetail`, filledRows(d.govPositions), { CountryCode: 'country', LevelOfJurisdiction: 'jurisdiction', DepartmentBranch: 'department', ActivitiesPositionHeld: 'activities' }, 'govPositions', 'Position', notes)
      : []),

    { som: `${P}/PreviousTravelInfo/TraveledOtherCountry`, const: tf(travelled), need: 'Question 8 — previous travel (Yes/No)', field: 'travelledAbroad' },
    ...(travelled === true
      ? table(`${P}/PreviousTravelInfo/PreviousTravelDetails/PreviousTravelDetail`, trips, { CountryCode: 'country', Location: 'city', PurposeOfTravel: 'purpose' }, 'trips', 'Trip', notes)
      : []),
  ];

  if (military === true && !filledRows(d.militaryService).length) notes.push({ text: 'Military service is Yes but no period of service is in the intake', field: 'militaryService' });
  if (witnessed === true && !filledRows(d.witnessedEvents).length) notes.push({ text: 'Question 5 is Yes but no details are in the intake', field: 'witnessedEvents' });
  if (member === true && !filledRows(d.organizations).length) notes.push({ text: 'Question 6 is Yes but no organization is in the intake', field: 'organizations' });
  if (position === true && !filledRows(d.govPositions).length) notes.push({ text: 'Question 7 is Yes but no position is in the intake', field: 'govPositions' });
  if (travelled === true && !trips.length) notes.push({ text: 'Travel is Yes but no trips are listed in the intake', field: 'trips' });
  if (d.travelledAbroad === true && filledRows(d.trips).length && !trips.length) notes.push({ text: 'The trips in the intake are all older than question 8 asks (since age 18 or the past 5 years) — answered No', field: 'trips' });
  return { map, notes };
}
