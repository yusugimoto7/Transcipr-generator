"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, s, Shell } from "../ui";
import DrivePicker from "../../DrivePicker";
import { L, uiDir } from "../../../lib/i18n";

// Three ways in (Hamed, Oct 26 2026): raw footage to edit, a finished video that only needs
// subtitles, or one that only needs motion graphics. The last two start the project at that stage;
// review, corrections and approval work as for any version.
const TABS = [
  ["cut", ["تدوین", "Edit"]],
  ["subtitles", ["فقط زیرنویس", "Subtitles only"]],
  ["graphics", ["فقط موشن‌گرافیک", "Motion graphics only"]],
];

// Subtitle choices in words, turned into pixels for the frame (portrait 1080x1920, landscape
// 1920x1080). 0 keeps the approved style; the worker keeps every value inside its safe bounds.
const SIZES = { portrait: { small: 64, large: 88 }, landscape: { small: 54, large: 74 } };
const HEIGHTS = { portrait: { higher: 1100, lower: 1400 }, landscape: { higher: 800, lower: 960 } };

function NewProject() {
  const router = useRouter();
  const [tab, setTab] = useState("cut");
  const [f, setF] = useState({ title: "", source_url: "", kind: "reel", language: "fa", topic: "" });
  const [sub, setSub] = useState({ size: "", height: "", words: "" });
  const [gfx, setGfx] = useState({ amount: "normal", brief: "", with_subtitles: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const picked = (file) => setF((x) => ({ ...x, source_url: file.url, title: x.title || file.name.replace(/\.[^.]+$/, "") }));
  const shape = f.kind === "youtube" ? "landscape" : "portrait";
  const pickTab = (t) => {
    setTab(t);
    // A finished video's language is heard by default; raw footage needs it said.
    setF((x) => ({ ...x, language: t === "cut" ? (x.language === "auto" ? "fa" : x.language) : x.language === "fa" && !x.touched ? "auto" : x.language }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const subtitles = {
      size: (SIZES[shape] || {})[sub.size] || 0,
      position_y: (HEIGHTS[shape] || {})[sub.height] || 0,
      words_per_group: Number(sub.words) || 0,
    };
    const { touched, ...fields } = f;
    const body = { ...fields, start: tab, ...(tab === "cut" ? {} : { settings: { subtitles, graphics: gfx } }) };
    try {
      const { project } = await api("/projects", { method: "POST", body });
      router.push(`/editing/p/${project.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const subtitleFields = (
    <div className={s.row} style={{ flexWrap: "wrap" }}>
      <label className={`${s.field} ${s.grow}`}>
        <span>{L("اندازهٔ زیرنویس", "Subtitle size")}</span>
        <select id="sub_size" className={s.select} value={sub.size} onChange={(e) => setSub({ ...sub, size: e.target.value })}>
          <option value="">{L("همون استایل تأییدشده", "The approved style")}</option>
          <option value="small">{L("کوچک‌تر", "Smaller")}</option>
          <option value="large">{L("بزرگ‌تر", "Larger")}</option>
        </select>
      </label>
      <label className={`${s.field} ${s.grow}`}>
        <span>{L("جای زیرنویس", "Subtitle height")}</span>
        <select id="sub_height" className={s.select} value={sub.height} onChange={(e) => setSub({ ...sub, height: e.target.value })}>
          <option value="">{L("همون جای تأییدشده (روی سینه)", "The approved place (chest band)")}</option>
          <option value="higher">{L("بالاتر", "Higher")}</option>
          <option value="lower">{L("پایین‌تر", "Lower")}</option>
        </select>
      </label>
      <label className={`${s.field} ${s.grow}`}>
        <span>{L("چند کلمه هم‌زمان", "Words at a time")}</span>
        <select id="sub_words" className={s.select} value={sub.words} onChange={(e) => setSub({ ...sub, words: e.target.value })}>
          <option value="">{L("همون تأییدشده (۳)", "The approved (3)")}</option>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </label>
    </div>
  );
  return (
    <form className={s.card} onSubmit={submit} style={{ maxWidth: 640 }} dir={uiDir()}>
      <h1 className={s.title}>{L("پروژهٔ جدید", "New project")}</h1>
      <div role="tablist" className={s.row} style={{ gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {TABS.map(([k, name]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${s.btn} ${tab === k ? s.primary : ""}`} onClick={() => pickTab(k)}>
            {L(...name)}
          </button>
        ))}
      </div>
      <p className={s.muted}>
        {tab === "cut"
          ? L("دستگاه تدوین فقط مکث‌ها، شروع‌های اشتباه و برداشت‌های تکراری رو حذف می‌کنه. قبل از هر تأییدی، خودت نتیجه رو بازبینی می‌کنی.", "The editing machine removes pauses, false starts and retakes only. You review the result before anything is approved.")
          : tab === "subtitles"
            ? L("برای ویدیوی تدوین‌شده و آماده: چیزی بریده نمی‌شه، فقط زیرنویس کلمه‌به‌کلمه (کلمهٔ گفته‌شده زرد) اضافه می‌شه. قبل از تأیید، نتیجه رو می‌بینی و اصلاح می‌دی.", "For a finished, edited video: nothing is cut, only word-by-word subtitles are added (the spoken word turns yellow). You review and correct before approving.")
            : L("برای ویدیوی تدوین‌شده و آماده: اول یک طرح (استوری‌بورد با چند فریم) می‌بینی و تأیید می‌کنی، بعد موشن‌گرافیک ساخته می‌شه. هر نوشته روی صفحه فقط از حرف‌های خود ویدیوئه.", "For a finished, edited video: you first see and approve a plan (storyboard with still frames), then the graphics are rendered. Every word on screen comes from the video itself.")}
      </p>
      <label className={s.field}>
        <span>{L("عنوان", "Title")}</span>
        <input id="title" className={s.input} value={f.title} onChange={set("title")} placeholder={L("اسپانسرشیپ داخل کانادا یا خارج از کانادا", "Inland vs overseas sponsorship")} required />
      </label>
      <div className={s.field}>
        <label htmlFor="source_url">{tab === "cut" ? L("ویدیوی خام در Google Drive", "Raw video in Google Drive") : L("ویدیوی تدوین‌شده در Google Drive", "The edited video in Google Drive")}</label>
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
          <select id="language" className={s.select} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value, touched: true })}>
            {tab !== "cut" && <option value="auto">{L("خودش تشخیص بده", "Detect it")}</option>}
            <option value="fa">{L("فارسی", "Farsi")}</option>
            <option value="en">{L("انگلیسی", "English")}</option>
          </select>
        </label>
      </div>

      {tab === "subtitles" && subtitleFields}

      {tab === "graphics" && (
        <>
          <label className={s.field}>
            <span>{L("چقدر گرافیک", "How much graphics")}</span>
            <select id="gfx_amount" className={s.select} value={gfx.amount} onChange={(e) => setGfx({ ...gfx, amount: e.target.value })}>
              <option value="light">{L("کم: فقط عددها، اسم‌ها و اصطلاح‌های کلیدی", "Light: only the key numbers, names and terms")}</option>
              <option value="normal">{L("معمولی (مثل نمونهٔ تأییدشده)", "Normal (like the approved example)")}</option>
              <option value="rich">{L("زیاد: برای هر نکته یک صحنه", "Rich: a scene for every point")}</option>
            </select>
          </label>
          <label className={s.field}>
            <span>{L("توضیح برای طراح (اختیاری)", "Brief for the designer (optional)")}</span>
            <textarea id="gfx_brief" className={s.input} rows={3} value={gfx.brief} onChange={(e) => setGfx({ ...gfx, brief: e.target.value })} placeholder={L("مثلاً: روی مقایسهٔ دو مسیر تأکید کن، نقشهٔ کانادا رو نشون بده…", "e.g. stress the comparison of the two routes, show the map of Canada…")} />
          </label>
          <label className={s.row} style={{ fontSize: 14 }}>
            <input id="gfx_subs" type="checkbox" checked={gfx.with_subtitles} onChange={(e) => setGfx({ ...gfx, with_subtitles: e.target.checked })} />
            <span>{L("زیرنویس هم روی ویدیو باشه", "Burn in subtitles too")}</span>
          </label>
          {gfx.with_subtitles && subtitleFields}
          <small className={s.muted}>
            {L("سبک: «کانواس» (کاغذ شطرنجی، اشیا با کلمهٔ گفته‌شده ظاهر می‌شن، گوینده در حباب گرد). سبک «کارت‌ها» هنوز آزمایشیه و اینجا نیست.", "Style: “canvas” (grid paper, objects appear on the spoken word, the speaker in a round bubble). The “cards” style is still a prototype and is not offered here.")}
          </small>
        </>
      )}

      {tab === "cut" && (
        <label className={s.field}>
          <span>{L("موضوع (اختیاری)", "Topic (optional)")}</span>
          <input id="topic" className={s.input} value={f.topic} onChange={set("topic")} placeholder={L("موضوعی که این ویدیو درباره‌شه", "The topic this video is about")} />
        </label>
      )}
      {error && <div className={s.error}>{error}</div>}
      <div className={s.row}>
        <button className={`${s.btn} ${s.primary}`} disabled={busy}>
          {busy
            ? L("در حال بررسی لینک…", "Checking the link…")
            : tab === "cut"
              ? L("شروع تدوین", "Start editing")
              : tab === "subtitles"
                ? L("شروع زیرنویس", "Start the subtitles")
                : L("شروع موشن‌گرافیک", "Start the motion graphics")}
        </button>
      </div>
    </form>
  );
}

export default function Page() {
  return <Shell>{() => <NewProject />}</Shell>;
}
