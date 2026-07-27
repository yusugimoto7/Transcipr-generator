// Create a Google Doc from a generated article. Reuses the SAME Google Apps
// Script web app as the Sheet (SHEET_WEBHOOK_URL / SHEET_SECRET) — the script
// runs as your Google account, so it can create Docs in your Drive with no
// extra OAuth or service-account setup. See google-apps-script.gs (the "doc"
// action) and enable the Advanced Drive Service there.

import { sheetEnabled } from "./sheet";

function sheetUrl() {
  return process.env.SHEET_WEBHOOK_URL;
}
function sheetSecret() {
  return process.env.SHEET_SECRET;
}

export function gdocEnabled() {
  return sheetEnabled();
}

export async function createGoogleDoc({ title, html }) {
  if (!sheetEnabled()) {
    throw new Error("Google is not configured (SHEET_WEBHOOK_URL / SHEET_SECRET).");
  }
  const res = await fetch(sheetUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({ secret: sheetSecret(), doc: { title, html } }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Google Doc HTTP " + res.status);
  if (!data || !data.ok) {
    throw new Error(data?.error || "Google Doc creation failed");
  }
  return { url: data.url, id: data.id };
}
