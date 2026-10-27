"use client";

// Settings (Hamed, Oct 27 2026: "everything about settings under Settings"): the app's language,
// notifications on this device and the password, one page reached from the account menu, so the
// menu itself keeps only the apps and Sign out.
import { Bell, Check, Languages, Settings } from "lucide-react";
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
      <PasswordForm user={user} inSettings />
    </div>
  );
}

export default function Page() {
  return <Shell>{(user) => <SettingsPage user={user} />}</Shell>;
}
