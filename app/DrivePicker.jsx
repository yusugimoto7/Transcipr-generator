"use client";

// "Choose from Google Drive": opens Google's own file picker, then shares the chosen file as
// "Anyone with the link" (the editing worker, the calendar's publishing and the video workflow all
// download it by link) and hands back its /file/d/<id>/view link. The person signs in with their own
// Google account in Google's popup; the app only ever gets access to the files picked here
// (drive.file scope). Keys come from /api/drive/config; without them the button does not show and
// the link field next to it works as before.

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "../components/ui/button";
import { L, uiDir } from "../lib/i18n";

const SCOPE = "https://www.googleapis.com/auth/drive.file";
const MIME = {
  video: "video/mp4,video/quicktime,video/x-m4v,video/webm,video/x-matroska,video/3gpp",
  image: "image/jpeg,image/png,image/webp,image/heic,image/gif",
};

const g = typeof window !== "undefined" ? (window.__drivePicker = window.__drivePicker || { config: null, scripts: {}, token: null }) : {};

function script(src) {
  if (!g.scripts[src]) {
    g.scripts[src] = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = resolve;
      el.onerror = () => {
        delete g.scripts[src];
        reject(new Error(L("انتخابگر Google بارگذاری نشد؛ اتصال اینترنت رو چک کن", "Google's picker did not load; check the connection")));
      };
      document.head.appendChild(el);
    });
  }
  return g.scripts[src];
}

async function prepare() {
  if (!g.config) g.config = fetch("/api/drive/config", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { enabled: false })).catch(() => ({ enabled: false }));
  const cfg = await g.config;
  if (!cfg.enabled) return cfg;
  await Promise.all([script("https://accounts.google.com/gsi/client"), script("https://apis.google.com/js/api.js")]);
  if (!g.pickerLoaded) g.pickerLoaded = new Promise((resolve) => window.gapi.load("picker", resolve));
  await g.pickerLoaded;
  return cfg;
}

// The token request must run inside the click itself, or phones block Google's popup: everything
// it needs is loaded when the button first shows.
function requestToken(cfg) {
  if (g.token && g.token.expires > Date.now() + 60000) return Promise.resolve(g.token.value);
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: cfg.clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error === "access_denied" ? L("ورود به Google لغو شد", "Google sign-in was cancelled") : r.error));
        g.token = { value: r.access_token, expires: Date.now() + Number(r.expires_in || 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e && e.type === "popup_closed" ? L("پنجرهٔ ورود به Google بسته شد", "Google sign-in was closed") : L("ورود به Google باز نشد؛ پاپ‌آپ‌ها رو برای این سایت مجاز کن", "Google sign-in did not open; allow pop-ups for this site"))),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

