/**
 * A client case: the main applicant's file plus the files of the family
 * members applying with them (spouse, children, parents). Files belong to the
 * same case when they share the client file number ("S26901"); files without
 * a number are linked by `groupId`, and a file alone is its own case.
 * Pure: used on the server and in the browser.
 */

export const ROLES = ['main', 'spouse', 'child', 'parent', 'other'];
export const ROLE_LABEL = {
  main: 'Main applicant',
  spouse: 'Spouse / partner',
  child: 'Child',
  parent: 'Parent',
  other: 'Family member',
};
const ROLE_ORDER = Object.fromEntries(ROLES.map((r, i) => [r, i]));

export const normNumber = (n) => String(n || '').trim().toUpperCase();

/** The case a file belongs to — also the case page's URL key. */
export function caseKeyOf(a) {
  return normNumber(a.clientNumber) || a.groupId || a.id;
}

/** A name that was never entered: the default "<type> Application" title. */
export const isDefaultTitle = (t) => !t || / Application$/.test(t);

/** The person's name from the intake (as in the passport), or ''. */
export const intakeName = (a) => [a?.data?.givenName, a?.data?.familyName].map((x) => String(x || '').trim()).filter(Boolean).join(' ');

/** The file's name: the one entered, else the name in the intake, else the default title. */
export const displayName = (a) => (!isDefaultTitle(a?.title) ? a.title : intakeName(a) || a?.title || '');

const roleRank = (a) => ROLE_ORDER[a.applicantRole] ?? ROLE_ORDER.other;

/** Main applicant first, then spouse, children, parents; oldest first within a role. */
export function sortMembers(members) {
  return [...members].sort((a, b) => roleRank(a) - roleRank(b) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

/** Group files into cases, most recently changed case first. */
export function groupCases(apps) {
  const byKey = new Map();
  for (const a of apps) {
    const key = caseKeyOf(a);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(a);
  }
  const cases = [];
  for (const [key, list] of byKey) {
    const members = sortMembers(list);
    const main = members.find((m) => (m.applicantRole || 'main') === 'main') || members[0];
    cases.push({
      key,
      clientNumber: normNumber(main.clientNumber) || normNumber(members.find((m) => m.clientNumber)?.clientNumber),
      name: displayName(main),
      main,
      members,
      updatedAt: members.map((m) => m.updatedAt).filter(Boolean).sort().pop() || '',
    });
  }
  return cases.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

/** "S26901 · Sara Karimi", or the name alone when there is no number yet. */
export function caseLabel(c) {
  const name = isDefaultTitle(c.name) ? 'Unnamed client' : c.name;
  return c.clientNumber ? `${c.clientNumber} · ${name}` : name;
}
