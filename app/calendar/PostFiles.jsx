"use client";

// Taking a finished post out of the app by hand: download its caption and files to the computer,
// or save them to a folder in Google Drive. This is the only way a post leaves the app while
// posting to the networks is switched off (CALENDAR_PLATFORM_POSTING).

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "../../components/ui/button";
import { DriveSaveButton } from "../DrivePicker";
import { L, uiDir } from "../../lib/i18n";

const items = (m) => (!m ? [] : Array.isArray(m.items) && m.items.length ? m.items : m.url ? [m] : []);

export default function PostFiles({ boardId, cardId, card: given }) {
  const [card, setCard] = useState(given || null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (given) return setCard(given);
    fetch(`/api/calendar/boards/${boardId}/cards/${cardId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.card ? setCard(d.card) : setErr(d.error || L("پست خوانده نشد", "could not read the post"))))
      .catch((e) => setErr(e.message));
  }, [boardId, cardId, given]);
  if (err) return <small className="text-[#b91c1c]">{err}</small>;
  if (!card) return null;

  const base = `/api/calendar/boards/${boardId}/cards/${cardId}/file`;
  const files = items(card.media);
  const hasWords = !!(card.caption || Object.values(card.channels || {}).some((c) => c && c.on && c.caption));
  const urls = [...(hasWords ? [`${base}?caption=1`] : []), ...files.map((_, i) => `${base}?i=${i}`)];
  if (!urls.length) return <small className="text-muted" dir={uiDir()}>{L("برای دانلود، اول یک کپشن یا فایل اضافه کن.", "Add a caption or a file to be able to download it.")}</small>;

  // One click, several files: browsers allow it when the downloads follow each other.
  const downloadAll = async () => {
    for (const u of urls) {
      const a = document.createElement("a");
      a.href = u;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 600));
    }
  };
  const day = new Date().toISOString().slice(0, 10);
  const name = `${String(card.title || "Post").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60) || "Post"} (${day})`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <Button type="button" variant="outline" onClick={downloadAll}>
          <Download /> {L("دانلود روی همین کامپیوتر", "Download to this computer")}
        </Button>
        <DriveSaveButton urls={urls} folderName={name} />
      </div>
      <small className="text-muted" dir={uiDir()}>
        {L(`${urls.length} فایل: `, `${urls.length} file${urls.length > 1 ? "s" : ""}: `)}
        {hasWords ? L("کپشن", "the caption") : ""}
        {hasWords && files.length ? L(" و ", " and ") : ""}
        {files.length ? L(`${files.length} عکس یا ویدیو`, `${files.length} picture${files.length > 1 ? "s" : ""} or video${files.length > 1 ? "s" : ""}`) : ""}.
      </small>
    </div>
  );
}
