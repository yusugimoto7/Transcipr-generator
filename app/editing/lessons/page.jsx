"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, s, Shell, Mixed, when } from "../ui";
import { L, uiDir } from "../../../lib/i18n";

// Labels are pairs (lib/i18n.js), read with L() when drawn.
const STATE = {
  proposed: [["منتظر تو", "Waiting for you"], s.s_review],
  applying: [["در حال ثبت قانون", "Committing the rule"], s.s_delivering],
  applied: [["در قوانین", "In the rules"], s.s_approved],
  rejected: [["ردشده", "Rejected"], s.s_failed],
  stale: [["قدیمی شده", "Out of date"], s.s_failed],
  failed: [["ثبت ناموفق", "Commit failed"], s.s_failed],
};

// The kinds of content a rule applies to (lib/learning.js SCOPES); the server's English name is
// the fallback for a kind added there later.
const SCOPE_NAMES = {
  design: ["تصویرها (اسلایدهای کاروسل، تصویر Telegram)", "Pictures (carousel slides, Telegram picture)"],
  carousel: ["متن و کپشن کاروسل", "Carousel text and caption"],
  telegram: ["پست خبری Telegram", "Telegram news post"],
  story: ["استوری Instagram", "Instagram story"],
  script: ["اسکریپت‌های ویدیو", "Video scripts"],
  article: ["مقالهٔ وبلاگ", "Blog article"],
  visa: ["استوری‌های نتیجهٔ ویزا (چه چیزی پوشانده می‌شه، کدام تاریخ‌ها علامت می‌خوره، متن و ظاهر استوری)", "Visa-result stories (what is covered, which dates are marked, the story text and look)"],
};

function Edit({ e }) {
  return (
    <div className={s.diff}>
      <div className={s.muted}>{e.file}</div>
      <pre className={`${s.pre} ${s.diffOld}`} dir="auto">{e.old}</pre>
      <pre className={`${s.pre} ${s.diffNew}`} dir="auto">{e.new}</pre>
    </div>
  );
}

