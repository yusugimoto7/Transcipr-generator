"use client";

import { useCallback, useEffect, useState } from "react";

const KEY_STORAGE = "draws_key";

const CHIP = {
  on: { bg: "#DFF0E7", fg: "#1C6B4C", label: "Ready" },
  off: { bg: "#ECEAE7", fg: "#7B848D", label: "Not set" },
  warn: { bg: "#FAEBD3", fg: "#96601A", label: "Check" },
};

function Chip({ state }) {
  const c = CHIP[state] || CHIP.off;
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.09em",
        textTransform: "uppercase",
        padding: "4px 9px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        fontFamily: "ui-monospace, Menlo, monospace",
      }}
    >
      {c.label}
    </span>
  );
}

function Row({ label, sub, state }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        padding: "13px 16px",
        borderBottom: "1px solid var(--rule)",
      }}
    >
      <div>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{label}</div>
        {sub ? (
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
        ) : null}
      </div>
      <Chip state={state} />
    </div>
  );
}

export default function Page() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [output, setOutput] = useState(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY_STORAGE);
    if (saved) setKey(saved);
  }, []);

  const load = useCallback(
    async (k) => {
      const useKey = k ?? key;
      setError("");
      setBusy("status");
      try {
        const res = await fetch(
          `/api/draws/status${useKey ? `?key=${encodeURIComponent(useKey)}` : ""}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        setStatus(data);
        if (useKey) window.localStorage.setItem(KEY_STORAGE, useKey);
      } catch (e) {
        setStatus(null);
        setError(String(e.message || e));
      } finally {
        setBusy("");
      }
    },
    [key]
  );

  useEffect(() => {
    load(window.localStorage.getItem(KEY_STORAGE) || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function call(path, label) {
    setBusy(label);
    setOutput(null);
    setError("");
    try {
      const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}`);
      const data = await res.json();
      setOutput(data);
      if (!res.ok) setError(data?.error || `HTTP ${res.status}`);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy("");
      load();
    }
  }

  const ch = (name) => status?.channels?.find((c) => c.name === name);
  const chState = (name) => (ch(name)?.ready ? "on" : "off");
  const last = status?.scheduler?.lastRun;

  return (
    <>
      <style>{`
        :root {
          --ink:#1B2733; --muted:#6E7A85; --rule:#E6E1DB; --surface:#FBF8F5;
          --card:#FFFFFF; --accent:#C9561F; --accent-dim:#F5E4DA;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --ink:#F0EBE5; --muted:#939BA3; --rule:#2F383F; --surface:#13181D;
            --card:#1A2127; --accent:#F0834B; --accent-dim:#38231A;
          }
        }
        * { box-sizing: border-box; }
        body {
          margin:0; background:var(--surface); color:var(--ink);
          font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
          line-height:1.55; -webkit-font-smoothing:antialiased;
        }
        .wrap { max-width:640px; margin:0 auto; padding:32px 18px 72px; }
        h1 { font-size:24px; letter-spacing:-0.02em; margin:0 0 4px; }
        .sub { color:var(--muted); font-size:14px; margin:0 0 24px; }
        .card { background:var(--card); border:1px solid var(--rule); border-radius:12px; overflow:hidden; margin-bottom:16px; }
        .card > div:last-child { border-bottom:none; }
        .hd { font-family:ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:0.11em;
              text-transform:uppercase; color:var(--muted); padding:13px 16px; border-bottom:1px solid var(--rule); }
        input {
          width:100%; padding:11px 13px; border:1px solid var(--rule); border-radius:9px;
          background:var(--card); color:var(--ink); font-size:15px;
          font-family:ui-monospace,Menlo,monospace;
        }
        input:focus { outline:2px solid var(--accent); outline-offset:1px; }
        .btns { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; }
        button {
          font:inherit; font-size:14px; font-weight:600; padding:9px 15px; border-radius:9px;
          border:1px solid var(--rule); background:var(--card); color:var(--ink); cursor:pointer;
        }
        button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
        button:disabled { opacity:.5; cursor:default; }
        button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
        a { color:var(--accent); }
        pre {
          background:var(--card); border:1px solid var(--rule); border-radius:10px;
          padding:13px; overflow-x:auto; font-size:12px; line-height:1.5;
          font-family:ui-monospace,Menlo,monospace; max-height:340px;
        }
        .err { background:var(--accent-dim); color:var(--accent); border-radius:9px;
               padding:11px 13px; font-size:14px; margin-bottom:16px; }
        .note { font-size:13px; color:var(--muted); padding:12px 16px; }
      `}</style>

      <div className="wrap">
        <h1>Sugimoto Draws</h1>
        <p className="sub">
          Watches Express Entry, BC PNP, OINP and Alberta AAIP, and publishes every new draw.
        </p>

        {error ? <div className="err">{error}</div> : null}

        <div className="card">
          <div className="hd">Access key</div>
          <div style={{ padding: 16 }}>
            <input
              type="password"
              value={key}
              placeholder="DRAWS_CRON_SECRET"
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              aria-label="Access key"
            />
            <div className="btns">
              <button className="primary" onClick={() => load()} disabled={busy === "status"}>
                {busy === "status" ? "Checking…" : "Check status"}
              </button>
            </div>
          </div>
        </div>

        {status ? (
          <>
            <div className="card">
              <div className="hd">{status.summary}</div>
              <Row label="Telegram" sub="Persian draw posts" state={chState("telegram")} />
              <Row label="Instagram story" sub="draw card" state={chState("instagram")} />
              <Row label="X" state={chState("x")} />
              <Row label="LinkedIn" state={chState("linkedin")} />
              <Row
                label="Website draws page"
                sub="sugimotovisa.com"
                state={status.wordpress?.ready ? "on" : "off"}
              />
              <Row
                label="Duplicate guard"
                sub={status.dedup?.ready ? "Google Sheet" : "restart-only memory"}
                state={status.dedup?.ready ? "on" : "warn"}
              />
              <Row
                label="Scheduler"
                sub={
                  status.scheduler?.armed
                    ? `every ${status.scheduler.intervalMinutes} min`
                    : "not running"
                }
                state={status.scheduler?.armed ? "on" : "off"}
              />
            </div>

            {last ? (
              <div className="card">
                <div className="hd">Last run</div>
                <div className="note">
                  {new Date(last.finishedAt || last.startedAt).toLocaleString()} — found{" "}
                  {last.found ?? "?"}, posted {last.published ?? 0}
                  {last.sourceErrors ? `, ${last.sourceErrors} source error(s)` : ""}
                  {last.error ? ` — ${last.error}` : ""}
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="hd">Actions</div>
              <div style={{ padding: 16 }}>
                <div className="btns">
                  <button onClick={() => call("/api/draws/preview", "preview")} disabled={!!busy}>
                    {busy === "preview" ? "Loading…" : "Preview (sends nothing)"}
                  </button>
                  <button onClick={() => call("/api/draws/run?dry=1", "dry")} disabled={!!busy}>
                    {busy === "dry" ? "Running…" : "Dry run"}
                  </button>
                  <button className="primary" onClick={() => call("/api/draws/run", "run")} disabled={!!busy}>
                    {busy === "run" ? "Posting…" : "Run now"}
                  </button>
                </div>
                <div className="btns">
                  <a href={`/api/draws/story?key=${encodeURIComponent(key)}`} target="_blank" rel="noreferrer">
                    View story card ↗
                  </a>
                </div>
              </div>
            </div>

            {status.nextSteps?.length ? (
              <div className="card">
                <div className="hd">Next</div>
                <ul style={{ margin: 0, padding: "12px 16px 14px 32px", fontSize: 14 }}>
                  {status.nextSteps.map((s, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}

        {output ? (
          <>
            <div className="hd" style={{ padding: "0 0 8px" }}>Result</div>
            <pre>{JSON.stringify(output, null, 2)}</pre>
          </>
        ) : null}
      </div>
    </>
  );
}
