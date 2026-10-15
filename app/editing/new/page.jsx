"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, s, Shell } from "../ui";

function NewProject() {
  const router = useRouter();
  const [f, setF] = useState({ title: "", source_url: "", kind: "reel", language: "fa", topic: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
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
    <form className={s.card} onSubmit={submit} style={{ maxWidth: 640 }}>
      <h1 className={s.title}>New project</h1>
      <p className={s.muted}>
        The editing machine removes pauses, false starts and retakes only. You review the result before anything is approved.
      </p>
      <label className={s.field}>
        <span>Title</span>
        <input id="title" className={s.input} value={f.title} onChange={set("title")} placeholder="Inland vs overseas sponsorship" required />
      </label>
      <label className={s.field}>
        <span>Google Drive link to the raw video</span>
        <input id="source_url" className={s.input} value={f.source_url} onChange={set("source_url")} placeholder="https://drive.google.com/file/d/…/view" required />
        <small className={s.muted}>In Drive, set sharing to “Anyone with the link”. Up to 20 minutes of footage.</small>
      </label>
      <div className={s.row}>
        <label className={`${s.field} ${s.grow}`}>
          <span>Kind</span>
          <select id="kind" className={s.select} value={f.kind} onChange={set("kind")}>
            <option value="reel">Reel 9:16</option>
            <option value="youtube">YouTube 16:9</option>
            <option value="course">Course lesson</option>
          </select>
        </label>
        <label className={`${s.field} ${s.grow}`}>
          <span>Spoken language</span>
          <select id="language" className={s.select} value={f.language} onChange={set("language")}>
            <option value="fa">Farsi</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
      <label className={s.field}>
        <span>Topic (optional)</span>
        <input id="topic" className={s.input} value={f.topic} onChange={set("topic")} placeholder="The topic this video is about" />
      </label>
      <label className={s.row} style={{ fontSize: 14 }}>
        <input id="subs" type="checkbox" disabled /> <span className={s.muted}>Farsi subtitles: coming in the next phase</span>
      </label>
      {error && <div className={s.error}>{error}</div>}
      <div className={s.row}>
        <button className={`${s.btn} ${s.primary}`} disabled={busy}>
          {busy ? "Checking the link…" : "Start editing"}
        </button>
      </div>
    </form>
  );
}

export default function Page() {
  return <Shell>{() => <NewProject />}</Shell>;
}
