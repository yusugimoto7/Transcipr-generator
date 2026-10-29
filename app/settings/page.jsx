"use client";

// Settings (Hamed, Oct 27 2026: "everything about settings under Settings"): the app's language,
// notifications on this device and the password, one page reached from the account menu, so the
// menu itself keeps only the apps and Sign out.
import { useEffect, useState } from "react";
import { Bell, Check, Copy, Download, Languages, Mic, Settings } from "lucide-react";
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
      <VoiceExtension />
      <PasswordForm user={user} inSettings />
    </div>
  );
}

// Voice typing outside the app (Hamed, Oct 29 2026: a microphone in Odoo's "Log note"): a browser
// extension (extensions/voice) puts the same microphone on any site's text boxes; it needs this
// person's key, since it cannot carry the app's sign-in to another site.
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
