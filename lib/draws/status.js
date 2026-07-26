// Self-check for the draw auto-poster: what is configured, what is missing, and
// exactly which env var to set next. Never reveals secret values — only whether
// each one is present.
import { sheetEnabled } from "../sheet";
import { wordpressEnabled } from "./wordpress";
import { renderEnabled } from "./story";
import { logoBase64 } from "./story";
import { schedulerState } from "./scheduler";

const has = (name) => !!(process.env[name] || "").trim();

function group(name, vars, note) {
  const missing = vars.filter((v) => !has(v));
  return {
    name,
    ready: missing.length === 0,
    missing,
    note: missing.length ? note : undefined,
  };
}

export function setupStatus() {
  const core = group(
    "core",
    ["DRAWS_CRON_SECRET"],
    "Required. Any long random string; the cron must pass it as ?key="
  );

  const dedup = {
    name: "dedup memory (Google Sheet)",
    ready: sheetEnabled(),
    missing: ["SHEET_WEBHOOK_URL", "SHEET_SECRET"].filter((v) => !has(v)),
    usesExistingScript: true,
    note: sheetEnabled()
      ? "Stored in the existing Library tab — no Apps Script changes needed."
      : "Without this, 'already posted' is only remembered until the next redeploy, so a draw can post twice.",
  };

  const live = schedulerState();
  const scheduler = {
    name: "built-in scheduler",
    ready: process.env.DRAWS_AUTORUN === "true",
    missing: process.env.DRAWS_AUTORUN === "true" ? [] : ["DRAWS_AUTORUN"],
    intervalMinutes: live.intervalMinutes,
    armed: live.started,
    running: live.running,
    lastRun: live.lastRun,
    note:
      process.env.DRAWS_AUTORUN === "true"
        ? "The app runs itself on an interval — no cron job needed. Single instance only."
        : "Set DRAWS_AUTORUN=true so the app schedules itself, or point an external cron at /api/draws/run.",
  };

  const sources = {
    name: "sources",
    router: {
      ready: has("DRAWS_ROUTER_URL"),
      covers: ["bcpnp-skills", "bcpnp-entrepreneur", "oinp-draw", "oinp-update"],
      missing: has("DRAWS_ROUTER_URL") ? [] : ["DRAWS_ROUTER_URL"],
      note: has("DRAWS_ROUTER_URL")
        ? undefined
        : "Your Apps Script /exec URL that serves ?source=bcpnp and ?source=oinp. Without it those programs are skipped.",
    },
    directScrape: {
      covers: ["express-entry", "alberta", "oinp-entrepreneur"],
      overrides: {
        DRAWS_EE_URL: has("DRAWS_EE_URL") ? "custom" : "default (canada.ca)",
        DRAWS_ALBERTA_URL: has("DRAWS_ALBERTA_URL")
          ? "custom"
          : "default (alberta.ca)",
        DRAWS_OINP_ENT_URL: has("DRAWS_OINP_ENT_URL")
          ? "custom"
          : "default (ontario.ca)",
      },
      note: "If a run reports 403/timeout for these, proxy them through Apps Script: ?secret=…&proxy=alberta | proxy=oinp_ent | proxy=ee",
    },
  };

  const channels = [
    {
      ...group(
        "telegram",
        ["TELEGRAM_BOT_TOKEN"],
        "Bot token from @BotFather; the bot must be an admin of the channel."
      ),
      channelId:
        has("DRAWS_TELEGRAM_CHANNEL_ID") || has("TELEGRAM_CHANNEL_ID")
          ? "set"
          : "missing (DRAWS_TELEGRAM_CHANNEL_ID or TELEGRAM_CHANNEL_ID)",
    },
    group(
      "x",
      ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"],
      "developer.x.com → your app → Keys and tokens. The access token must have Read AND Write."
    ),
    group(
      "linkedin",
      ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORG_ID"],
      "Token needs w_organization_social. LINKEDIN_ORG_ID is the numeric company id."
    ),
    {
      ...group(
        "instagram",
        ["IG_USER_ID", "IG_ACCESS_TOKEN", "HCTI_USER_ID", "HCTI_API_KEY"],
        "Instagram needs a public image URL, so htmlcsstoimage.com (HCTI) credentials are required too."
      ),
      renderer: renderEnabled() ? "ready" : "missing HCTI credentials",
      logo: logoBase64()
        ? "custom logo loaded"
        : "no logo — story card falls back to a text wordmark (paste base64 into assets/story-logo.b64 or STORY_LOGO_B64)",
    },
  ];

  const wordpress = {
    name: "wordpress page (optional)",
    ready: wordpressEnabled(),
    missing: [
      "DRAWS_UNIFIED_URL",
      "DRAWS_WP_PAGE_ID",
      "WP_BASE_URL",
      "WP_USER",
      "WP_APP_PASSWORD",
    ].filter((v) => !has(v)),
    note: wordpressEnabled()
      ? "The WP user also needs the `unfiltered_html` capability or the <style> block is stripped."
      : "Optional. Leave blank to skip the auto-updating draws page entirely.",
  };

  const alerts = {
    name: "failure alerts (optional)",
    ready: has("DRAWS_ALERT_CHAT_ID") && has("TELEGRAM_BOT_TOKEN"),
    missing: ["DRAWS_ALERT_CHAT_ID"].filter((v) => !has(v)),
    note: "Set a Telegram chat id to be pinged when a channel starts failing (e.g. an expired LinkedIn/Instagram token).",
  };

  const readyChannels = channels.filter((c) => c.ready).map((c) => c.name);

  return {
    readyToRun: core.ready && readyChannels.length > 0,
    summary: core.ready
      ? readyChannels.length
        ? `Will post to: ${readyChannels.join(", ")}`
        : "No channels configured yet — nothing would be posted."
      : "DRAWS_CRON_SECRET is not set.",
    core,
    dedup,
    scheduler,
    sources,
    channels,
    wordpress,
    alerts,
    nextSteps: [
      !core.ready && "Set DRAWS_CRON_SECRET.",
      !dedup.ready && "Set SHEET_WEBHOOK_URL + SHEET_SECRET so dedup survives redeploys.",
      !sources.router.ready && "Set DRAWS_ROUTER_URL to enable BC PNP + OINP.",
      readyChannels.length === 0 && "Configure at least one channel (start with Telegram).",
      "Verify with /api/draws/preview?key=… (sends nothing).",
      !scheduler.ready &&
        "Set DRAWS_AUTORUN=true — the app then runs itself every 15 min, no cron job to create.",
      scheduler.ready && "Done — the app is running itself on a schedule.",
    ].filter(Boolean),
  };
}
