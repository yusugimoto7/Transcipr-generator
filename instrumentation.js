// Runs once when the server process starts. Used to arm the built-in draw
// scheduler so no external cron job is required.
//
// Enabled by DRAWS_AUTORUN=true. Without it this is a no-op and the app behaves
// exactly as before.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DRAWS_AUTORUN !== "true") return;
  try {
    const { startScheduler } = await import("./lib/draws/scheduler");
    startScheduler();
  } catch (err) {
    // A scheduler problem must never stop the app from serving.
    console.error("[draws] failed to start scheduler:", err);
  }
}
