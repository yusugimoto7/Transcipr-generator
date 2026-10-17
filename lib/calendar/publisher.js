// Publishing approved cards. A card goes out on a channel only when Hamed's approval still covers
// its content (model.approvalValid), the channel is switched on, and it has not gone out there yet.
// Each channel is published on its own: one failure never blocks the others, and a failure is
// never retried by itself (a half-finished post must be checked by a person first).
//
// CALENDAR_DRY_RUN=true: every channel only pretends to post (for trying the calendar out).

import { list } from "../editing/store";
import { appUrl } from "./media";
import { CHANNELS, approvalValid, effectiveCaption, getBoard, setPublish, addEvent } from "./model";
import * as x from "./channels/x";
import * as linkedin from "./channels/linkedin";
import * as instagram from "./channels/instagram";
import * as tiktok from "./channels/tiktok";
import * as youtube from "./channels/youtube";

export const ADAPTERS = { instagram, tiktok, youtube, linkedin, x };
const STALE_MS = 30 * 60 * 1000;
const MISSED_MS = 24 * 3600 * 1000;
const running = globalThis.__calendarPublishing || (globalThis.__calendarPublishing = new Set());

export function dryRun() {
  return process.env.CALENDAR_DRY_RUN === "true";
}

export function autoPublish() {
  return process.env.CALENDAR_AUTOPUBLISH === "true";
}

export async function channelStatus() {
  const out = {};
  for (const [k, a] of Object.entries(ADAPTERS)) {
    const s = await a.status();
    // The real state, even in test mode: a panel that says "connected" for an account that is not
    // connected would only be found out on the first real post.
    out[k] = { name: CHANNELS[k].name, ...s };
    // The exact return address this server sends to Google / TikTok; it must be registered there
    // letter for letter, or the sign-in stops with "redirect_uri_mismatch".
    if (s.connect) out[k].redirect = `${appUrl()}/api/calendar/connect/${k}/callback`;
  }
  return out;
}

function pending(card) {
  return Object.keys(CHANNELS).filter((k) => card.channels[k] && card.channels[k].on && !(card.publish || {})[k]);
}

// Publish every pending channel of one card. Returns the card's publish map.
export async function publishCard(boardId, cardId, by = "scheduler") {
  if (running.has(cardId)) return null;
  running.add(cardId);
  try {
    const board = await getBoard(boardId);
    const card = board.cards.find((c) => c.id === cardId);
    if (!card) throw new Error("card not found");
    if (!approvalValid(card)) throw new Error("this card is not approved, or it changed after approval");
    const status = await channelStatus();
    for (const ch of pending(card)) {
      if (!dryRun() && !status[ch].connected) {
        await setPublish(boardId, cardId, ch, { status: "failed", error: `${CHANNELS[ch].name} is not connected: ${status[ch].detail}` });
        continue;
      }
      await setPublish(boardId, cardId, ch, { status: "publishing" });
      try {
        const c = card.channels[ch];
        const res = dryRun()
          ? { id: "test-" + Date.now(), url: "", note: "test mode: not really posted" }
          : await ADAPTERS[ch].publish({ caption: effectiveCaption(card, ch), title: c.title, format: c.format, media: card.media, boardId, cardId });
        await setPublish(boardId, cardId, ch, { status: "published", id: res.id || "", url: res.url || "", note: res.note || "" });
        await addEvent(cardId, by, `published on ${CHANNELS[ch].name}${res.url ? ": " + res.url : ""}`);
      } catch (e) {
        await setPublish(boardId, cardId, ch, { status: "failed", error: String(e.message || e).slice(0, 500) });
        await addEvent(cardId, by, `could not publish on ${CHANNELS[ch].name}: ${String(e.message || e).slice(0, 200)}`);
      }
    }
    return (await getBoard(boardId)).cards.find((c) => c.id === cardId)?.publish || {};
  } finally {
    running.delete(cardId);
  }
}

// Clear one channel's failed state so it can be tried again (admin, after checking the platform).
export async function resetChannel(boardId, cardId, ch) {
  const board = await getBoard(boardId);
  const card = board.cards.find((c) => c.id === cardId);
  const st = card && (card.publish || {})[ch];
  if (!st || !["failed", "unknown", "missed"].includes(st.status)) throw new Error("nothing to retry on this channel");
  const { [ch]: _gone, ...rest } = card.publish;
  const { update } = await import("../editing/store");
  await update(`calendar/boards/${boardId}.json`, (b) => ({ ...b, cards: b.cards.map((c) => (c.id === cardId ? { ...c, publish: rest } : c)) }));
}

// One pass of the scheduler: everything approved and due goes out; a post that was in progress
// when the server restarted is marked "unknown" for a person to check, never re-posted.
export async function tick() {
  const now = Date.now();
  const report = { due: 0, published: 0, stale: 0, missed: 0 };
  for (const { data: board } of await list("calendar/boards/")) {
    if (board.removed_at) continue;
    for (const card of board.cards) {
      for (const [ch, st] of Object.entries(card.publish || {})) {
        if (st.status === "publishing" && now - st.at > STALE_MS && !running.has(card.id)) {
          await setPublish(board.id, card.id, ch, { status: "unknown", error: "the server restarted while posting; check the platform before trying again" });
          report.stale++;
        }
      }
      if (!card.publish_at || !approvalValid(card) || !pending(card).length) continue;
      const at = new Date(card.publish_at).getTime();
      if (at > now) continue;
      if (now - at > MISSED_MS) {
        for (const ch of pending(card)) await setPublish(board.id, card.id, ch, { status: "missed", error: "the publish time passed more than a day ago; publish it by hand or change the time" });
        report.missed++;
        continue;
      }
      report.due++;
      await publishCard(board.id, card.id);
      report.published++;
    }
  }
  return report;
}
