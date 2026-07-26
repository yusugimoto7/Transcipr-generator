// Built-in scheduler: the app runs the draw cycle itself on an interval, so no
// external cron job has to be created. Started once at server boot from
// instrumentation.js when DRAWS_AUTORUN=true.
//
// It calls its own /api/draws/run endpoint over localhost rather than importing
// the pipeline directly. That keeps this module free of Node built-ins — it is
// reachable from instrumentation.js, which Next also compiles for the edge
// runtime, where `node:*` imports fail to bundle.
//
// Notes
// - Dedup makes repeated runs harmless, so a restart mid-cycle costs nothing.
// - Runs never overlap.
// - Intended for a single instance. If you scale out, disable DRAWS_AUTORUN and
//   use an external cron instead, or two instances could post the same draw.

const DEFAULT_INTERVAL_MIN = 15;
// Let the deploy settle before the first run. Configurable so it can be driven
// down in testing.
const BOOT_DELAY_MS = Number(process.env.DRAWS_BOOT_DELAY_MS || 60_000);

// State lives on globalThis: instrumentation.js and the API routes are compiled
// into separate bundles, so plain module scope would not be shared between the
// scheduler and the endpoint that reports on it.
const STATE = (globalThis.__drawsScheduler ||= {
  started: false,
  running: false,
  lastRun: null,
});

export function schedulerState() {
  return {
    enabled: process.env.DRAWS_AUTORUN === "true",
    started: STATE.started,
    running: STATE.running,
    intervalMinutes: Number(
      process.env.DRAWS_INTERVAL_MINUTES || DEFAULT_INTERVAL_MIN
    ),
    lastRun: STATE.lastRun ? { ...STATE.lastRun } : null,
  };
}

async function tick() {
  if (STATE.running) return;
  STATE.running = true;
  const startedAt = new Date().toISOString();
  console.log("[draws] cycle starting");
  try {
    const port = process.env.PORT || 3000;
    const secret = process.env.DRAWS_CRON_SECRET;
    const res = await fetch(
      `http://127.0.0.1:${port}/api/draws/run?key=${encodeURIComponent(secret)}`,
      { method: "POST" }
    );
    const report = await res.json().catch(() => ({}));
    STATE.lastRun = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: res.ok && report.ok !== false,
      found: report.found,
      published: report.published,
      sourceErrors: report.sourceErrors?.length || 0,
      error: report.error,
    };
    if (report.published > 0) {
      console.log(`[draws] posted ${report.published} item(s)`);
    }
  } catch (err) {
    STATE.lastRun = {
      startedAt,
      finishedAt: new Date().toISOString(),
      ok: false,
      error: String(err?.message || err),
    };
    console.error("[draws] cycle failed:", err);
  } finally {
    STATE.running = false;
  }
}

export function startScheduler() {
  if (STATE.started) return;
  if (process.env.DRAWS_AUTORUN !== "true") return;
  if (!process.env.DRAWS_CRON_SECRET) {
    console.warn("[draws] DRAWS_AUTORUN is set but DRAWS_CRON_SECRET is missing — scheduler not started");
    return;
  }
  STATE.started = true;

  const minutes = Number(
    process.env.DRAWS_INTERVAL_MINUTES || DEFAULT_INTERVAL_MIN
  );
  const intervalMs = Math.max(5, minutes) * 60_000;

  console.log(
    `[draws] auto-run enabled — every ${minutes} min (first run in ${
      BOOT_DELAY_MS / 1000
    }s)`
  );

  const boot = setTimeout(() => {
    tick();
    const timer = setInterval(tick, intervalMs);
    if (typeof timer.unref === "function") timer.unref();
  }, BOOT_DELAY_MS);
  if (typeof boot.unref === "function") boot.unref();
}
