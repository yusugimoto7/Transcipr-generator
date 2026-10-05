"use client";
import { useEffect, useRef, useState } from "react";

const C = {
  ground: "#16282f",
  ground2: "#1e343d",
  slate: "#32515d",
  cream: "#f2e5c0",
  orange: "#f17212",
  ink: "#22343b",
  inkSoft: "#5a6f78",
  line: "rgba(242,229,192,0.14)",
  ok: "#4caf7a",
  warn: "#e0a530",
  bad: "#e0564a",
};

const PROGRAMS = [
  { value: "fsw", label: "Federal Skilled Worker" },
  { value: "cec", label: "Canadian Experience Class" },
  { value: "fst", label: "Federal Skilled Trades" },
];

const STATUS = {
  present: [C.ok, "Present"],
  covered: [C.ok, "Covered"],
  partial: [C.warn, "Partial"],
  unclear: [C.warn, "Unclear"],
  unverified: [C.warn, "Unverified quote"],
  missing: [C.bad, "Missing"],
  absent: [C.bad, "Not shown"],
};
const SEV = { high: C.bad, medium: C.warn, low: C.inkSoft };

const card = { background: C.ground2, border: `1px solid ${C.line}`, borderRadius: 14, padding: 16, marginBottom: 14 };
const input = {
  width: "100%", boxSizing: "border-box", background: C.ground, color: C.cream, border: `1px solid ${C.slate}`,
  borderRadius: 10, padding: "10px 12px", fontSize: 15, fontFamily: "inherit",
};
const btn = (primary = true, disabled = false) => ({
  background: disabled ? C.slate : primary ? C.orange : "transparent", color: primary ? "#fff" : C.cream,
  border: primary ? "none" : `1px solid ${C.slate}`, borderRadius: 10, padding: "10px 16px", fontSize: 14,
  fontWeight: 600, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.6 : 1,
});
const h2 = { fontSize: 16, margin: "0 0 10px", color: C.cream };
const muted = { color: "rgba(242,229,192,0.6)", fontSize: 13 };

