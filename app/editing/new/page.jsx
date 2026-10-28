"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, s, Shell, DriveVideo } from "../ui";
import DrivePicker from "../../DrivePicker";
import { L, uiDir } from "../../../lib/i18n";
import { Sheet, SheetContent } from "../../../components/ui/sheet";
import { Button } from "../../../components/ui/button";
import { Play, Check } from "lucide-react";

// Four ways in (Hamed, Oct 26 2026): raw footage to edit, a video to dub (Farsi to English or English
// to Farsi, english-sugimotovisa's dub pipeline), a finished video that only needs subtitles, or one
// that only needs motion graphics. All but the first start the project at that stage; review,
// corrections and approval work as for any version.
const TABS = [
  ["cut", ["تدوین", "Edit"]],
  ["dub", ["دوبله", "Dub"]],
  ["subtitles", ["فقط زیرنویس", "Subtitles only"]],
  ["graphics", ["فقط موشن‌گرافیک", "Motion graphics only"]],
];

// Subtitle choices in words, turned into pixels for the frame (portrait 1080x1920, landscape
// 1920x1080). 0 keeps the approved style; the worker keeps every value inside its safe bounds.
// The approved files a project can be started from, in stage order (lib/editing/projects.js STAGES).
const STAGE = { cut: ["برش", "Cut"], dub: ["دوبله", "Dub"], subtitles: ["زیرنویس", "Subtitles"], graphics: ["موشن‌گرافیک", "Motion graphics"] };

const fmt = (sec) => {
  const n = Math.round(Number(sec) || 0);
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};

// One approved file as a picture: the preview's thumbnail from Drive, the project's title, the stage
// and version. A tap on the picture plays it in place; "Choose" takes it (Hamed, 26 Oct 2026: a
// picker with previews, not a list of names).
function FileCard({ project, file, chosen, onChoose }) {
  const [playing, setPlaying] = useState(false);
  const pv = file.preview;
  return (
    <div className={s.card} style={{ padding: 0, overflow: "hidden", border: chosen ? "2px solid var(--orange)" : undefined }}>
      {playing && pv ? (
        <DriveVideo id={pv.id} embed={pv.embed} title={project.title} autoPlay style={{ width: "100%", aspectRatio: project.kind === "reel" ? "9 / 16" : "16 / 9", border: 0 }} />
      ) : (
        <button
          type="button"
          onClick={() => pv && setPlaying(true)}
          aria-label={L("پخش پیش‌نمایش", "Play the preview")}
          style={{ display: "grid", placeItems: "center", width: "100%", aspectRatio: project.kind === "reel" ? "9 / 16" : "16 / 9", border: 0, padding: 0, cursor: pv ? "pointer" : "default",
            background: pv ? `#0b0f14 url(https://drive.google.com/thumbnail?id=${pv.id}&sz=w600) center / cover no-repeat` : "#0b0f14" }}
        >
          {pv ? <span className={s.play}><Play size={16} /></span> : <span className={s.muted} style={{ color: "#aaa", fontSize: 13 }}>{L("پیش‌نمایشی نیست", "No preview")}</span>}
        </button>
      )}
      <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        <span className={s.kbTitle} dir="auto">{project.title}</span>
        <span className={s.kbBadges}>
          <span className={s.kbBadge}>{L(STAGE[file.stage])} v{file.version}</span>
          {file.output_s ? <span className={s.kbBadge}>{fmt(file.output_s)}</span> : null}
        </span>
        {onChoose && (
          <Button type="button" size="sm" variant={chosen ? "default" : "outline"} onClick={() => onChoose(project, file)}>
            {chosen ? <><Check /> {L("انتخاب‌شده", "Chosen")}</> : L("انتخاب", "Choose")}
          </Button>
        )}
      </div>
    </div>
  );
}

const SIZES = { portrait: { small: 64, large: 88 }, landscape: { small: 54, large: 74 } };
const HEIGHTS = { portrait: { higher: 1100, lower: 1400 }, landscape: { higher: 800, lower: 960 } };

