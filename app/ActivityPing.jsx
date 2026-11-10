"use client";

// Tells the activity log (lib/activity.js) which page a signed-in person moved to inside the app. The
// server cannot tell such a move from a link the router loads ahead, so the page says it. The first
// page is counted by the server itself (a full page load), so only later moves are sent.
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function ActivityPing() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!path || path.startsWith("/editing/login")) return;
    fetch("/api/activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ view: path }), keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
