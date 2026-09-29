/**
 * Representative / firm details used in the RCIC submission letter signature and
 * on generated documents. All fields are overridable via environment variables
 * so the platform can be reused by a different consultant without code changes.
 *
 * Defaults reflect Sugimoto Visa Inc. (the platform owner). Override in Render
 * with FIRM_* / RCIC_* env vars if these ever change.
 */
export function getFirm() {
  return {
    repName: process.env.RCIC_NAME || 'Yu Hamed Sugimoto Chavoshi',
    // As IMM 5476 asks for them (family name / given name), overridable separately.
    repFamilyName: process.env.RCIC_FAMILY_NAME || 'Sugimoto Chavoshi',
    repGivenName: process.env.RCIC_GIVEN_NAME || 'Yu Hamed',
    rcicNumber: process.env.RCIC_NUMBER || 'R713046',
    company: process.env.FIRM_NAME || 'Sugimoto Visa Inc.',
    phone: process.env.FIRM_PHONE || '+1-604-781-0482',
    email: process.env.FIRM_EMAIL || 'hamed@sugimotovisa.com',
    address:
      process.env.FIRM_ADDRESS ||
      '501 - 3292 Production Way, Burnaby, Greater Vancouver, BC V5A 4R4',
    // The same address in the parts the official forms ask for.
    unit: process.env.FIRM_UNIT || '501',
    streetNo: process.env.FIRM_STREET_NO || '3292',
    street: process.env.FIRM_STREET || 'Production Way',
    city: process.env.FIRM_CITY || 'Burnaby',
    province: process.env.FIRM_PROVINCE || 'BC',
    country: process.env.FIRM_COUNTRY || 'Canada',
    postal: process.env.FIRM_POSTAL || 'V5A 4R4',
    officePhone: process.env.FIRM_OFFICE_PHONE || '+1 (604) 415-4792',
    officeEmail: process.env.FIRM_OFFICE_EMAIL || 'info@sugimotovisa.com',
    website: process.env.FIRM_WEBSITE || 'www.sugimotovisa.com',
  };
}

/** A plain-text signature block for the RCIC submission letter. */
export function signatureBlock() {
  const f = getFirm();
  return [
    'Sincerely,',
    '',
    f.repName,
    `RCIC# ${f.rcicNumber}`,
    f.company,
    `${f.phone} | ${f.email}`,
    '',
    f.company,
    f.address,
    `Tel: ${f.officePhone} - ${f.officeEmail}`,
    f.website,
  ].join('\n');
}