function NewProject() {
  const router = useRouter();
  const q = useSearchParams();
  const [tab, setTab] = useState(q.get("tab") && q.get("tab") in STAGE ? q.get("tab") : "cut");
  // The video can be another project's approved file instead of a Drive link (Hamed, 26 Oct 2026:
  // "use the existing card"): the cut of one project becomes the video to dub or subtitle in a new one.
  const [mode, setMode] = useState(q.get("from") ? "project" : "link");
  const [projects, setProjects] = useState(null);
  const [from, setFrom] = useState({ project_id: q.get("from") || "", run_id: q.get("run") || "" });
  const [pick, setPick] = useState(false);
  useEffect(() => {
    if (mode !== "project" || projects) return;
    api("/projects")
      .then((d) => setProjects(d.projects.filter((p) => (p.approved || []).length)))
      .catch(() => setProjects([]));
  }, [mode, projects]);
  const origin = (projects || []).find((p) => p.id === from.project_id);
  useEffect(() => {
    // the latest stage's file is the usual choice; the title follows the project it came from
    if (!origin) return;
    const files = origin.approved || [];
    if (!files.some((x) => x.run_id === from.run_id)) setFrom((x) => ({ ...x, run_id: files[files.length - 1].run_id }));
    setF((x) => ({ ...x, title: x.title || origin.title, kind: origin.kind || x.kind }));
  }, [origin, from.run_id]);
  const [f, setF] = useState({ title: "", source_url: "", kind: "reel", language: "fa", topic: "" });
  const [sub, setSub] = useState({ size: "", height: "", words: "" });
  const [gfx, setGfx] = useState({ amount: "normal", brief: "", with_subtitles: false });
  const [dubTo, setDubTo] = useState("en");
  // Who speaks in a dub (Hamed, 27 Oct 2026: the border-officer series): one voice, or a cast in the order
  // they first speak. Speaker 1 is Hamed with the approved voice; the others pick a HeyGen public voice
  // from the worker's catalogue (/api/editing/voices reads config/video_process.json on main).
  // "one": Hamed only. "auto": the worker counts the voices and recognises the known people by their voice
  // prints (an unknown one is named on the project page afterwards). "cast": the people are named here, each
  // a known person (their fixed voice) or a new one (name + voice, saved for the next video).
  const [dubMode, setDubMode] = useState("one");
  const [cast, setCast] = useState([]);
  const [voices, setVoices] = useState(null);
  const [people, setPeople] = useState(null);
  useEffect(() => {
    if (tab !== "dub" || voices) return;
    api("/voices").then(setVoices).catch((e) => setVoices({ error: e.message }));
    api("/people").then((r) => setPeople(r.people || [])).catch(() => setPeople([]));
  }, [tab, voices]);
  const firstOther = (v) => (v && ((v.female || [])[0] || (v.male || [])[0] || {}).voice_id) || "hamed";
  const setCastAt = (i, k, val) => setCast((c) => c.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  // a row is a known person (person_id, the voice is theirs) or a new one ("" = new: name + voice typed here)
  const pickPerson = (i, pid) => {
    const person = (people || []).find((p) => p.id === pid);
    setCastAt(i, "person_id", pid);
    if (person) setCast((c) => c.map((x, j) => (j === i ? { ...x, person_id: pid, name: person.name, voice_id: person.voice_id } : x)));
  };
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
    if (mode === "project" && !(from.project_id && from.run_id)) {
      setError(L("یک پروژه و یکی از فایل‌های تأییدشده‌ش رو انتخاب کن.", "Choose a project and one of its approved files."));
      setBusy(false);
      return;
    }
    const body = { ...fields, ...(mode === "project" ? { from, source_url: "" } : {}), start: tab, ...(tab === "cut" ? {} : { settings: { subtitles, graphics: gfx, dub: { to: dubTo, mode: dubMode, ...(dubMode === "cast" ? { speakers: cast } : {}) } } }) };
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
          : tab === "dub"
            ? L("ویدیو با صدای خود حامد به زبان دیگه دوبله می‌شه و لب‌ها با صدای جدید هماهنگ می‌شن (همون فرایند دوبلهٔ تأییدشده). ترجمه فقط از حرف‌های خود ویدیوئه و دعوت به اقدام همیشه «لینک رو بزنید و وقت مشاوره بگیرید» هست. قبل از تأیید، نتیجه رو می‌بینی و اصلاح می‌دی.", "The video is dubbed into the other language in Hamed's own voice and the lips are synced to it (the approved dub process). The translation uses only what the video says, and the call to action is always to tap the link and book a consultation. You review and correct before approving.")
          : tab === "subtitles"
            ? L("برای ویدیوی تدوین‌شده و آماده: چیزی بریده نمی‌شه، فقط زیرنویس کلمه‌به‌کلمه (کلمهٔ گفته‌شده زرد) اضافه می‌شه. قبل از تأیید، نتیجه رو می‌بینی و اصلاح می‌دی.", "For a finished, edited video: nothing is cut, only word-by-word subtitles are added (the spoken word turns yellow). You review and correct before approving.")
            : L("برای ویدیوی تدوین‌شده و آماده: اول یک طرح (استوری‌بورد با چند فریم) می‌بینی و تأیید می‌کنی، بعد موشن‌گرافیک ساخته می‌شه. هر نوشته روی صفحه فقط از حرف‌های خود ویدیوئه.", "For a finished, edited video: you first see and approve a plan (storyboard with still frames), then the graphics are rendered. Every word on screen comes from the video itself.")}
      </p>
      <label className={s.field}>
        <span>{L("عنوان", "Title")}</span>
        <input id="title" className={s.input} value={f.title} onChange={set("title")} placeholder={L("اسپانسرشیپ داخل کانادا یا خارج از کانادا", "Inland vs overseas sponsorship")} required />
      </label>
      <div className={s.row} role="radiogroup" aria-label={L("ویدیو از کجا", "Where the video comes from")}>
        <label className={s.row} style={{ fontSize: 14 }}>
          <input type="radio" name="src-mode" checked={mode === "link"} onChange={() => setMode("link")} />
          <span>{L("ویدیو از Google Drive", "A video from Google Drive")}</span>
        </label>
        <label className={s.row} style={{ fontSize: 14 }}>
          <input type="radio" name="src-mode" checked={mode === "project"} onChange={() => setMode("project")} />
          <span>{L("از یک پروژهٔ موجود", "From an existing project")}</span>
        </label>
      </div>
      {mode === "project" && (
        <div className={s.field}>
          <span>{L("پروژه و فایل تأییدشده‌ای که ادامه داده می‌شه", "The project and the approved file to continue from")}</span>
          {origin && from.run_id && (
            <div style={{ maxWidth: 260 }}>
              <FileCard project={origin} file={(origin.approved || []).find((x) => x.run_id === from.run_id) || origin.approved[0]} chosen />
            </div>
          )}
          <div>
            <Button type="button" variant="outline" onClick={() => setPick(true)}>
              {origin && from.run_id ? L("عوض کردن", "Change") : L("انتخاب از پروژه‌ها…", "Choose from the projects…")}
            </Button>
          </div>
          <Sheet open={pick} onOpenChange={setPick}>
            <SheetContent title={L("کدوم فایل ادامه داده بشه؟", "Which file to continue?")} className="md:w-[min(960px,94vw)]">
              {!projects ? (
                <p className={s.muted}>{L("در حال خواندن پروژه‌ها…", "Reading the projects…")}</p>
              ) : !projects.length ? (
                <p className={s.muted}>{L("هنوز پروژه‌ای با فایل تأییدشده نیست.", "No project has an approved file yet.")}</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }} dir={uiDir()}>
                  {projects.flatMap((p) =>
                    (p.approved || []).map((x) => (
                      <FileCard
                        key={x.run_id}
                        project={p}
                        file={x}
                        chosen={from.project_id === p.id && from.run_id === x.run_id}
                        onChoose={(pr, fl) => {
                          setFrom({ project_id: pr.id, run_id: fl.run_id });
                          setPick(false);
                        }}
                      />
                    ))
                  )}
                </div>
              )}
            </SheetContent>
          </Sheet>
          <small className={s.muted}>
            {L("پروژهٔ جدیدی ساخته می‌شه که همون فایل رو ادامه می‌ده؛ پروژهٔ قبلی و فایل‌هاش دست نمی‌خورن.", "A new project is made that continues that file; the project it came from and its files are left as they are.")}
          </small>
        </div>
      )}
      {mode === "link" && (
      <div className={s.field}>
        <label htmlFor="source_url">{tab === "cut" ? L("ویدیوی خام در Google Drive", "Raw video in Google Drive") : tab === "dub" ? L("ویدیویی که دوبله می‌شه، در Google Drive", "The video to dub, in Google Drive") : L("ویدیوی تدوین‌شده در Google Drive", "The edited video in Google Drive")}</label>
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
      )}
      <div className={s.row}>
        <label className={`${s.field} ${s.grow}`}>
          <span>{L("نوع", "Kind")}</span>
          <select id="kind" className={s.select} value={f.kind} onChange={set("kind")}>
            <option value="reel">{L("ریل 9:16", "Reel 9:16")}</option>
            <option value="youtube">YouTube 16:9</option>
            <option value="course">{L("درس دوره", "Course lesson")}</option>
          </select>
        </label>
        {tab === "dub" ? (
        <label className={`${s.field} ${s.grow}`}>
          <span>{L("دوبله", "Dub")}</span>
          <select id="dub_to" className={s.select} value={dubTo} onChange={(e) => setDubTo(e.target.value)}>
            <option value="en">{L("از فارسی به انگلیسی", "Farsi to English")}</option>
            <option value="fa">{L("از انگلیسی به فارسی", "English to Farsi")}</option>
          </select>
        </label>
        ) : (
        <label className={`${s.field} ${s.grow}`}>
          <span>{L("زبان گفتار", "Spoken language")}</span>
          <select id="language" className={s.select} value={f.language} onChange={(e) => setF({ ...f, language: e.target.value, touched: true })}>
            {tab !== "cut" && <option value="auto">{L("خودش تشخیص بده", "Detect it")}</option>}
            <option value="fa">{L("فارسی", "Farsi")}</option>
            <option value="en">{L("انگلیسی", "English")}</option>
          </select>
        </label>
        )}
      </div>

      {tab === "dub" && (
        <div className={s.card} style={{ gap: 10 }}>
          <label className={s.field}>
            <span>{L("چه کسی حرف می‌زنه", "Who speaks")}</span>
            <select
              id="dub_cast"
              className={s.select}
              value={dubMode}
              onChange={(e) => {
                const m = e.target.value;
                setDubMode(m);
                setCast(m === "cast" ? [{ person_id: "hamed", name: "Hamed", voice_id: "hamed" }, { person_id: "", name: "", voice_id: firstOther(voices) }] : []);
              }}
            >
              <option value="one">{L("فقط حامد (صدای تأییدشده)", "Only Hamed (the approved voice)")}</option>
              <option value="auto">{L("خودش بشناسه (از فهرست افراد)", "Recognise them (from the people list)")}</option>
              <option value="cast">{L("خودم می‌گم کی‌ها هستن", "I say who they are")}</option>
            </select>
          </label>
          {dubMode === "auto" && (
            <small className={s.muted}>
              {L(
                `صداها شمرده می‌شن و هر کسی که در فهرست افراد باشه از روی صداش شناخته می‌شه و همون صدای همیشگی‌ش رو می‌گیره (${(people || []).map((p) => p.name).join("، ") || "هنوز فقط حامد"}). کسی که شناخته نشه، بعد از ساخت روی صفحهٔ پروژه اسم می‌گیره و از نسخهٔ بعد شناخته می‌شه.`,
                `The voices are counted; anyone in the people list is recognised by voice and keeps their usual voice (${(people || []).map((p) => p.name).join(", ") || "only Hamed so far"}). Someone not recognised is named on the project page afterwards and is recognised from the next version on.`
              )}
            </small>
          )}
          {dubMode === "cast" && (
            <>
              <small className={s.muted}>
                {L(
                  "به ترتیبی که اول حرف می‌زنن. کسی که در فهرست افراد هست با صدای همیشگی‌ش شناخته می‌شه؛ نفر جدید اسم و صدا می‌گیره و برای ویدیوهای بعد ذخیره می‌شه (هیچ‌وقت کلون بازیگر).",
                  "In the order they first speak. Someone in the people list is recognised with their usual voice; a new person gets a name and a voice here and is kept for the next videos (never a clone of the actor)."
                )}
              </small>
              {voices && voices.error && <div className={s.error}>{L("لیست صداها خونده نشد: ", "The voice list could not be read: ") + voices.error}</div>}
              {cast.map((x, i) => (
                <div key={i} className={s.row}>
                  <select className={`${s.select} ${s.grow}`} value={x.person_id || ""} onChange={(e) => pickPerson(i, e.target.value)} aria-label={L("نفر", "Who")}>
                    {(people || [{ id: "hamed", name: "Hamed", voice_id: "hamed" }]).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                    <option value="">{L("نفر جدید…", "New person…")}</option>
                  </select>
                  {!x.person_id && (
                    <>
                      <input
                        className={`${s.input} ${s.grow}`}
                        value={x.name}
                        onChange={(e) => setCastAt(i, "name", e.target.value)}
                        placeholder={L("اسم (مثلاً سارا)", "Name (e.g. Sara)")}
                        aria-label={L("اسم گوینده", "Speaker name")}
                      />
                      <select className={`${s.select} ${s.grow}`} value={x.voice_id} onChange={(e) => setCastAt(i, "voice_id", e.target.value)} aria-label={L("صدا", "Voice")}>
                        {voices && voices.female && voices.female.length > 0 && (
                          <optgroup label={L("صدای زن", "Female voices")}>
                            {voices.female.map((v) => (
                              <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                            ))}
                          </optgroup>
                        )}
                        {voices && voices.male && voices.male.length > 0 && (
                          <optgroup label={L("صدای مرد", "Male voices")}>
                            {voices.male.map((v) => (
                              <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </>
                  )}
                  {cast.length > 2 && (
                    <button type="button" className={s.btn} onClick={() => setCast((c) => c.filter((_, j) => j !== i))} aria-label={L("حذف", "Remove")}>
                      ×
                    </button>
                  )}
                </div>
              ))}
              {cast.length < ((voices && voices.max) || 4) && (
                <button type="button" className={s.btn} style={{ alignSelf: "flex-start" }} onClick={() => setCast((c) => [...c, { person_id: "", name: "", voice_id: firstOther(voices) }])}>
                  {L("+ یک نفر دیگه", "+ One more person")}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {tab === "dub" && dubTo === "fa" && (
        <small className={s.muted}>
          {L(
            "انگلیسی به فارسی: زیرنویس و کارت پایانی کشیده نمی‌شه؛ بعد از تأیید، زیرنویس فارسی رو با مرحلهٔ «زیرنویس» اضافه کن. هنوز کلون فارسیِ صدای حامد نداریم، پس فعلاً همون کلون انگلیسی فارسی حرف می‌زنه. ویدیو بهتره زیرنویسِ چسبیده نداشته باشه.",
            "English to Farsi: no subtitles or end card are drawn; add Farsi subtitles with the Subtitles step after approval. There is no Farsi clone of Hamed's voice yet, so his English clone speaks the Farsi for now. Best with a video that has no burned-in subtitles."
          )}
        </small>
      )}

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
              : tab === "dub"
                ? L("شروع دوبله", "Start the dub")
              : tab === "subtitles"
                ? L("شروع زیرنویس", "Start the subtitles")
                : L("شروع موشن‌گرافیک", "Start the motion graphics")}
        </button>
      </div>
    </form>
  );
}

export default function Page() {
  // useSearchParams needs a Suspense boundary for the static build
  return (
    <Shell>
      {() => (
        <Suspense fallback={null}>
          <NewProject />
        </Suspense>
      )}
    </Shell>
  );
}