function Pill({ color, children }) {
  return (
    <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: color, color: "#fff", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Programs({ p }) {
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {p.fsw && <Pill color={C.slate}>FSW</Pill>}
      {p.cec && <Pill color={C.slate}>CEC</Pill>}
      {p.fst && <Pill color={C.slate}>FST</Pill>}
      {!p.fsw && !p.fst && <Pill color={C.bad}>Not eligible for Express Entry</Pill>}
    </span>
  );
}

async function api(path, body) {
  const res = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ------------------------------------------------------------------ search

function Search({ onPick, compact }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) return setResults([]);
    timer.current = setTimeout(async () => {
      try {
        setResults((await api(`/api/noc/search?q=${encodeURIComponent(q)}`)).results);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <div>
      <input
        style={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Job title or NOC code, e.g. backend engineer, accountant, 21231"
      />
      {results.length > 0 && (
        <div style={{ marginTop: 8, maxHeight: compact ? 260 : "none", overflowY: "auto" }}>
          {results.map((r) => (
            <button
              key={r.code}
              onClick={() => { onPick(r.code); setQ(""); setResults([]); }}
              style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderBottom: `1px solid ${C.line}`, color: C.cream, padding: "10px 4px", cursor: "pointer", fontFamily: "inherit" }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ color: C.orange }}>{r.code}</b>
                <span>{r.title}</span>
                <Pill color={r.teer <= 3 ? C.ok : C.inkSoft}>TEER {r.teer}</Pill>
                <Programs p={r.programs} />
              </div>
              {r.matched && <div style={muted}>matches “{r.matched.trim()}”</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Profile({ unit, teerLabel, onPick, onCheck }) {
  return (
    <div style={card}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: C.orange }}>{unit.code}</span>
        <span style={{ fontSize: 18, fontWeight: 600 }}>{unit.title}</span>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <Pill color={unit.teer <= 3 ? C.ok : C.inkSoft}>TEER {unit.teer}</Pill>
        <span style={muted}>{teerLabel}</span>
        <Programs p={unit.programs} />
      </div>
      <div style={muted}>{unit.broad} › {unit.major} › {unit.minor}</div>

      <h3 style={{ ...h2, marginTop: 16 }}>Lead statement</h3>
      <p style={{ margin: 0, lineHeight: 1.55 }}>{unit.lead}</p>

      <h3 style={{ ...h2, marginTop: 16 }}>Main duties</h3>
      {unit.duties.map((s, i) => (
        <div key={i}>
          {s.role && <div style={{ fontWeight: 700, color: C.orange, margin: "8px 0 4px" }}>{s.role}</div>}
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>{s.items.map((d, j) => <li key={j}>{d}</li>)}</ul>
        </div>
      ))}

      {unit.requirements.length > 0 && (
        <>
          <h3 style={{ ...h2, marginTop: 16 }}>Employment requirements</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>{unit.requirements.map((d, j) => <li key={j}>{d}</li>)}</ul>
        </>
      )}

      {unit.exclusions.length > 0 && (
        <>
          <h3 style={{ ...h2, marginTop: 16 }}>Belongs elsewhere (exclusions)</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
            {unit.exclusions.map((d, j) => {
              const m = d.match(/\b(\d{5})\b/);
              return (
                <li key={j}>
                  {m ? (
                    <a href="#" onClick={(e) => { e.preventDefault(); onPick(m[1]); }} style={{ color: C.cream }}>{d}</a>
                  ) : d}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <details style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer" }}>All {unit.examples.length} example job titles</summary>
        <p style={{ ...muted, lineHeight: 1.6 }}>{unit.examples.join(" · ")}</p>
      </details>

      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <button style={btn()} onClick={onCheck}>Check a letter against {unit.code}</button>
        <a href={unit.url} target="_blank" rel="noreferrer" style={{ ...btn(false), textDecoration: "none" }}>Official ESDC profile ↗</a>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ letter

function Analysis({ a, unit, program }) {
  const order = { high: 0, medium: 1, low: 2 };
  const concerns = [...a.concerns].sort((x, y) => (order[x.severity] ?? 3) - (order[y.severity] ?? 3));
  const pct = a.dutyScore.total ? Math.round((a.dutyScore.covered / a.dutyScore.total) * 100) : 0;
  return (
    <>
      <div style={card}>
        <h3 style={h2}>Verdict</h3>
        <p style={{ margin: 0, lineHeight: 1.55 }}>{a.verdict}</p>
        {a.language !== "en" && (
          <p style={{ color: C.warn, marginBottom: 0 }}>
            {a.language === "fr" ? "Letter is in French — accepted by IRCC." : "Letter is not in English or French — IRCC needs a certified translation plus the original."}
          </p>
        )}
      </div>

      <div style={card}>
        <h3 style={h2}>Lead statement and main duties</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <span>Lead statement:</span><Pill color={STATUS[a.lead.status]?.[0] || C.inkSoft}>{STATUS[a.lead.status]?.[1] || a.lead.status}</Pill>
          <span style={muted}>{a.lead.note}</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          Main duties shown: <b>{a.dutyScore.covered}</b> covered, <b>{a.dutyScore.partial}</b> partial, of {a.dutyScore.total} ({pct}%)
          {a.subRole && <span style={muted}> · judged as “{a.subRole}”</span>}
        </div>
        {a.duties.map((d) => (
          <div key={d.id} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Pill color={STATUS[d.status]?.[0] || C.inkSoft}>{STATUS[d.status]?.[1] || d.status}</Pill>
              <span style={{ lineHeight: 1.45 }}>{d.text}</span>
            </div>
            {d.quote && <div style={{ ...muted, marginTop: 4, marginLeft: 4 }}>Letter: “{d.quote}”</div>}
            {d.note && <div style={{ ...muted, marginTop: 2, marginLeft: 4 }}>{d.note}</div>}
          </div>
        ))}
      </div>

      {a.copied.length > 0 && (
        <div style={{ ...card, borderColor: C.bad }}>
          <h3 style={h2}>Lines copied from the NOC text ({a.copied.length})</h3>
          {a.copied.map((c, i) => (
            <div key={i} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0" }}>
              <div>“{c.line}”</div>
              <div style={muted}>{c.ratio}% overlap with: “{c.noc}”</div>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <h3 style={h2}>Required elements</h3>
        {a.elements.map((e) => (
          <div key={e.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "5px 0" }}>
            <Pill color={STATUS[e.status][0]}>{STATUS[e.status][1]}</Pill>
            <span>{e.label}{e.quote && <span style={muted}> — “{e.quote}”</span>}</span>
          </div>
        ))}
      </div>

      <div style={card}>
        <h3 style={h2}>Work hours ({PROGRAMS.find((p) => p.value === program)?.label})</h3>
        {a.hours.rows.length === 0 && <p style={muted}>No positions with dates found in the letter.</p>}
        {a.hours.rows.map((r, i) => (
          <div key={i} style={{ padding: "4px 0" }}>
            <b>{r.title || "Position"}</b>: {r.start || "?"} → {r.end || "?"}, {r.hoursPerWeek ?? "?"} h/week
            {r.credited != null ? <span> — {r.credited.toLocaleString()} creditable hours{r.clipped ? ` (only the last ${a.hours.years} years count)` : ""}</span> : <span style={{ color: C.warn }}> — can't compute (missing dates or hours)</span>}
          </div>
        ))}
        {a.hours.rows.length > 0 && (
          <p style={{ marginBottom: 0, color: a.hours.meets ? C.ok : C.warn }}>
            Total {a.hours.total.toLocaleString()} of {a.hours.need.toLocaleString()} hours needed
            {a.hours.complete ? "" : " (incomplete — some positions could not be counted)"}. Hours above 30/week don't count. This is
            an estimate from the letter alone — it doesn't know about study periods, unpaid leave or work without authorization.
          </p>
        )}
      </div>

      {a.otherCodes.length > 0 && (
        <div style={{ ...card, borderColor: C.warn }}>
          <h3 style={h2}>The duties may fit another NOC better</h3>
          {a.otherCodes.map((o) => (
            <div key={o.code} style={{ padding: "4px 0" }}>
              <b style={{ color: C.orange }}>{o.code}</b> {o.title} (TEER {o.teer}) — <span style={muted}>{o.reason}</span>
            </div>
          ))}
        </div>
      )}

      <div style={card}>
        <h3 style={h2}>What an officer would question ({concerns.length})</h3>
        {concerns.length === 0 && <p style={muted}>Nothing flagged.</p>}
        {concerns.map((c, i) => (
          <div key={i} style={{ borderTop: `1px solid ${C.line}`, padding: "10px 0" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Pill color={SEV[c.severity] || C.inkSoft}>{(c.severity || "").toUpperCase()}</Pill>
              <b>{c.issue}</b>
            </div>
            <div style={{ marginTop: 4, lineHeight: 1.5 }}>{c.detail}</div>
            <div style={{ marginTop: 4, color: C.ok, lineHeight: 1.5 }}>Fix: {c.fix}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function Revised({ r }) {
  const [copied, setCopied] = useState(false);
  const warnings = [];
  if (r.unsupported.length) warnings.push(`${r.unsupported.length} duty line(s) cite a source that is not in your letter or answers — remove them or confirm them with the employer.`);
  if (r.untraced.length) warnings.push(`${r.untraced.length} duty line(s) have no source at all.`);
  if (r.newNumbers.length) warnings.push(`Numbers not in your inputs: ${r.newNumbers.join(", ")}. Check every date, hour and salary figure.`);
  if (r.copied.length) warnings.push(`${r.copied.length} line(s) still read like the NOC text.`);
  const download = () => {
    const url = URL.createObjectURL(new Blob([r.letter], { type: "text/plain" }));
    Object.assign(document.createElement("a"), { href: url, download: "revised-employment-letter.txt" }).click();
    URL.revokeObjectURL(url);
  };
  const flagged = new Set([...r.unsupported.map((t) => t.duty), ...r.untraced]);
  return (
    <>
      {warnings.length > 0 && (
        <div style={{ ...card, borderColor: C.bad }}>
          <h3 style={h2}>Check before using</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          {flagged.size > 0 && <ul style={{ ...muted, paddingLeft: 20 }}>{[...flagged].map((f, i) => <li key={i}>{f}</li>)}</ul>}
        </div>
      )}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ ...h2, margin: 0 }}>Revised letter (draft for the employer)</h3>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btn(false)} onClick={() => { navigator.clipboard.writeText(r.letter); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</button>
            <button style={btn(false)} onClick={download}>Download .txt</button>
          </div>
        </div>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.55, background: C.cream, color: C.ink, padding: 16, borderRadius: 10, marginTop: 12 }}>{r.letter}</pre>
        {r.placeholders.length > 0 && <p style={{ color: C.warn }}>Fill in before sending: {r.placeholders.join(" · ")}</p>}
      </div>
      {r.notAdded.length > 0 && (
        <div style={card}>
          <h3 style={h2}>NOC duties not added (no supporting facts)</h3>
          <p style={muted}>If the applicant really performed any of these, add the specifics to the answers box and generate again. Otherwise leave them out.</p>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>{r.notAdded.map((n, i) => <li key={i}>{n.text || n.id} <span style={muted}>— {n.reason}</span></li>)}</ul>
        </div>
      )}
      {r.changes.length > 0 && (
        <div style={card}>
          <h3 style={h2}>What changed</h3>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.55 }}>{r.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
    </>
  );
}

function LetterCheck({ unit, onChangeCode }) {
  const [program, setProgram] = useState("fsw");
  const [letter, setLetter] = useState("");
  const [answers, setAnswers] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [revised, setRevised] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [transcribed, setTranscribed] = useState(false);

  useEffect(() => { setAnalysis(null); setRevised(null); }, [unit?.code, program]);

  const upload = async (file) => {
    if (!file) return;
    setError("");
    setBusy("Reading the file…");
    try {
      const dataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
      const { text } = await api("/api/noc/transcribe", { name: file.name, type: file.type, dataUrl });
      setLetter(text);
      setTranscribed(true);
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };

  const analyze = async () => {
    setError(""); setRevised(null); setBusy("Reviewing the letter…");
    try {
      const { result } = await api("/api/noc/letter", { mode: "analyze", letter, code: unit.code, program });
      setAnalysis(result);
      if (!answers.trim() && result.questions.length) setAnswers(result.questions.map((q) => `Q: ${q}\nA: `).join("\n\n"));
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };

  const rewrite = async () => {
    setError(""); setBusy("Drafting the revised letter…");
    try {
      const { result } = await api("/api/noc/letter", { mode: "rewrite", letter, code: unit.code, program, analysis, answers });
      setRevised(result);
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
  };

  const eligible = unit && (program === "fst" ? unit.programs.fst : unit.programs.fsw);

  return (
    <>
      <div style={card}>
        <h3 style={h2}>1. Occupation and program</h3>
        {unit ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            <b style={{ color: C.orange }}>{unit.code}</b> {unit.title} <Pill color={unit.teer <= 3 ? C.ok : C.inkSoft}>TEER {unit.teer}</Pill>
          </div>
        ) : <p style={muted}>Pick the NOC code you plan to claim.</p>}
        <Search compact onPick={onChangeCode} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {PROGRAMS.map((p) => (
            <button key={p.value} style={btn(program === p.value)} onClick={() => setProgram(p.value)}>{p.label}</button>
          ))}
        </div>
        {unit && !eligible && (
          <p style={{ color: C.bad, marginBottom: 0 }}>
            {unit.code} is not eligible for {PROGRAMS.find((p) => p.value === program).label}
            {program === "fst" ? " (not a listed skilled trade)." : ` (TEER ${unit.teer}; only TEER 0–3 count).`}
          </p>
        )}
      </div>

      <div style={card}>
        <h3 style={h2}>2. The employment letter</h3>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <label style={{ ...btn(false), display: "inline-block" }}>
            Upload PDF or photo
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          <span style={muted}>or paste the text below</span>
        </div>
        {transcribed && <p style={{ color: C.warn, marginTop: 0 }}>Transcribed from your file — check names, dates, hours and salary against the original before reviewing.</p>}
        <textarea style={{ ...input, minHeight: 260, lineHeight: 1.5 }} value={letter} onChange={(e) => { setLetter(e.target.value); setTranscribed(false); }} placeholder="Paste the full letter, including the letterhead and signature block." />
        <div style={{ marginTop: 10 }}>
          <button style={btn(true, !unit || !eligible || !letter.trim() || !!busy)} disabled={!unit || !eligible || !letter.trim() || !!busy} onClick={analyze}>Review letter</button>
        </div>
      </div>

      {busy && <div style={{ ...card, color: C.orange }}>{busy}</div>}
      {error && <div style={{ ...card, borderColor: C.bad, color: C.bad }}>{error}</div>}

      {analysis && <Analysis a={analysis} unit={unit} program={program} />}

      {analysis && (
        <div style={card}>
          <h3 style={h2}>3. Facts from the applicant or employer</h3>
          <p style={muted}>
            Answer only with what is true and the employer will sign. The revised letter is built from the original letter plus
            these answers — nothing else. Anything left blank becomes a [CONFIRM] placeholder.
          </p>
          <textarea style={{ ...input, minHeight: 180, lineHeight: 1.5 }} value={answers} onChange={(e) => setAnswers(e.target.value)} />
          <div style={{ marginTop: 10 }}>
            <button style={btn(true, !!busy)} disabled={!!busy} onClick={rewrite}>Draft revised letter</button>
          </div>
        </div>
      )}

      {revised && <Revised r={revised} />}
    </>
  );
}

// -------------------------------------------------------------------- page

export default function NocPage() {
  const [tab, setTab] = useState("find");
  const [code, setCode] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!code) return;
    api(`/api/noc/search?code=${code}`).then(setProfile).catch(() => setProfile(null));
  }, [code]);

  return (
    <div style={{ minHeight: "100vh", background: C.ground, color: C.cream, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>NOC & Employment Letter Check</h1>
          <span style={muted}>NOC 2021 Version 1.0 · Statistics Canada</span>
        </div>
        <p style={{ ...muted, lineHeight: 1.5 }}>
          Find the right NOC code and TEER, then check an employment letter the way an IRCC officer reads it. The revised draft only
          reorganizes and clarifies facts that are already true — it never adds duties. Claiming work that wasn't done is
          misrepresentation (IRPA s.40): a refusal and a five-year ban. Have a licensed consultant or lawyer review before filing.
        </p>

        <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
          <button style={btn(tab === "find")} onClick={() => setTab("find")}>Find NOC</button>
          <button style={btn(tab === "letter")} onClick={() => setTab("letter")}>Check letter</button>
        </div>

        {tab === "find" && (
          <>
            <div style={card}><Search onPick={setCode} /></div>
            {profile?.unit && (
              <Profile unit={profile.unit} teerLabel={profile.teerLabel} onPick={setCode} onCheck={() => setTab("letter")} />
            )}
          </>
        )}
        {tab === "letter" && <LetterCheck unit={profile?.unit || null} onChangeCode={setCode} />}
      </div>
    </div>
  );
}
