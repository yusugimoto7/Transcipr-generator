"use client";

import "./editor.css";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, s, Shell } from "../../../ui";
import { L, getLang } from "../../../../../lib/i18n";
import { mountEditor } from "./editor";

// The hand editor opens on the project's latest cut version while it waits for review; whatever is
// made here comes back as the next version, reviewed and approved like every other one.
export default function Page({ params }) {
  const host = useRef(null);
  const [state, setState] = useState({ phase: "loading" });

  useEffect(() => {
    let destroy = null, gone = false;
    api(`/projects/${params.id}`)
      .then((d) => {
        if (gone) return;
        const run = d.runs.find((r) => r.id === d.project.latest_run_id);
        const ok = run && (run.stage || "cut") === "cut" && run.status === "review" && run.result && run.result.preview;
        if (!ok) return setState({ phase: "closed" });
        setState({ phase: "ready" });
        destroy = mountEditor(host.current, {
          src: `/api/editing/projects/${params.id}/media?run=${run.id}`,
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
      })
      .catch((e) => !gone && setState({ phase: "error", error: e.message }));
    return () => {
      gone = true;
      if (destroy) destroy();
    };
  }, [params.id]);

  return (
    <>
      <div ref={host} />
      {state.phase !== "ready" && (
        <Shell>
          <div className={s.card}>
            {state.phase === "loading" && <p className={s.muted}>{L("در حال باز کردن…", "Opening…")}</p>}
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
