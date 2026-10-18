"use client";

// "Choose from Google Drive": opens Google's own file picker, then shares the chosen file as
// "Anyone with the link" (the editing worker, the calendar's publishing and the video workflow all
// download it by link) and hands back its /file/d/<id>/view link. The person signs in with their own
// Google account in Google's popup; the app only ever gets access to the files picked here
// (drive.file scope). Keys come from /api/drive/config; without them the button does not show and
// the link field next to it works as before.

import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button";

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
        reject(new Error("Google's picker did not load; check the connection"));
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
        if (r.error) return reject(new Error(r.error === "access_denied" ? "Google sign-in was cancelled" : r.error));
        g.token = { value: r.access_token, expires: Date.now() + Number(r.expires_in || 3600) * 1000 };
        resolve(r.access_token);
      },
      error_callback: (e) => reject(new Error(e && e.type === "popup_closed" ? "Google sign-in was closed" : "Google sign-in did not open; allow pop-ups for this site")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

function openPicker(cfg, token, kind) {
  const p = window.google.picker;
  return new Promise((resolve) => {
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
      ? "Drive did not allow sharing this file by link (a shared drive or its owner blocks it). Share it as “Anyone with the link” in Drive, then paste its link."
      : "could not share the file by link" + (msg ? ": " + msg : "")
  );
}

export default function DrivePicker({ kind = "any", onPick, disabled, label = "Choose from Google Drive" }) {
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
  if (!cfg || !cfg.enabled) return null;
  const click = () => {
    setNote({ error: "", ok: "" });
    const tokenP = requestToken(cfg);
    setBusy(true);
    tokenP
      .then(async (token) => {
        const doc = await openPicker(cfg, token, kind);
        if (!doc) return;
        await shareByLink(token, doc.id);
        const file = { id: doc.id, name: doc.name, mimeType: doc.mimeType, url: `https://drive.google.com/file/d/${doc.id}/view` };
        onPick(file);
        if (alive.current) setNote({ error: "", ok: `${doc.name}: shared as “Anyone with the link”` });
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
        {busy ? "Opening Google Drive…" : label}
      </Button>
      {note.error && <small className="text-[#b91c1c]">{note.error}</small>}
      {note.ok && <small className="text-[#067647]">{note.ok}</small>}
    </span>
  );
}