// The folder phone uploads land in (found again by name, so every upload goes to the same place).
async function uploadFolder(token) {
  const name = "Sugimoto video uploads";
  const q = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await fetch(`${DRIVE}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, { headers: authHeader(token) });
  if (res.ok) {
    const found = (await res.json()).files || [];
    if (found[0]) return found[0].id;
  }
  return makeFolder(token, name);
}

function openPicker(cfg, token, kind, mode, parent) {
  const p = window.google.picker;
  return new Promise((resolve) => {
    if (mode === "upload") {
      // Google's own upload page: it sends the file from the phone to Drive in pieces and keeps going
      // on a weak connection, so a long video does not have to pass through this app.
      const up = new p.DocsUploadView().setIncludeFolders(false);
      if (parent) up.setParent(parent);
      new p.PickerBuilder()
        .setAppId(cfg.appId)
        .setDeveloperKey(cfg.apiKey)
        .setOAuthToken(token)
        .addView(up)
        .setCallback((data) => {
          const action = data[p.Response.ACTION];
          if (action === p.Action.PICKED) resolve(data[p.Response.DOCUMENTS][0]);
          else if (action === p.Action.CANCEL) resolve(null);
        })
        .build()
        .setVisible(true);
      return;
    }
    const view = (shared) => {
      const v = new p.DocsView(p.ViewId.DOCS).setIncludeFolders(true).setSelectFolderEnabled(false);
      if (shared) v.setEnableDrives(true);
      if (MIME[kind]) v.setMimeTypes(MIME[kind]);
      return v;
    };
    new p.PickerBuilder()
      .setAppId(cfg.appId)
      .setDeveloperKey(cfg.apiKey)
      .setOAuthToken(token)
      .enableFeature(p.Feature.SUPPORT_DRIVES)
      .addView(view(false))
      .addView(view(true))
      .setCallback((data) => {
        const action = data[p.Response.ACTION];
        if (action === p.Action.PICKED) resolve(data[p.Response.DOCUMENTS][0]);
        else if (action === p.Action.CANCEL) resolve(null);
      })
      .build()
      .setVisible(true);
  });
}

// The worker and the publishing clock fetch the file without signing in, so it must open by link.
async function shareByLink(token, id) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  if (res.ok) return true;
  const body = await res.json().catch(() => ({}));
  const msg = (body.error && body.error.message) || "";
  throw new Error(
    res.status === 403
      ? L("Drive اجازه نداد این فایل با لینک به اشتراک گذاشته بشه (درایو مشترک یا صاحبش جلوش رو گرفته). در Drive اون رو روی «Anyone with the link» بذار، بعد لینکش رو این‌جا بچسبون.", "Drive did not allow sharing this file by link (a shared drive or its owner blocks it). Share it as “Anyone with the link” in Drive, then paste its link.")
      : L("اشتراک‌گذاری فایل با لینک نشد", "could not share the file by link") + (msg ? ": " + msg : "")
  );
}

// ---- Save to Google Drive: the finished post's files go into a new folder in the person's own Drive.
// Same sign-in as the picker (drive.file: the app only sees what it creates). The files are read
// through this app's own download links, then sent to Drive from the browser.

const DRIVE = "https://www.googleapis.com";
const authHeader = (token) => ({ Authorization: "Bearer " + token });

async function driveError(res, what) {
  const body = await res.json().catch(() => ({}));
  const msg = (body.error && body.error.message) || "";
  if (res.status === 401) g.token = null;
  throw new Error(`${what}${msg ? ": " + msg : L(` (خطا ${res.status})`, ` (error ${res.status})`)}`);
}

async function makeFolder(token, name) {
  const res = await fetch(`${DRIVE}/drive/v3/files?supportsAllDrives=true`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder" }),
  });
  if (!res.ok) await driveError(res, L("ساختن پوشه در Drive نشد", "could not make the folder in Drive"));
  return (await res.json()).id;
}

async function uploadFile(token, name, blob, parent) {
  const type = blob.type || "application/octet-stream";
  const init = await fetch(`${DRIVE}/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": type },
    body: JSON.stringify({ name, parents: [parent] }),
  });
  if (!init.ok) await driveError(init, L(`آپلود ${name} شروع نشد`, `could not start uploading ${name}`));
  const where = init.headers.get("Location");
  if (!where) throw new Error(L(`Drive برای ${name} آدرس آپلود نداد`, `Drive gave no upload address for ${name}`));
  const put = await fetch(where, { method: "PUT", headers: { "Content-Type": type }, body: blob });
  if (!put.ok) await driveError(put, L(`آپلود ${name} نشد`, `could not upload ${name}`));
}

const fileName = (res, fallback) => {
  const m = (res.headers.get("Content-Disposition") || "").match(/filename\*=UTF-8''([^;]+)/i);
  try {
    return m ? decodeURIComponent(m[1]) : fallback;
  } catch {
    return fallback;
  }
};

