// Runs once when the server process starts. Used to arm the built-in draw
// scheduler so no external cron job is required.
//
// Enabled by DRAWS_AUTORUN=true. Without it this is a no-op and the app behaves
// exactly as before.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Content calendar publishing clock: off unless CALENDAR_AUTOPUBLISH=true and the master switch
  // CALENDAR_PLATFORM_POSTING=true is on (it stays off until the channels' credentials are tested).
  if (process.env.CALENDAR_AUTOPUBLISH === "true" && process.env.CALENDAR_PLATFORM_POSTING === "true") {
    try {
      const { startCalendarScheduler } = await import("./lib/calendar/scheduler");
      startCalendarScheduler();
    } catch (err) {
      console.error("[calendar] failed to start scheduler:", err);
    }
  }
  // The social lane: the followed accounts' new posts become cards every few minutes. Like the
  // calendar clock it calls its own route, so nothing the lane reads (the editing-data store) is
  // bundled here.
  try {
    const { startSocialLaneClock } = await import("./lib/social/lane-clock");
    startSocialLaneClock();
  } catch (err) {
    console.error("[social lane] failed to start:", err);
  }
  if (process.env.DRAWS_AUTORUN !== "true") return;
  try {
    const { startScheduler } = await import("./lib/draws/scheduler");
    startScheduler();
  } catch (err) {
    // A scheduler problem must never stop the app from serving.
    console.error("[draws] failed to start scheduler:", err);
  }
}
