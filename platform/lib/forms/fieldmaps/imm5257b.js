/**
 * Field map: IMM 5257 Schedule 1 (Application for Temporary Residence — Background
 * Declaration), form version 01-09-2023.
 *
 * This form binds its fields to data names of its own (the "Family name" box
 * is Schedule1/FamilyName, the rows of each table are …Details/…Detail[n]) and
 * its Yes/No questions store true / false. Paths below are the resolved data
 * paths (lib/forms/xfa_fields.py). Each table has four rows; more rows are
 * reported so they can be added by hand.
 */

import { rows, ym, normalizeUci, yn } from './ircc';

const P = 'Schedule1';
const ROWS = 4;
const row = (base, i) => `${base}${i ? `[${i}]` : ''}`;

/** The rows of one table: [{ from, to, ...columns }] from a "a | b | c" intake list. */
function table(text, columns) {
  return rows(text).map((cells) => {
    const [from, to, ...rest] = cells;
    const [fy, fm] = ym(from);
    const [ty, tm] = ym(to);
    const r = { fy, fm, ty, tm };
    columns.forEach((c, i) => (r[c] = rest[i] || ''));
    // A free-text line (no "|"): keep it whole in the first text column.
    if (cells.length === 1 && !fy) r[columns[0]] = cells[0];
    return r;
  });
}

/** Rows plus the dates of each: { som, value } specs for one table. */
function tableSpecs(base, list, columns) {
  const out = [];
  list.slice(0, ROWS).forEach((r, i) => {
    const b = row(base, i);
    out.push(
      { som: `${b}/From/Year`, const: r.fy },
      { som: `${b}/From/Month`, const: r.fm },
      { som: `${b}/To/Year`, const: r.ty },
      { som: `${b}/To/Month`, const: r.tm },
      ...Object.entries(columns).map(([col, key]) => ({ som: `${b}/${col}`, const: r[key] }))
    );
  });
  return out;
}

export function imm5257bFieldMap(d = {}, app = {}) {
  const military = table(d.militaryDetails, ['location', 'province', 'country']);
  const witnessed = table(d.witnessedDetails, ['details', 'province', 'country']);
  const orgs = table(d.organizationDetails, ['organization', 'activities', 'province', 'country']);
  const positions = table(d.govPositionDetails, ['country', 'jurisdiction', 'department', 'activities']);
  const trips = table(d.countriesVisited, ['country', 'location', 'purpose']);
  const travelled = d.travelledAbroad ?? (trips.length ? true : undefined);

  const map = [
    // The applicant of this file answers as the principal applicant, except an
    // accompanying spouse on the principal's application.
    { som: `${P}/PrincipalApplicant`, const: app.type === 'trv-spouse' ? 'false' : 'true' },
    { som: `${P}/FamilyName`, from: 'familyName', need: 'Family name' },
    { som: `${P}/GivenName`, from: 'givenName' },
    { som: `${P}/ApplicantBirthDate/Year`, from: 'dob', transform: 'year', need: 'Date of birth' },
    { som: `${P}/ApplicantBirthDate/Month`, from: 'dob', transform: 'month' },
    { som: `${P}/ApplicantBirthDate/Day`, from: 'dob', transform: 'day' },
    { som: `${P}/UCI`, const: normalizeUci(d.uci) },

    { som: `${P}/MilitaryServiceInfo/ServedInMilitary`, const: yn(d.bgMilitary), need: 'Military service (Yes/No)' },
    ...(d.bgMilitary === true
      ? tableSpecs(`${P}/MilitaryServiceInfo/MilitaryServiceDetails/MilitaryServiceDetail`, military, { Location: 'location', Province: 'province', CountryCode: 'country' })
      : []),

    { som: `${P}/WarHumanityCrimesInfo/HaveWitnessedParticipated`, const: yn(d.bgWitnessed), need: 'Witnessed ill treatment (Yes/No)' },
    ...(d.bgWitnessed === true
      ? tableSpecs(`${P}/WarHumanityCrimesInfo/WarHumanityCrimesDetails/WarHumanityCrimesDetail`, witnessed, { Details: 'details', Province: 'province', CountryCode: 'country' })
      : []),

    { som: `${P}/MembershipAssociationInfo/BeenMemberAssociated`, const: yn(d.bgOrganization), need: 'Membership in organizations (Yes/No)' },
    ...(d.bgOrganization === true
      ? tableSpecs(`${P}/MembershipAssociationInfo/MembershipAssociationDetails/MembershipAssociationDetail`, orgs, { NameOfOrganization: 'organization', ActivitiesPositionHeld: 'activities', Province: 'province', CountryCode: 'country' })
      : []),

    { som: `${P}/GovernmentPositionsInfo/HeldGovernmentPositions`, const: yn(d.bgGovPosition), need: 'Government positions (Yes/No)' },
    ...(d.bgGovPosition === true
      ? tableSpecs(`${P}/GovernmentPositionsInfo/GovernmentPositionsDetails/GovernmentPositionsDetail`, positions, { CountryCode: 'country', LevelOfJurisdiction: 'jurisdiction', DepartmentBranch: 'department', ActivitiesPositionHeld: 'activities' })
      : []),

    { som: `${P}/PreviousTravelInfo/TraveledOtherCountry`, const: yn(travelled), need: 'Previous travel (Yes/No)' },
    ...(travelled === true
      ? tableSpecs(`${P}/PreviousTravelInfo/PreviousTravelDetails/PreviousTravelDetail`, trips, { CountryCode: 'country', Location: 'location', PurposeOfTravel: 'purpose' })
      : []),
  ];

  const more = [
    ['military service', d.bgMilitary === true && military],
    ['ill-treatment', d.bgWitnessed === true && witnessed],
    ['organizations', d.bgOrganization === true && orgs],
    ['government positions', d.bgGovPosition === true && positions],
    ['trips', travelled === true && trips],
  ]
    .filter(([, list]) => list && list.length > ROWS)
    .map(([what, list]) => `Schedule 1 has ${ROWS} rows for ${what}; ${list.length - ROWS} more must be added in Adobe ("+" button)`);
  if (d.bgMilitary === true && !military.length) more.push('Military service is Yes but no service rows are in the intake');
  if (travelled === true && !trips.length) more.push('Travel is Yes but no trips are listed in the intake');
  return { map, notes: more };
}
