/**
 * The standard final-file set of each application type, learned from the
 * firm's five most recent applications of that type (by submission date, from
 * the TR-Files sheet and each client's "02 - Final Files" folder in Drive,
 * read 2026-10-01; file names only).
 *
 * Each entry is a final-file slot (lib/finalFiles.js SLOT) in the order the
 * team numbers them, with how many of those applications had it ("seen").
 * A slot that nearly every one had (4 of 5, or all of fewer) is part of the
 * set for good; the others start in the set but can be taken out, and any
 * other slot can be added (lib/finalFiles.js catalogFor).
 *
 * Types with too few applications of their own borrow the set of the type
 * they follow (ALIAS); types with none fall back to the planner's own list.
 */

// Always part of the set, whatever the history says: the IRCC forms, the
// passport, the photo, Client Information and the submission letter.
export const ALWAYS = new Set(['forms', 'passport', 'photo', 'client-info', 'submission']);

/** { type: { n, from, to, slots: [[slot, seen]] } } — n applications, submitted from … to. */
export const FINAL_SETS = {
  'study-permit': {
    n: 5, from: '2025-10-20', to: '2026-08-01',
    slots: [['forms', 5], ['client-info', 5], ['financial', 5], ['photo', 5], ['passport', 5], ['loa', 5], ['pal', 5], ['tuition', 1], ['police', 5], ['language', 5], ['marriage', 2], ['education', 1], ['submission', 5]],
  },
  'study-permit-minor': {
    n: 5, from: '2025-12-23', to: '2026-08-31',
    slots: [['forms', 5], ['loa', 5], ['passport', 5], ['photo', 5], ['client-info', 5], ['financial', 5], ['tuition', 2], ['custody-consent', 5], ['language', 1], ['pal', 5], ['police', 3], ['submission', 5]],
  },
  'study-permit-inside': {
    n: 5, from: '2025-02-13', to: '2026-04-28',
    slots: [['forms', 5], ['loa', 3], ['client-info', 5], ['passport', 5], ['financial', 5], ['photo', 4], ['marriage', 1], ['police', 1], ['language', 1], ['pal', 5], ['family-status', 1], ['submission', 5]],
  },
  'owp-outside': {
    n: 5, from: '2026-06-05', to: '2026-09-29',
    slots: [['forms', 5], ['passport', 4], ['photo', 4], ['client-info', 4], ['spouse-status', 2], ['enrolment', 1], ['inviter', 2], ['birth-nid', 3], ['cv', 1], ['education', 2], ['marriage', 4], ['police', 4], ['submission', 4]],
  },
  'sowp-inside': {
    n: 3, from: '2024-10-26', to: '2025-12-27',
    slots: [['forms', 3], ['client-info', 3], ['passport', 3], ['marriage', 2], ['police', 1], ['photo', 3], ['medical', 1], ['submission', 3]],
  },
  'iranian-owp': {
    n: 5, from: '2026-02-28', to: '2026-09-29',
    slots: [['forms', 5], ['passport', 5], ['photo', 5], ['client-info', 5], ['marriage', 3], ['medical', 1], ['submission', 5]],
  },
  pgwp: {
    n: 3, from: '2025-07-09', to: '2026-09-16',
    slots: [['forms', 3], ['client-info', 3], ['passport', 3], ['photo', 3], ['completion', 3], ['transcript', 3], ['marriage', 1], ['submission', 3]],
  },
  'imp-c11': {
    n: 1, from: '2026-02-10', to: '2026-02-10',
    slots: [['forms', 1], ['client-info', 1], ['birth-nid', 1], ['passport', 1], ['photo', 1], ['police', 1], ['education', 1], ['submission', 1]],
  },
  'trv-outside': {
    n: 5, from: '2026-01-25', to: '2026-08-01',
    slots: [['forms', 5], ['passport', 5], ['photo', 5], ['client-info', 5], ['financial', 5], ['marriage', 4], ['relationship', 5], ['police', 1], ['submission', 5]],
  },
  'trv-business': {
    n: 2, from: null, to: null,
    slots: [['forms', 2], ['invitation', 1], ['passport', 2], ['photo', 1], ['birth-nid', 1], ['marriage', 1], ['financial', 2], ['client-info', 2], ['employment', 1], ['submission', 1]],
  },
  'super-visa': {
    n: 2, from: '2025-04-23', to: '2026-01-07',
    slots: [['forms', 2], ['photo', 2], ['passport', 2], ['employment', 2], ['police', 2], ['insurance', 2], ['birth-nid', 2], ['marriage', 2], ['client-info', 2], ['financial', 2], ['relationship', 2], ['medical', 1], ['submission', 2]],
  },
  'trv-inside': {
    n: 5, from: '2025-03-18', to: '2026-09-14',
    slots: [['forms', 5], ['passport', 5], ['client-info', 5], ['marriage', 2], ['photo', 5], ['submission', 5]],
  },
  'visitor-record': {
    n: 5, from: '2025-01-14', to: '2026-08-11',
    slots: [['forms', 5], ['passport', 5], ['client-info', 5], ['photo', 5], ['marriage', 2], ['financial', 3], ['submission', 4]],
  },
};

// Types that follow another type's set.
const ALIAS = {
  'trv-spouse': 'trv-outside',
  'trv-child': 'trv-outside',
  'trv-child-of-student': 'trv-outside',
  'owp-worker-spouse': 'owp-outside',
  'study-permit-child-of-worker': 'study-permit-minor',
  'study-permit-inside-child': 'study-permit-inside',
};

/** True when `seen` of `n` applications is "always" (4 of 5, or all of fewer). */
export const isStandard = (seen, n) => seen >= (n >= 5 ? Math.ceil(n * 0.8) : n);

/**
 * The learned set of a type: { basis, slots: [{ slot, fixed, seen, of }] },
 * or null when there is no history for it.
 */
export function finalSetFor(type) {
  const key = FINAL_SETS[type] ? type : ALIAS[type];
  const set = key && FINAL_SETS[key];
  if (!set) return null;
  return {
    basis: { type: key, n: set.n, from: set.from, to: set.to },
    slots: set.slots.map(([slot, seen]) => ({ slot, seen, of: set.n, fixed: ALWAYS.has(slot) || isStandard(seen, set.n) })),
  };
}
