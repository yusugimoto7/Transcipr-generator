"use client";

// "Notifications" in the account menu (lib/push): turn this device on or off, choose whether the
// team's work counts too, and send a test. When this device cannot get them, the menu says why
// (server keys missing, a browser tab instead of the home-screen app, blocked in settings): iPhones
// get notifications only in the app added to the home screen and opened from its icon.
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
        if (!stop) setState({ failed: true });
      }
    })();
    return () => {
      stop = true;
    };
  }, []);
  if (!state || state.failed) return null;

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
  const test = async () => {
    setBusy(true);
    setMsg("");
    try {
      const d = await api("POST", { test: true });
      setMsg(d.sent ? L("فرستاده شد؛ اگه چند ثانیه دیگه نیومد، از تنظیمات گوشی اعلان‌های Sugimoto رو نگاه کن.", "Sent; if it does not arrive in a few seconds, check Sugimoto's notifications in the phone's settings.") : L("هیچ دستگاهی ثبت نشده؛ اول روشنش کن.", "No device is registered; turn it on first."));
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
      {/* Why this device cannot get notifications, said plainly (Hamed, Oct 27 2026: the app added
          to an iPhone's home screen from Edge never got one, and the menu said nothing). */}
      {!state.enabled || !supported() || (isIos() && !standalone()) || Notification.permission === "denied" ? (
        <div className={mutedClass} style={{ padding: "4px 12px 8px", fontSize: 12.5, lineHeight: 1.5 }}>
          {!state.enabled
            ? L("اعلان‌ها روی سرور روشن نیستن: کلیدهای VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY روی Render گذاشته نشده.", "Notifications are not switched on on the server: VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are not set on Render.")
            : isIos() && !standalone()
              ? L("این صفحه داخل مرورگر باز شده، نه به‌شکل برنامه، و آیفون به مرورگر اعلان نمی‌ده. آیکون فعلی رو پاک کن، این صفحه رو در Safari باز کن، Share ← «Add to Home Screen»، بعد برنامه رو از همون آیکون باز کن و اینجا اعلان‌ها رو روشن کن. آیکونی که از Edge یا Chrome ساخته بشه معمولاً داخل همون مرورگر باز می‌شه.", "This page is open inside a browser, not as the app, and an iPhone gives a browser no notifications. Delete the current icon, open this page in Safari, Share → “Add to Home Screen”, then open the app from that icon and turn notifications on here. An icon made from Edge or Chrome usually opens inside that browser.")
              : !supported()
                ? isIos()
                  ? L("این آیفون اعلان وب رو پشتیبانی نمی‌کنه: iOS باید ۱۶٫۴ یا جدیدتر باشه.", "This iPhone does not support web notifications: iOS 16.4 or later is needed.")
                  : L("این مرورگر اعلان وب رو پشتیبانی نمی‌کنه.", "This browser does not support web notifications.")
                : L("اعلان‌ها برای این برنامه بسته شده. از تنظیمات گوشی ← Notifications ← Sugimoto روشنش کن و دوباره اینجا رو باز کن.", "Notifications are blocked for this app. Allow them in the phone's Settings → Notifications → Sugimoto, then open this menu again.")}
        </div>
      ) : state.on ? (
        <>
          <button className={itemClass} onClick={test} disabled={busy} role="menuitem">
            <Bell size={16} aria-hidden /> {busy ? L("صبر کن…", "Wait…") : L("فرستادن اعلان آزمایشی", "Send a test notification")}
          </button>
          <button className={itemClass} onClick={turnOff} disabled={busy} role="menuitem">
            <BellOff size={16} aria-hidden /> {busy ? L("صبر کن…", "Wait…") : L("خاموش کردن روی این دستگاه", "Turn off on this device")}
          </button>
        </>
      ) : (
        <button className={itemClass} onClick={turnOn} disabled={busy} role="menuitem">
          <Bell size={16} aria-hidden /> {busy ? L("صبر کن…", "Wait…") : L("روشن کردن اعلان‌ها", "Turn on notifications")}
        </button>
      )}
      {state.enabled && (
        <button className={itemClass} role="menuitemcheckbox" aria-checked={!!state.team} onClick={() => setTeam(!state.team)}>
          {state.team ? <Check size={16} aria-hidden /> : <span style={{ width: 16, display: "inline-block" }} />} {L("کارهای بقیهٔ تیم هم خبرم کن", "Also tell me about the team's work")}
        </button>
      )}
      {msg && (
        <div className={mutedClass} style={{ padding: "2px 12px 8px", fontSize: 12.5 }}>
          {msg}
        </div>
      )}
    </>
  );
}
