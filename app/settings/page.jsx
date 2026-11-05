"use client";

// Settings (Hamed, Oct 27 2026: "everything about settings under Settings"): the app's language,
// notifications on this device and the password, one page reached from the account menu, so the
// menu itself keeps only the apps and Sign out.
import { useEffect, useState } from "react";
import { Bell, Check, Copy, Download, Languages, Mic, Settings, Share2 } from "lucide-react";
import { s, Shell, LANG_CHOICES } from "../editing/ui";
import PasswordForm from "../editing/PasswordForm";
import PushSwitch from "../PushSwitch";
import { L, chooseLang, getLang, uiDir } from "../../lib/i18n";

function SettingsPage({ user }) {
  return (
    <div dir={uiDir()} style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 560, width: "100%", margin: "0 auto" }}>
      <h1 className={s.title}>
        <Settings size={22} aria-hidden style={{ verticalAlign: "-4px" }} /> {L("تنظیمات", "Settings")}
      </h1>
      <section className={s.card}>
        <h2 className={s.h2}>
          <Languages size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> {L("زبان برنامه", "App language")}
        </h2>
        <div role="radiogroup" aria-label={L("زبان برنامه", "App language")}>
          {LANG_CHOICES.map(([k, name]) => (
            <button key={k} className={s.menuItem} role="radio" aria-checked={getLang() === k} onClick={() => getLang() !== k && chooseLang(k)} lang={k}>
              {getLang() === k ? <Check size={16} aria-hidden /> : <span style={{ width: 16, display: "inline-block" }} />} {name}
            </button>
          ))}
        </div>
      </section>
      <section className={s.card}>
        <h2 className={s.h2}>
          <Bell size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> {L("اعلان‌ها", "Notifications")}
        </h2>
        <div>
          <PushSwitch itemClass={s.menuItem} labelClass={s.menuLabel} mutedClass={s.muted} />
        </div>
      </section>
      <ShareShortcut />
      <VoiceExtension />
      <PasswordForm user={user} inSettings />
    </div>
  );
}

// Voice typing outside the app (Hamed, Oct 29 2026: a microphone in Odoo's "Log note"): a browser
// extension (extensions/voice) puts the same microphone on any site's text boxes; it needs this
// person's key, since it cannot carry the app's sign-in to another site.
// Share a post from Instagram, TikTok or YouTube straight into Studio (Hamed, 5 Nov 2026): an iPhone
// Shortcut in the Share menu posts the link to /api/share with this person's key. iPhone lets only
// installed apps into the Share menu, so a Shortcut is the way without Telegram.
function ShareShortcut() {
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch("/api/voice/key", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setKey(d.key || "")).catch(() => {});
  }, []);
  const url = key && typeof window !== "undefined" ? `${window.location.origin}/api/share?k=${encodeURIComponent(key)}` : "";
  const copy = () => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  const steps = [
    ["برنامهٔ Shortcuts (میان‌برها) رو باز کن، + رو بزن و اسمش رو بذار Topic Engine.", "Open the Shortcuts app, tap + and name it Topic Engine."],
    ["کار «Get Contents of URL» (دریافت محتوای URL) رو اضافه کن و آدرس زیر رو در URL بذار.", "Add the action Get Contents of URL and paste the address below as its URL."],
    ["«Show More» رو بزن: Method رو POST کن، Request Body رو Form، یک فیلد با اسم text اضافه کن و مقدارش رو از نوار متغیرها «Shortcut Input» (ورودی میان‌بر) بذار.", "Tap Show More: set Method to POST, Request Body to Form, add a field named text and set its value to Shortcut Input (from the variables bar)."],
    ["کار «Show Notification» (نمایش اعلان) رو اضافه کن تا جواب سیستم رو ببینی.", "Add the action Show Notification, so you see the system's answer."],
    ["ⓘ پایین صفحه رو بزن و «Show in Share Sheet» رو روشن کن. ذخیره.", "Tap ⓘ at the bottom and turn on Show in Share Sheet. Save."],
    ["حالا در اینستاگرام، تیک‌تاک یا یوتیوب: Share ← «Share to… / More» ← Topic Engine. بار اول آیفون اجازهٔ وصل شدن می‌خواد: «Always Allow».", "Now in Instagram, TikTok or YouTube: Share → Share to… / More → Topic Engine. The first time, iPhone asks to connect: Always Allow."],
  ];
  return (
    <section className={s.card}>
      <h2 className={s.h2}>
        <Share2 size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> {L("فرستادن پست از دکمهٔ Share گوشی", "Send posts from your phone's Share button")}
      </h2>
      <p className={s.muted}>
        {L(
          "هر ویدیو یا پستی که در اینستاگرام، تیک‌تاک، یوتیوب یا X می‌بینی رو با Share بفرست؛ سیستم متن ویدیو رو می‌خونه و یک موضوع در استودیو ← منابع خودم می‌سازه و وقتی آماده شد خبرت می‌کنه. یک بار راه‌اندازی، حدود دو دقیقه:",
          "Share any video or post you see on Instagram, TikTok, YouTube or X; the system reads what the video says, makes a topic in Studio → My sources and notifies you when it is ready. One-time setup, about two minutes:"
        )}
      </p>
      <ol className={s.muted} style={{ margin: "4px 0 10px", paddingInlineStart: 20, lineHeight: 1.8 }}>
        {steps.map((x, i) => <li key={i}>{L(x[0], x[1])}</li>)}
      </ol>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input readOnly value={url || "…"} data-no-voice data-no-copy dir="ltr" onFocus={(e) => e.target.select()} style={{ flex: 1, minWidth: 0, fontFamily: "monospace", fontSize: 12, padding: 8, border: "1px solid var(--line, #d0d5dd)", borderRadius: 8 }} aria-label={L("آدرس میان‌بر", "Shortcut address")} />
        <button className={s.menuItem} style={{ width: "auto" }} onClick={copy} disabled={!url}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? L("کپی شد", "Copied") : L("کپی", "Copy")}
        </button>
      </div>
      <p className={s.muted} style={{ marginTop: 6 }}>{L("این آدرس کلید شخصی خودت رو داره؛ به کسی نده. با عوض کردن رمز عبور باطل می‌شه و باید دوباره کپی‌اش کنی.", "This address carries your personal key; do not share it. Changing your password ends it, and you copy it again.")}</p>
    </section>
  );
}