function Lesson({ l, reload }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  const [label, cls] = STATE[l.status] || [[l.status, l.status], ""];
  const act = async (action) => {
    setBusy(action);
    setError("");
    try {
      await api(`/lessons/${l.id}`, { method: "POST", body: { action, note } });
      await reload();
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
    setConfirm(false);
  };
  const open = l.status === "proposed" || l.status === "failed";
  return (
    <div className={s.card} dir={uiDir()}>
      <div className={s.row}>
        <h2 className={`${s.h2} ${s.grow}`} dir="auto">
          <Mixed text={l.title} />
        </h2>
        <span className={`${s.pill} ${cls}`}>{L(label)}</span>
      </div>
      <div dir="auto">
        <Mixed text={l.why} />
      </div>
      <div>
        <p className={s.muted}>
          {L("از اصلاحیه‌های", "From the corrections on")} <Link href={`/editing/p/${l.project_id}`}>{l.project_title}</Link>{L(`، نسخهٔ ${l.version - 1}`, `, version ${l.version - 1}`)} · {L("پیشنهادشده", "proposed")} {when(l.created_at)}
        </p>
        <ul className={s.list}>
          {(l.corrections || []).map((c) => (
            <li key={c.id}>
              <b>{c.out}</b> <bdi><Mixed text={c.note} /></bdi>
            </li>
          ))}
        </ul>
      </div>
      <details open={open}>
        <summary className={s.muted} style={{ cursor: "pointer" }}>
          {L("تغییر، فایل به فایل (قرمز قانون فعلیه، سبز چیزیه که جاش می‌شینه)", "The change, file by file (red is the rule now, green is what replaces it)")}
        </summary>
        {(l.edits || []).map((e, i) => (
          <Edit key={i} e={e} />
        ))}
      </details>
      {l.error && <div className={s.error}>{l.error}</div>}
      {l.status === "applied" && l.commit_url && (
        <div className={s.ok}>
          {L("از ویدیوی بعدی در قوانینه.", "In the rules from the next video on.")}{" "}
          <a href={l.commit_url} target="_blank" rel="noreferrer">
            {L("دیدن تغییر", "See the change")}
          </a>
        </div>
      )}
      {l.status === "rejected" && l.rejection && l.rejection.note && <p className={s.muted}>{L("رد شد:", "Rejected:")} {l.rejection.note}</p>}
      {(open || l.status === "stale") &&
        (confirm ? (
          <div className={s.row}>
            <span className={s.grow}>{L("این از حالا قانون همهٔ ویدیوها بشه؟", "Make this the rule for every video from now on?")}</span>
            <button className={`${s.btn} ${s.primary}`} disabled={!!busy} onClick={() => act("approve")}>
              {L("بله، قانون عوض بشه", "Yes, change the rule")}
            </button>
            <button className={s.btn} onClick={() => setConfirm(false)}>
              {L("انصراف", "Cancel")}
            </button>
          </div>
        ) : (
          <div className={s.row}>
            {open && (
              <button className={`${s.btn} ${s.primary}`} disabled={!!busy} onClick={() => setConfirm(true)}>
                {L("تأیید", "Approve")}
              </button>
            )}
            <input className={`${s.input} ${s.grow}`} placeholder={L("چرا نه (اختیاری)", "Why not (optional)")} value={note} onChange={(e) => setNote(e.target.value)} aria-label={L("چرا نه", "Why not")} />
            <button className={s.btn} disabled={!!busy} onClick={() => act("reject")}>
              {busy === "reject" ? L("در حال رد…", "Rejecting…") : L("رد", "Reject")}
            </button>
          </div>
        ))}
      {error && <div className={s.error}>{error}</div>}
    </div>
  );
}

// Rules taught to the Topic Engine's prompts from Hamed's notes ("learn from this note").
function ContentRules() {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(() => api("/content-lessons").then(setD).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);
  const toggle = async (l) => {
    try {
      await api("/content-lessons", { method: "POST", body: { id: l.id, active: l.active === false } });
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <div dir={uiDir()} style={{ display: "contents" }}>
      <h2 className={s.h2} style={{ marginTop: 28 }}>{L("قانون‌های محتوا", "Content rules")}</h2>
      <p className={s.rule}>
        {L(
          `از یادداشت‌هایت در تاپیک انجین یاد گرفته شده (وقتی «از این یادداشت یاد بگیر» تیک خورده). هر قانون در همهٔ پرامپت‌های بعدی همان نوع محتوا می‌ره. خاموشش کنی، دیگه استفاده نمی‌شه. فایل اسکیل مربوط (.claude/skills/…) در جلسهٔ توسعهٔ بعدی از روی همین فهرست به‌روز می‌شه.`,
          `Learned from your notes in the Topic Engine (ticked “learn from this note”). Each rule goes into every later prompt of that kind of content. Switch one off and it stops being used. The matching skill file (.claude/skills/…) is updated from this list by the next development session.`
        )}
      </p>
      {error && <div className={s.error}>{error}</div>}
      {!d && !error && <p className={s.muted}>{L("در حال بارگذاری…", "Loading…")}</p>}
      {d && d.lessons.length === 0 && <p className={s.muted}>{L("هنوز قانونی نیست.", "No rules yet.")}</p>}
      {d &&
        d.lessons.map((l) => (
          <div key={l.id} className={s.card} style={{ opacity: l.active === false ? 0.55 : 1 }}>
            <div className={s.row}>
              <b className={s.grow}>{SCOPE_NAMES[l.scope] ? L(SCOPE_NAMES[l.scope]) : (d.scopes[l.scope] || {}).name || l.scope}</b>
              <span className={s.muted}>{when(l.at)}</span>
              <button className={s.linkBtn} onClick={() => toggle(l)}>
                {l.active === false ? L("دوباره استفاده کن", "Use again") : L("خاموش کن", "Switch off")}
              </button>
            </div>
            <div dir="rtl">
              <Mixed text={l.rule_fa || l.rule_en} />
            </div>
            <div className={s.muted} dir="ltr">{l.rule_en}</div>
            <div className={s.muted} dir="auto">
              {L("از یادداشت:", "From the note:")} “{l.note}”{l.topic ? ` · ${l.topic}` : ""}
            </div>
          </div>
        ))}
    </div>
  );
}

function Lessons({ user }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [all, setAll] = useState(false);
  const load = useCallback(
    () =>
      api("/lessons")
        .then((x) => {
          setD(x);
          setError("");
        })
        .catch((e) => setError(e.message)),
    []
  );
  useEffect(() => {
    if (user.role === "admin") load();
  }, [load, user.role]);
  const applying = d && d.lessons.some((l) => l.status === "applying");
  useEffect(() => {
    if (!applying) return;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [applying, load]);
  if (user.role !== "admin") return <p className={s.muted} dir={uiDir()}>{L("قوانین تدوین رو حامد تعیین می‌کنه.", "Hamed decides the editing rules.")}</p>;
  const waiting = d ? d.lessons.filter((l) => l.status === "proposed" || l.status === "applying") : [];
  const shown = d ? (all ? d.lessons : waiting) : [];
  return (
    <div dir={uiDir()} style={{ display: "contents" }}>
      <div className={s.row}>
        <h1 className={`${s.title} ${s.grow}`}>{L("درس‌ها", "Lessons")}</h1>
        {d && d.lessons.length > waiting.length && (
          <button className={s.linkBtn} onClick={() => setAll(!all)}>
            {all ? L("فقط منتظرها", "Only the ones waiting") : L(`نمایش همهٔ ${d.lessons.length} مورد`, `Show all ${d.lessons.length}`)}
          </button>
        )}
      </div>
      <p className={s.rule}>
        {L(
          "هر اصلاحیه روی یک برش بررسی می‌شه که کدوم قانون باید جلوش رو می‌گرفت. اگه مشکل از قانون بوده، تغییر اون قانون اینجا منتظر می‌مونه. تأییدش کنی، همون‌طور که نشون داده شده در قوانین تدوین نوشته می‌شه، برای همهٔ ویدیوهای بعد از این. ردش کنی، چیزی عوض نمی‌شه.",
          "Every correction on a cut is checked for the rule that should have caught it. When it was a rule problem, the change to that rule waits here. Approve it and it is written into the editing rules, as shown, for every video after this one. Reject it and nothing changes."
        )}
      </p>
      {error && <div className={s.error}>{error}</div>}
      {!d && !error && <p className={s.muted}>{L("در حال بارگذاری…", "Loading…")}</p>}
      {d && shown.length === 0 && <p className={s.muted}>{all ? L("هنوز درسی نیست.", "No lessons yet.") : L("چیزی منتظر نیست. درس‌ها بعد از ساخته شدن یک نسخه از روی اصلاحیه‌ها پیدا می‌شن.", "Nothing waiting. Lessons appear after a version is made from corrections.")}</p>}
      {shown.map((l) => (
        <Lesson key={l.id} l={l} reload={load} />
      ))}
      <ContentRules />
    </div>
  );
}

export default function Page() {
  return <Shell>{(user) => <Lessons user={user} />}</Shell>;
}
