"use client";

import "./editor.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, s, Shell } from "../../../ui";
import { L, getLang } from "../../../../../lib/i18n";
import { mountEditor } from "./editor";

// The hand editor opens on the project's latest cut version while it waits for review; whatever is
// made here comes back as the next version, reviewed and approved like every other one.
//
// It opens on the whole original footage with the automatic cut laid out as clips (Hamed, 4 Nov 2026:
// "like CapCut or Premiere: when something was cut too much, I drag the clip's edge back"). The original
// plays from a light copy the worker makes; while a project that was cut before the copy existed waits
// for it, the version itself can still be edited the old way.
const POLL_MS = 15000;

export default function Page({ params }) {
  const host = useRef(null);
  const [state, setState] = useState({ phase: "loading" });
  const ctx = useRef({});

  function open(mode) {
    const { d, run, base } = ctx.current;
    if (ctx.current.destroy) return;
    setState({ phase: "ready" });
    const source = mode === "source";
    ctx.current.destroy = mountEditor(host.current, {
      src: `/api/editing/projects/${params.id}/media?run=${source ? "source" : run.id}`,
      strip: `/api/editing/projects/${params.id}/filmstrip?run=${source ? "source" : run.id}`,
      basis: source ? "source" : undefined,
      initial: source ? base.pieces : undefined,
      title: `${d.project.title} · ${L(`نسخهٔ ${run.version}`, `version ${run.version}`)}`,
      version: run.version,
      t: L,
      rtl: getLang() === "fa",
      onClose: () => (window.location.href = `/editing/p/${params.id}`),
      onSave: async (cut) => {
        await api(`/projects/${params.id}/edit`, { method: "POST", body: { run_id: run.id, ...cut } });
        window.location.href = `/editing/p/${params.id}`;
      },
    });
  }

  useEffect(() => {
    let gone = false, timer = null, asked = false;
    const check = async () => {
      const { run } = ctx.current;
      const base = await api(`/projects/${params.id}/edit?run=${run.id}`);
      if (gone) return;
      ctx.current.base = base;
      // a version with no cut map (made before the map was kept) can only be edited on itself
      if (base.ready && base.pieces.length) return open("source");
      if (!base.pieces.length) return open("version");
      if (base.error && asked) return setState({ phase: "waiting", error: base.error });
      if (!asked) {
        asked = true;
        await api(`/projects/${params.id}/edit`, { method: "POST", body: { action: "source" } }).catch((e) => !gone && setState({ phase: "waiting", error: e.message }));
      }
      if (!gone) {
        setState((x) => (x.error ? x : { phase: "waiting" }));
        timer = setTimeout(() => check().catch((e) => !gone && setState({ phase: "waiting", error: e.message })), POLL_MS);
      }
    };
    api(`/projects/${params.id}`)
      .then((d) => {
        if (gone) return;
        const run = d.runs.find((r) => r.id === d.project.latest_run_id);
        const ok = run && (run.stage || "cut") === "cut" && run.status === "review" && run.result && run.result.preview;
        if (!ok) return setState({ phase: "closed" });
        ctx.current = { d, run };
        return check();
      })
      .catch((e) => !gone && setState({ phase: "error", error: e.message }));
    return () => {
      gone = true;
      clearTimeout(timer);
      if (ctx.current.destroy) ctx.current.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const retry = () => {
    setState({ phase: "waiting" });
    api(`/projects/${params.id}/edit`, { method: "POST", body: { action: "source" } })
      .then(() => window.location.reload())
      .catch((e) => setState({ phase: "waiting", error: e.message }));
  };

  return (
    <>
      <div ref={host} />
      {state.phase !== "ready" && (
        <Shell>
          <div className={s.card}>
            {state.phase === "loading" && <p className={s.muted}>{L("در حال باز کردن…", "Opening…")}</p>}
            {state.phase === "waiting" && (
              <>
                <h3 style={{ marginTop: 0 }}>{L("آماده کردن فیلم اصلی برای ویرایشگر", "Preparing the original footage for the editor")}</h3>
                {!state.error ? (
                  <p className={s.muted}>
                    {L(
                      "ویرایشگر روی کل فیلم اصلی باز می‌شه و تکه‌ها همون برش اتوماتیک‌اند، تا هر جا زیادی بریده شده با کشیدن لبهٔ تکه برش گردونی. برای این پروژه یک نسخهٔ سبک از فیلم اصلی ساخته می‌شه؛ معمولاً ۳ تا ۸ دقیقه طول می‌کشه و این صفحه خودش باز می‌شه.",
                      "The editor opens on the whole original footage with the automatic cut as clips, so wherever too much was cut you drag the clip's edge back. A light copy of the original is being made for this project; it usually takes 3 to 8 minutes, and this page opens by itself."
                    )}
                  </p>
                ) : (
                  <>
                    <div className={s.error}>{L("نسخهٔ سبک فیلم اصلی ساخته نشد: ", "The light copy of the original was not made: ") + state.error}</div>
                    <p>
                      <button className={s.btn} onClick={retry}>{L("دوباره امتحان کن", "Try again")}</button>
                    </p>
                  </>
                )}
                <p className={s.muted}>{L("تا اون موقع می‌تونی فقط روی همین نسخه کار کنی (بدون چیزهایی که برش حذف کرده).", "Meanwhile you can edit this version only (without what the cut removed).")}</p>
                <p>
                  <button className={s.btn} onClick={() => open("version")}>{L("ویرایش فقط روی همین نسخه", "Edit this version only")}</button>
                </p>
              </>
            )}
            {state.phase === "closed" && (
              <p>{L("ویرایشگر روی نسخهٔ برشی باز می‌شه که منتظر بازبینیه. این پروژه الان چنین نسخه‌ای نداره.", "The editor opens on a cut version that is waiting for review. This project has none right now.")}</p>
            )}
            {state.phase === "error" && <div className={s.error}>{state.error}</div>}
            <Link href={`/editing/p/${params.id}`}>{L("برگشت به پروژه", "Back to the project")}</Link>
          </div>
        </Shell>
      )}
    </>
  );
}