function VoiceExtension() {
  const [key, setKey] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    fetch("/api/voice/key", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setKey(d.key || "")).catch(() => {});
  }, []);
  const copy = () => navigator.clipboard.writeText(key).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {});
  return (
    <section className={s.card}>
      <h2 className={s.h2}>
        <Mic size={18} aria-hidden style={{ verticalAlign: "-3px" }} /> {L("تایپ صوتی در سایت‌های دیگر (مثل Odoo)", "Voice typing on other sites (like Odoo)")}
      </h2>
      <ol className={s.muted} style={{ margin: "4px 0 10px", paddingInlineStart: 20, lineHeight: 1.8 }}>
        <li>{L("فایل افزونه را بگیر و از حالت فشرده باز کن.", "Download the extension and unzip it.")}</li>
        <li>{L("در Chrome یا Edge آدرس chrome://extensions را باز کن، «Developer mode» را روشن کن، «Load unpacked» را بزن و پوشهٔ sugimoto-voice را انتخاب کن.", "In Chrome or Edge open chrome://extensions, turn on Developer mode, click Load unpacked and choose the sugimoto-voice folder.")}</li>
        <li>{L("روی آیکون افزونه بزن و کلید زیر را آنجا بگذار و ذخیره کن.", "Click the extension's icon, paste the key below and save.")}</li>
        <li>{L("در هر کادر متن (Log note در Odoo) میکروفون گوشهٔ کادر را بزن، فارسی یا انگلیسی حرف بزن، دوباره بزن.", "In any text box (Odoo's Log note) tap the microphone at its corner, speak Farsi or English, tap again.")}</li>
      </ol>
      <a className={s.menuItem} href="/sugimoto-voice-extension.zip" download style={{ textDecoration: "none" }}>
        <Download size={16} aria-hidden /> {L("دانلود افزونه", "Download the extension")}
      </a>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
        <input readOnly value={key || "…"} data-no-voice data-no-copy dir="ltr" onFocus={(e) => e.target.select()} style={{ flex: 1, fontFamily: "monospace", fontSize: 12, padding: 8, border: "1px solid var(--line, #d0d5dd)", borderRadius: 8 }} aria-label={L("کلید شخصی", "Personal key")} />
        <button className={s.menuItem} style={{ width: "auto" }} onClick={copy} disabled={!key}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} {copied ? L("کپی شد", "Copied") : L("کپی", "Copy")}
        </button>
      </div>
      <p className={s.muted} style={{ marginTop: 6 }}>{L("این کلید فقط برای خودت است؛ با عوض کردن رمز عبور باطل می‌شود.", "This key is yours alone; changing your password ends it.")}</p>
    </section>
  );
}

export default function Page() {
  return <Shell>{(user) => <SettingsPage user={user} />}</Shell>;
}