// `urls` are this app's own download links (they carry the person's sign-in).
export function DriveSaveButton({ urls, folderName, disabled, label }) {
  label = label || L("ذخیره در Google Drive", "Save to Google Drive");
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({ error: "", ok: "", link: "" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    prepare().then((c) => alive.current && setCfg(c)).catch((e) => alive.current && setCfg({ enabled: false, error: e.message }));
    return () => {
      alive.current = false;
    };
  }, []);
  if (!cfg) return null;
  if (!cfg.enabled)
    return <small className="text-muted">{L("برای ذخیره در Google Drive، کلیدهای Google (GOOGLE_PICKER_*) باید روی سرور تنظیم بشن.", "Saving to Google Drive needs the Google keys (GOOGLE_PICKER_*) on the server.")}</small>;
  const click = () => {
    setNote({ error: "", ok: "", link: "" });
    const tokenP = requestToken(cfg); // inside the click, or phones block Google's popup
    setBusy(L("در حال ورود به Google…", "Signing in to Google…"));
    tokenP
      .then(async (token) => {
        const folder = await makeFolder(token, folderName);
        let n = 0;
        for (const u of urls) {
          ++n;
          setBusy(L(`در حال ذخیرهٔ ${n} از ${urls.length}…`, `Saving ${n} of ${urls.length}…`));
          const res = await fetch(u, { cache: "no-store" });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || L(`خوندن یه فایل نشد (خطا ${res.status})`, `could not read a file (error ${res.status})`));
          await uploadFile(token, fileName(res, L(`فایل ${n}`, `file ${n}`)), await res.blob(), folder);
        }
        if (alive.current) setNote({ error: "", ok: L(`${urls.length} فایل در پوشهٔ «${folderName}» در Drive ذخیره شد.`, `Saved ${urls.length} file${urls.length > 1 ? "s" : ""} to the Drive folder “${folderName}”.`), link: `https://drive.google.com/drive/folders/${folder}` });
      })
      .catch((e) => alive.current && setNote({ error: e.message, ok: "", link: "" }))
      .finally(() => alive.current && setBusy(""));
  };
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      <Button type="button" variant="outline" disabled={disabled || !!busy || !urls.length} onClick={click}>
        <DriveMark />
        {busy || label}
      </Button>
      {note.error && <small className="text-[#b91c1c]">{note.error}</small>}
      {note.ok && (
        <small className="text-[#067647]">
          {note.ok}{" "}
          <a href={note.link} target="_blank" rel="noreferrer" className="font-semibold underline">
            {L("باز کردن پوشه", "Open the folder")}
          </a>
        </small>
      )}
    </span>
  );
}

function DriveMark() {
  return (
    <svg width="18" height="16" viewBox="0 0 87.3 78" aria-hidden="true">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
    </svg>
  );
}

export default function DrivePicker({ kind = "any", mode = "pick", onPick, disabled, label }) {
  const upload = mode === "upload";
  label = label || (upload ? L("آپلود از همین گوشی", "Upload from this phone") : L("انتخاب از Google Drive", "Choose from Google Drive"));
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ error: "", ok: "" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    prepare().then((c) => alive.current && setCfg(c)).catch((e) => alive.current && setCfg({ enabled: false, error: e.message }));
    return () => {
      alive.current = false;
    };
  }, []);
  if (!cfg) return null;
  // Without the keys the buttons stay visible but off, so it is clear what is missing.
  if (!cfg.enabled)
    return (
      <span className="inline-flex min-w-0 flex-col items-start gap-1">
        <Button type="button" variant="outline" disabled>
          {upload ? <Upload size={16} aria-hidden /> : <DriveMark />}
          {label}
        </Button>
        {!upload && <small className="max-w-[260px] text-muted" dir={uiDir()}>{L("هر دو دکمه به کلیدهای Google (GOOGLE_PICKER_*) روی سرور نیاز دارن. تا اون موقع، لینک رو پایین بچسبون.", "Both buttons need the Google keys (GOOGLE_PICKER_*) on the server. Until then, paste a link below.")}</small>}
      </span>
    );
  const click = () => {
    setNote({ error: "", ok: "" });
    const tokenP = requestToken(cfg);
    setBusy(true);
    tokenP
      .then(async (token) => {
        const doc = await openPicker(cfg, token, kind, mode, upload ? await uploadFolder(token) : "");
        if (!doc) return;
        await shareByLink(token, doc.id);
        const file = { id: doc.id, name: doc.name, mimeType: doc.mimeType, url: `https://drive.google.com/file/d/${doc.id}/view` };
        onPick(file);
        if (alive.current) setNote({ error: "", ok: L(`${doc.name}: روی «Anyone with the link» به اشتراک گذاشته شد`, `${doc.name}: shared as “Anyone with the link”`) });
      })
      .catch((e) => {
        if (/invalid|expired|401/i.test(String(e.message))) g.token = null;
        if (alive.current) setNote({ error: e.message, ok: "" });
      })
      .finally(() => alive.current && setBusy(false));
  };
  return (
    <span className="inline-flex min-w-0 flex-col items-start gap-1">
      <Button type="button" variant="outline" disabled={disabled || busy} onClick={click}>
        <svg width="18" height="16" viewBox="0 0 87.3 78" aria-hidden="true">
          <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
          <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
          <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
          <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
          <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
          <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
        </svg>
        {busy ? L("در حال باز کردن Google Drive…", "Opening Google Drive…") : label}
      </Button>
      {note.error && <small className="text-[#b91c1c]">{note.error}</small>}
      {note.ok && <small className="text-[#067647]">{note.ok}</small>}
    </span>
  );
}
