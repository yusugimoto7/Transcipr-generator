"use client";

// "Notifications" in the account menu (lib/push): turn this device on or off, choose whether the
// team's work counts too, and send a test. iPhones get notifications only in the app added to the
// home screen from Safari, so a plain Safari tab says how to do that instead.
import { useEffect, useState } from "react";
import { Bell, BellOff, Check } from "lucide-react";
import { L } from "../lib/i18n";

const api = async (method, body) => {
  const res = await fetch("/api/push", { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "HTTP " + res.status);
  return data;
};

function keyBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => typeof window !== "undefined" && (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true);

export default function PushSwitch({ itemClass, labelClass, mutedClass }) {
  const [state, setState] = useState(null); // { enabled, key, team, on }
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const d = await api("GET");
        let on = false;
        if (supported() && d.enabled) {
          const reg = await navigator.serviceWorker.register("/sw.js");
          const sub = await reg.pushManager.getSubscription();
          on = !!sub && d.devices.includes(sub.endpoint) && Notification.permission === "granted";
        }
        if (!stop) setState({ ...d, on });
      } catch (_) {
        if (!stop) setState({ enabled: false });
      }
    })();
    return () => {
      stop = true;
    };
  }, []);
  if (!state || !state.enabled) return null;

  const turnOn = async () => {
    setBusy(true);
    setMsg("");
    try {
      // first, while the tap still counts: iOS asks only from a direct tap
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error(L("اجازهٔ اعلان داده نشد. از تنظیمات آیفون ← Notifications ← Sugimoto روشنش کن.", "Notifications were not allowed. Turn them on in iPhone Settings → Notifications → Sugimoto."));
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.key) }));
      await api("POST", { subscription: sub.toJSON() });
      await api("POST", { test: true });
      setState({ ...state, on: true });
      setMsg(L("روشن شد. یک اعلان آزمایشی فرستادیم.", "On. A test notification is on its way."));
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    setMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg && (await reg.pushManager.getSubscription());
      if (sub) {
        await api("DELETE", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState({ ...state, on: false });
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  const setTeam = async (team) => {
    setState({ ...state, team });
    await api("PATCH", { team }).catch((e) => setMsg(e.message));
  };

  return (
    <>
      <div className={labelClass}>
        <Bell size={14} aria-hidden /> {L("اعلان‌ها روی این دستگاه", "Notifications on this device")}
      </div>
      {!supported() || (isIos() && !standalone()) ? (
        <div className={mutedClass} style={{ padding: "4px 12px 8px", fontSize: 12.5, lineHeight: 1.5 }}>
          {isIos()
            ? L("روی آیفون: این صفحه رو در Safari باز کن، دکمهٔ Share ← «Add to Home Screen»، بعد برنامه رو از آیکونش باز کن و اینجا اعلان‌ها رو روشن کن.", "On iPhone: open this page in Safari, tap Share → “Add to Home Screen”, then open the app from its icon and turn notifications on here.")
            : L("این مرورگر اعلان وب رو پشتیبانی نمی‌کنه.", "This browser does not support web notifications.")}
        </div>
      ) : state.on ? (
        <button className={itemClass} onClick={turnOff} disabled={busy} role="menuitem">
          <BellOff size={16} aria-hidden /> {busy ? L("صبر کن…", "Wait…") : L("خاموش کردن روی این دستگاه", "Turn off on this device")}
        </button>
      ) : (
        <button className={itemClass} onClick={turnOn} disabled={busy} role="menuitem">
          <Bell size={16} aria-hidden /> {busy ? L("صبر کن…", "Wait…") : L("روشن کردن اعلان‌ها", "Turn on notifications")}
        </button>
      )}
      <button className={itemClass} role="menuitemcheckbox" aria-checked={!!state.team} onClick={() => setTeam(!state.team)}>
        {state.team ? <Check size={16} aria-hidden /> : <span style={{ width: 16, display: "inline-block" }} />} {L("کارهای بقیهٔ تیم هم خبرم کن", "Also tell me about the team's work")}
      </button>
      {msg && (
        <div className={mutedClass} style={{ padding: "2px 12px 8px", fontSize: 12.5 }}>
          {msg}
        </div>
      )}
    </>
  );
}
