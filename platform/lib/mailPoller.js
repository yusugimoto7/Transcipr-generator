import { mailConfig, checkMail } from './mailIntake';

/**
 * Checks the team mailbox every MAIL_POLL_MINUTES. Started on the first
 * request the server handles (Render's health check keeps that happening),
 * so it survives restarts without a separate process.
 */
export function ensureMailPoller() {
  const cfg = mailConfig();
  if (!cfg.configured || globalThis.__mailPoller) return;
  const minutes = Math.max(1, cfg.pollMinutes);
  const tick = () => checkMail().catch((e) => console.error(`[mail] check failed: ${e.message}`));
  globalThis.__mailPoller = setInterval(tick, minutes * 60 * 1000);
  globalThis.__mailPoller.unref?.();
  setTimeout(tick, 15000).unref?.();
  console.log(`[mail] polling ${cfg.user || 'stub'} every ${minutes} min`);
}
