// The social lane's clock (armed from instrumentation.js): every few minutes it calls the lane's
// tick route on this server, which reads the followed accounts and writes cards for new posts
// (lib/social/lane.js). Through the route, like the calendar's clock, so the lane's store never
// ends up in the edge bundle instrumentation is built for too.
const STATE = globalThis.__sugimotoLaneClock || (globalThis.__sugimotoLaneClock = { started: false, startedAt: 0, running: false, ticks: 0, last: null, lastSaid: 0 });

// For /api/topics?warm=1 and the lane page: whether the clock is alive, without a login.
export function laneClockStatus() {
  return {
    started: STATE.started,
    started_at: STATE.startedAt ? new Date(STATE.startedAt).toISOString() : "",
    ticks: STATE.ticks,
    last: STATE.last ? { ...STATE.last, at: new Date(STATE.last.at).toISOString() } : null,
  };
}

export function startSocialLaneClock() {
  if (STATE.started || process.env.SOCIAL_LANE === "off") return;
  STATE.started = true;
  STATE.startedAt = Date.now();
  const port = process.env.PORT || 3000;
  const every = Math.max(2, Number(process.env.SOCIAL_LANE_MINUTES) || 5) * 60 * 1000;
  const run = async () => {
    if (STATE.running) return;
    STATE.running = true;
    STATE.ticks++;
    try {
      // The tick route only starts the read and answers at once; a hung answer must not stop
      // the clock, so the call itself is given a minute.
      const res = await fetch(`http://127.0.0.1:${port}/api/social-lane/tick`, {
        headers: { Authorization: "Bearer " + (process.env.EDITING_SESSION_SECRET || "") },
        signal: AbortSignal.timeout(60000),
      });
      STATE.last = { at: Date.now(), status: res.status, body: await res.json().catch(() => null) };
    } catch (e) {
      STATE.last = { at: Date.now(), error: String(e?.message || e) };
    } finally {
      STATE.running = false;
    }
    // Said once at the start and then only when something is wrong, at most every half hour.
    const bad = !STATE.last || STATE.last.error || STATE.last.status !== 200;
    if (STATE.ticks === 1 || (bad && Date.now() - STATE.lastSaid > 30 * 60 * 1000)) {
      STATE.lastSaid = Date.now();
      console.log("[social lane] clock tick", STATE.ticks, STATE.last && (STATE.last.error || "HTTP " + STATE.last.status));
    }
  };
  // A little after start, so the first read does not race the server coming up.
  setTimeout(() => {
    run();
    setInterval(run, every);
  }, 50 * 1000);
}
