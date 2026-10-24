// A network's publish state for one card. Test mode (CALENDAR_DRY_RUN) only pretends to post; such
// a run is "tested", never "published": it must not show as posted, and the card must still go
// out for real once posting is on. Runs from before this distinction were stored as "published"
// with a "test-" id. Shared by the server and the calendar screens.
export function publishStateOf(p) {
  if (!p) return "";
  if (p.status === "tested" || (p.status === "published" && /^test-/.test(String(p.id || "")))) return "tested";
  return p.status || "";
}
