// The social lane's clock (armed from instrumentation.js): every few minutes it calls the lane's
// tick route on this server, which reads the followed accounts and writes cards for new posts
// (lib/social/lane.js). Through the route, like the calendar's clock, so the lane's store never
// ends up in the edge bundle instrumentation is built for too.
const STATE = globalThis.__sugimotoLaneClock || (globalThis.__sugimotoLaneClock = { started: false, running: false, last: null });

export function startSocialLaneClock() {
  if (STATE.started || process.env.SOCIAL_LANE === "off") return;
  STATE.started = true;
  const port = process.env.PORT || 3000;
  const every = Math.max(2, Number(process.env.SOCIAL_LANE_MINUTES) || 5) * 60 * 1000;
  const run = async () => {
    if (STATE.running) return;
    STATE.running = true;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/social-lane/tick`, {
        headers: { Authorization: "Bearer " + (process.env.EDITING_SESSION_SECRET || "") },
      });
      STATE.last = { at: Date.now(), status: res.status, body: await res.json().catch(() => null) };
    } catch (e) {
      STATE.last = { at: Date.now(), error: String(e?.message || e) };
    } finally {
      STATE.running = false;
    }
  };
  // A little after start, so the first read does not race the server coming up.
  setTimeout(() => {
    run();
    setInterval(run, every);
  }, 50 * 1000);
}
