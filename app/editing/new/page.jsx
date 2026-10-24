"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, s, Shell } from "../ui";
import DrivePicker from "../../DrivePicker";
import { L, uiDir } from "../../../lib/i18n";

function NewProject() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", source_url: "", kind: "reel", language: "fa", topic: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const picked = (file) => setF((x) => ({ ...x, source_url: file.url, title: x.title || file.name.replace(/\.[^.]+$/, "") }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { project } = await api("/projects", { method: "POST", body: f });
      router.push(`/editing/p/${project.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className={s.card} onSubmit={submit} style={{ maxWidth: 640 }} dir={uiDir()}>
      <h1 className={s.title}>{L("پروژهٔ جدید", "New project")}</h1>
      <p className={s.muted}>
        {L("دستگاه تدوین فقط مکث‌ها، شروع‌های اشتباه و برداشت‌های تکراری رو حذف می‌کنه. قبل از هر تأییدی، خودت نتیجه رو بازبینی می‌کنی.", "The editing machine removes pauses, false starts and retakes only. You review the result before anything is approved.")}
      </p>
      <label className={s.field}>
        <span>{L("عنوان", "Title")}</span>
        <input id="title" className={s.input} value={f.title} onChange={set("title")} placeholder={L("اسپانسرشیپ داخل کانادا یا خارج از کانادا", "Inland vs overseas sponsorship")} required />
      </label>
      <div className={s.field}>
        <label htmlFor="source_url">{L("ویدیوی خام در Google Drive", "Raw video in Google Drive")}</label>
        <div className={s.row} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
          <DrivePicker kind="video" mode="upload" onPick={picked} />
          <DrivePicker kind="video" onPick={picked} />
        </div>
        <input id="source_url" data-no-voice className={s.input} value={f.source_url} onChange={set("source_url")} placeholder={L("یا لینکش رو بچسبون: https://drive.google.com/file/d/…/view", "or paste its link: https://drive.google.com/file/d/…/view")} required />
        <small className={s.muted}>
          {L(
            "آپلود از همین گوشی ویدیو رو به Google Drive خودت (پوشهٔ «Sugimoto video uploads») می‌فرسته و برات به اشتراک می‌ذاره؛ فایلی که از Drive انتخاب بشه هم همین‌طور به اشتراک گذاشته می‌شه. لینکی که می‌چسبونی باید روی «Anyone with the link» به اشتراک گذاشته شده باشه. حداکثر ۲۰ دقیقه فیلم.",
            "Upload from this phone sends the video to your Google Drive (folder “Sugimoto video uploads”) and shares it for you; a file chosen from Drive is shared that way too. A pasted link must be shared as “Anyone with the link”. Up to 20 minutes of footage."
          )}
        </small>
      </div>
      <div className={s.row}>
        <label className={`${s.field} ${s.grow}`}>
          <span>{L("نوع", "Kind")}</span>
          <select id="kind" className={s.select} value={f.kind} onChange={set("kind")}>
            <option value="reel">{L("ریل 9:16", "Reel 9:16")}</option>
            <option value="youtube">YouTube 16:9</option>
            <option value="course">{L("درس دوره", "Course lesson")}</option>
          </select>
        </label>
        <label className={`${s.field} ${s.grow}`}>
          <span>{L("زبان گفتار", "Spoken language")}</span>
          <select id="language" className={s.select} value={f.language} onChange={set("language")}>
            <option value="fa">{L("فارسی", "Farsi")}</option>
            <option value="en">{L("انگلیسی", "English")}</option>
          </select>
        </label>
      </div>
      <label className={s.field}>
        <span>{L("موضوع (اختیاری)", "Topic (optional)")}</span>
        <input id="topic" className={s.input} value={f.topic} onChange={set("topic")} placeholder={L("موضوعی که این ویدیو درباره‌شه", "The topic this video is about")} />
      </label>
      <label className={s.row} style={{ fontSize: 14 }}>
        <input id="subs" type="checkbox" disabled /> <span className={s.muted}>{L("زیرنویس فارسی: در مرحلهٔ بعد", "Farsi subtitles: coming in the next phase")}</span>
      </label>
      {error && <div className={s.error}>{error}</div>}
      <div className={s.row}>
        <button className={`${s.btn} ${s.primary}`} disabled={busy}>
          {busy ? L("در حال بررسی لینک…", "Checking the link…") : L("شروع تدوین", "Start editing")}
        </button>
      </div>
    </form>
  );
}

export default function Page() {
  return <Shell>{() => <NewProject />}</Shell>;
}
