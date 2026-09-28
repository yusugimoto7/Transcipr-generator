import { listAllApplications, updateApplication } from './store';
import { applyDateRules } from './dateRules';
import { statusOf } from './verify';

/**
 * Documents age: re-apply the date rules (lib/dateRules.js) to every file a
 * few times a day, so colours and the dashboard's counts follow the calendar
 * — a bank letter turns orange after 20 days and red after a month without
 * anyone re-reading it. Also run for a file when its page is opened.
 */
export async function refreshDates(appId) {
  let changed = false;
  await updateApplication(appId, (a) => {
    changed = applyDateRules(a, statusOf);
    return changed ? a : false;
  }, { quiet: true });
  return changed;
}

export async function sweepDates() {
  let n = 0;
  for (const a of await listAllApplications()) {
    if (!(a.documents || []).some((d) => d.verification?.facts)) continue;
    if (await refreshDates(a.id)) n++;
  }
  return n;
}

const S = globalThis.__dateSweep || (globalThis.__dateSweep = { started: false });
export function ensureDateSweep() {
  if (S.started) return;
  S.started = true;
  const tick = () => sweepDates().catch((e) => console.error(`[dates] sweep failed: ${e.message}`));
  setTimeout(tick, 60000).unref?.();
  setInterval(tick, 6 * 3600000).unref?.();
}
