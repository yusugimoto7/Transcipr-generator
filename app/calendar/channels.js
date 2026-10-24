// Shared look of the publishing screens: networks, their limits and colours, and post statuses.

import { L } from "../../lib/i18n";

export const NETWORKS = [
  { key: "instagram", short: "IG", name: "Instagram", color: "#d62976", max: 2200 },
  { key: "tiktok", short: "TT", name: "TikTok", color: "#111111", max: 2200 },
  { key: "youtube", short: "YT", name: "YouTube", color: "#ff0000", max: 5000 },
  { key: "linkedin", short: "in", name: "LinkedIn page", fa: "صفحهٔ LinkedIn", color: "#0a66c2", max: 3000 },
  { key: "x", short: "X", name: "X", color: "#000000", max: 280 },
];
export const NET = Object.fromEntries(NETWORKS.map((n) => [n.key, n]));

// A network's name on screen (only "LinkedIn page" has words to translate).
export function netName(k) {
  const n = NET[k];
  return n ? L(n.fa || n.name, n.name) : k;
}

// `name` is a pair, read with L() when drawn (statusName).
export const STATUS = {
  draft: { name: ["پیش‌نویس", "Draft"], color: "#8b95a3" },
  pending: { name: ["در انتظار تأیید", "Waiting for approval"], color: "#f28c28" },
  approved: { name: ["تأییدشده، هنوز بی‌زمان", "Approved, no time yet"], color: "#2f6fde" },
  scheduled: { name: ["زمان‌بندی‌شده", "Scheduled"], color: "#2f6fde" },
  publishing: { name: ["در حال انتشار", "Publishing"], color: "#7a5af8" },
  published: { name: ["منتشرشده", "Published"], color: "#12a150" },
  failed: { name: ["ناموفق", "Failed"], color: "#e5484d" },
};
export function statusName(status) {
  return L((STATUS[status] || STATUS.draft).name);
}

// What a single network's publish state means (card.publish[k].status), for the screen.
const PUBLISH_STATE = {
  published: ["منتشرشده", "published"],
  tested: ["فقط آزمایشی؛ واقعاً منتشر نشد", "test run only, not really posted"],
  publishing: ["در حال انتشار", "publishing"],
  failed: ["ناموفق", "failed"],
  unknown: ["نامعلوم", "unknown"],
  missed: ["جامانده", "missed"],
  pending: ["در انتظار", "pending"],
  scheduled: ["زمان‌بندی‌شده", "scheduled"],
};
export function publishStateName(st) {
  return PUBLISH_STATE[st] ? L(PUBLISH_STATE[st]) : st;
}

export function effectiveCaption(card, k) {
  const x = (card.channels || {})[k] || {};
  const custom = x.custom === undefined ? !!x.caption : x.custom;
  return custom ? x.caption || "" : card.caption || "";
}

export function onNetworks(card) {
  return NETWORKS.filter((n) => card.channels && card.channels[n.key] && card.channels[n.key].on);
}

// Google Drive serves a thumbnail of a shared image or video, enough for previews.
export function thumbOf(media) {
  if (!media || !media.url) return "";
  const m = media.url.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) || media.url.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
  return media.kind === "image" ? media.url : "";
}
