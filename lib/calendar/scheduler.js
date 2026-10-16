// Built-in publishing clock, armed from instrumentation.js when CALENDAR_AUTOPUBLISH=true (like
// the draws scheduler). It calls the app's own /api/calendar/tick over localhost every minute, so
// this module stays free of Node built-ins (instrumentation is also compiled for the edge).
// Render's free plan sleeps without visits; the keepwarm job's calls every 10 minutes keep it up,
// so a post can go out up to about ten minutes late.

const STATE = (globalThis.__calendarScheduler ||= { started: false, running: false, last: null });

export function startCalendarScheduler() {
  if (STATE.started) return;
  STATE.started = true;
  const port = process.env.PORT || 3000;
  const run = async () => {
    if (STATE.running) return;
    STATE.running = true;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/calendar/tick`, {
        headers: { Authorization: "Bearer " + (process.env.EDITING_SESSION_SECRET || "") },
      });
      STATE.last = { at: Date.now(), status: res.status, body: await res.json().catch(() => null) };
    } catch (e) {
      STATE.last = { at: Date.now(), error: String(e?.message || e) };
    } finally {
      STATE.running = false;
    }
  };
  setTimeout(() => {
    run();
    setInterval(run, 60 * 1000);
  }, 45 * 1000);
}
