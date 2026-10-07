"use client";
import { useState, useRef, useEffect } from "react";

// Light, minimal theme shared with the Topic Engine (app/globals.css).
// Keys kept from the original dark theme so every use site still reads the
// same role: cream = main text, creamEdge = secondary text, ground2 = panels.
const C = {
  ground: "#f6f7f9",
  ground2: "#ffffff",
  slate: "#c3c9d2",      // inactive dots, disabled and "done" buttons
  cream: "#121a24",      // main text
  creamEdge: "#5b6675",  // secondary text
  orange: "#f26a12",
  orangeDeep: "#d9560a",
  ink: "#ffffff",        // text on orange / gray buttons
  inkSoft: "#8b95a3",
  line: "#e6e8ec",
};

const LIB_KEY = "sugimoto_library_v1";

function dedupeLibrary(items) {
  const seen = new Set();
  return items.filter((it) => {
    const key = it.id || JSON.stringify(it);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadLibraryLocal() {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLibraryLocal(items) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(items));
  } catch {}
}

async function pushLibraryRemote(items) {
  try {
    await fetch("/api/library/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
  } catch {}
}

const COUNTRIES = [
  { label: "Canada", value: "canada", flag: "🇨🇦" },
  { label: "Finland", value: "finland", flag: "🇫🇮" },
  { label: "Germany", value: "germany", flag: "🇩🇪" },
  { label: "Netherlands", value: "netherlands", flag: "🇳🇱" },
  { label: "Spain", value: "spain", flag: "🇪🇸" },
  { label: "France", value: "france", flag: "🇫🇷" },
];

const FIELDS_BY_COUNTRY = {
  canada: [
    { label: "Express Entry", value: "Express Entry" },
    { label: "PNP", value: "PNP" },
    { label: "Startup Visa", value: "Startup Visa" },
    { label: "Work Permit", value: "ورک پرمیت" },
    { label: "Study", value: "تحصیل" },
    { label: "Family Immigration", value: "مهاجرت خانوادگی" },
    { label: "Permanent Residence", value: "اقامت دائم" },
    { label: "Policy & News", value: "سیاست‌گذاری" },
    { label: "Immigration News", value: "خبرهای مهاجرتی" },
    { label: "General", value: "عمومی" },
  ],
  europe: [
    { label: "Study", value: "تحصیل" },
    { label: "Work Permit", value: "ورک پرمیت" },
    { label: "Startup Visa", value: "Startup Visa" },
    { label: "Family Immigration", value: "مهاجرت خانوادگی" },
    { label: "Policy & News", value: "سیاست‌گذاری" },
    { label: "Immigration News", value: "خبرهای مهاجرتی" },
    { label: "General", value: "عمومی" },
  ],
};

const EUROPE_COUNTRIES = ["finland", "germany", "netherlands", "spain", "france"];

const CONTENT_APPROACHES = [
  { label: "Analytical", value: "analytical", desc: "Single country deep-dive" },
  { label: "Comparison", value: "comparison", desc: "Two-country side-by-side" },
];

const COMPARISON_DIMENSIONS = [
  { label: "Requirements", value: "Requirements" },
  { label: "Processing Time", value: "Processing Time" },
  { label: "Cost", value: "Cost" },
  { label: "Language", value: "Language Requirements" },
  { label: "PR Pathway", value: "PR Pathway" },
  { label: "Family Options", value: "Family Options" },
  { label: "Work Rights", value: "Work Rights" },
  { label: "Startup/Business", value: "Startup/Business" },
];

const TONES = [
  { label: "Educational & Formal", value: "آموزشی و رسمی" },
  { label: "Friendly & Simple", value: "صمیمی و ساده" },
  { label: "Urgent & Newsworthy", value: "فوری و خبری" },
  { label: "Analytical & In-depth", value: "تحلیلی و عمیق" },
  { label: "Motivational", value: "انگیزشی" },
];

const FORMATS = [
  { label: "Carousel", value: "carousel" },
  { label: "Infographic", value: "infographic" },
  { label: "Reel Script", value: "reel" },
  { label: "Article", value: "article" },
  { label: "Telegram Post", value: "telegram" },
  { label: "Video Script", value: "video_script", stub: true },
  { label: "Story Script", value: "story_script", stub: true },
];

const SLIDE_COUNTS = [5, 7, 10, 12];

const LANGUAGES = [
  { label: "🇮🇷 Persian", value: "persian" },
  { label: "🇬🇧 English", value: "english" },
];

function fieldsForCountry(country) {
  if (!country) return FIELDS_BY_COUNTRY.canada;
  return EUROPE_COUNTRIES.includes(country) ? FIELDS_BY_COUNTRY.europe : FIELDS_BY_COUNTRY.canada;
}

// ── shared primitives ──────────────────────────────────────────────────────────

function StepDots({ step }) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "center", margin: "0 0 28px" }}>
      {[1, 2, 3, 4].map((n) => (
        <div
          key={n}
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: n === step ? C.orange : n < step ? C.creamEdge : C.slate,
            opacity: n > step ? 0.35 : 1,
            transition: "background 0.25s",
          }}
        />
      ))}
    </div>
  );
}

function PillSelect({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: `1.5px solid ${active ? C.orange : C.line}`,
              background: active ? C.orange : "transparent",
              color: active ? C.ink : C.cream,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.18s",
            }}
          >
            {opt.flag ? `${opt.flag} ${opt.label}` : opt.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiPillSelect({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map((opt) => {
        const active = Array.isArray(value) && value.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => {
              const next = active
                ? value.filter((v) => v !== opt.value)
                : [...(value || []), opt.value];
              onChange(next);
            }}
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              border: `1.5px solid ${active ? C.orange : C.line}`,
              background: active ? C.orange : "transparent",
              color: active ? C.ink : C.cream,
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.18s",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <div
      style={{
        color: C.creamEdge,
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 8,
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "48px 0", color: C.creamEdge, fontSize: 14 }}>
      <div
        style={{
          display: "inline-block",
          width: 32,
          height: 32,
          border: `3px solid ${C.slate}`,
          borderTop: `3px solid ${C.orange}`,
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          marginBottom: 16,
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div>Generating content…</div>
    </div>
  );
}

// ── Step 1: Setup ──────────────────────────────────────────────────────────────

function SetupStep({ settings, onChange, onNext, loading, error }) {
  const fields = fieldsForCountry(settings.country);
  const isComparison = settings.contentApproach === "comparison";
  const country2Options = COUNTRIES.filter((c) => c.value !== settings.country);
  const selectedFormat = FORMATS.find((f) => f.value === settings.format);
  const isStubFormat = selectedFormat?.stub || false;
  const ready =
    settings.country &&
    settings.format &&
    !isStubFormat &&
    (!isComparison || settings.country2);
  const country2Ref = useRef(null);

  useEffect(() => {
    if (isComparison && country2Ref.current) {
      country2Ref.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [isComparison]);

  return (
    <div>
      <h2 style={{ color: C.cream, fontSize: 20, fontWeight: 700, marginBottom: 24 }}>
        Content Setup
      </h2>

      <Section label="CONTENT APPROACH">
        <div style={{ display: "flex", gap: 10 }}>
          {CONTENT_APPROACHES.map((opt) => {
            const active = settings.contentApproach === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => onChange("contentApproach", opt.value)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1.5px solid ${active ? C.orange : C.line}`,
                  background: active ? "rgba(242,106,18,0.08)" : "transparent",
                  color: active ? C.orange : C.cream,
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                  transition: "all 0.18s",
                }}
              >
                <div style={{ fontWeight: 600 }}>{opt.label}</div>
                <div style={{ fontSize: 11, color: active ? C.orange : C.inkSoft, marginTop: 2 }}>
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="COUNTRY">
        <PillSelect options={COUNTRIES} value={settings.country} onChange={(v) => onChange("country", v)} />
      </Section>

      {isComparison && (
        <div
          ref={country2Ref}
          style={{
            marginBottom: 22,
            padding: "12px 14px",
            borderRadius: 10,
            border: `1.5px solid ${C.orange}`,
            background: "rgba(242,106,18,0.06)",
          }}
        >
          <FieldLabel>SECOND COUNTRY (Comparison) ✱</FieldLabel>
          <PillSelect
            options={country2Options}
            value={settings.country2}
            onChange={(v) => onChange("country2", v)}
          />
        </div>
      )}

      <Section label="TOPIC AREA">
        <PillSelect options={fields} value={settings.field} onChange={(v) => onChange("field", v)} />
      </Section>

      {isComparison && (
        <Section label="COMPARISON DIMENSIONS (optional)">
          <MultiPillSelect
            options={COMPARISON_DIMENSIONS}
            value={settings.comparisonDimensions}
            onChange={(v) => onChange("comparisonDimensions", v)}
          />
        </Section>
      )}

      <Section label="TONE">
        <PillSelect options={TONES} value={settings.tone} onChange={(v) => onChange("tone", v)} />
      </Section>

      <Section label="FORMAT">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {FORMATS.map((opt) => {
            const active = settings.format === opt.value;
            if (opt.stub) {
              return (
                <div
                  key={opt.value}
                  style={{ position: "relative", display: "inline-block" }}
                  title="Coming soon"
                >
                  <button
                    disabled
                    style={{
                      padding: "6px 14px",
                      borderRadius: 20,
                      border: `1.5px solid ${C.line}`,
                      background: "transparent",
                      color: C.slate,
                      fontSize: 13,
                      cursor: "not-allowed",
                      fontFamily: "inherit",
                      opacity: 0.55,
                    }}
                  >
                    {opt.label}
                  </button>
                  <span
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -4,
                      background: C.orange,
                      color: C.ink,
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "1px 5px",
                      borderRadius: 8,
                      letterSpacing: "0.04em",
                    }}
                  >
                    SOON
                  </span>
                </div>
              );
            }
            return (
              <button
                key={opt.value}
                onClick={() => onChange("format", opt.value)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 20,
                  border: `1.5px solid ${active ? C.orange : C.line}`,
                  background: active ? C.orange : "transparent",
                  color: active ? C.ink : C.cream,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.18s",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {isStubFormat && (
          <div style={{ color: C.orange, fontSize: 12, marginTop: 8 }}>
            This format is coming soon — pick another to continue.
          </div>
        )}
      </Section>

      {settings.format === "carousel" && (
        <Section label="SLIDE COUNT">
          <PillSelect
            options={SLIDE_COUNTS.map((n) => ({ label: String(n), value: n }))}
            value={settings.slideCount}
            onChange={(v) => onChange("slideCount", v)}
          />
        </Section>
      )}

      <Section label="OUTPUT LANGUAGE">
        <PillSelect options={LANGUAGES} value={settings.language} onChange={(v) => onChange("language", v)} />
      </Section>

      {error && (
        <div style={{ color: "#e5484d", fontSize: 13, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!ready || loading}
        style={{
          width: "100%",
          padding: "13px 0",
          borderRadius: 10,
          border: "none",
          background: ready && !loading ? C.orange : C.slate,
          color: C.ink,
          fontSize: 15,
          fontWeight: 700,
          cursor: ready && !loading ? "pointer" : "not-allowed",
          opacity: ready && !loading ? 1 : 0.6,
          fontFamily: "inherit",
        }}
      >
        {loading ? "Searching…" : "Get Topic Suggestions →"}
      </button>
    </div>
  );
}

// ── Step 2: Topic Suggestions ─────────────────────────────────────────────────

function SuggestStep({ topics, onPick, onBack }) {
  return (
    <div>
      <h2 style={{ color: C.cream, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        Choose a Topic
      </h2>
      <p style={{ color: C.inkSoft, fontSize: 13, marginBottom: 20 }}>
        Pick a hook — these are grounded in current facts
      </p>
      {topics.map((t, i) => (
        <button
          key={i}
          onClick={() => onPick(t)}
          style={{
            display: "block",
            width: "100%",
            textAlign: "right",
            background: C.ground2,
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 10,
            cursor: "pointer",
            color: C.cream,
            fontFamily: "inherit",
            direction: "rtl",
            transition: "border-color 0.18s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.orange)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.line)}
        >
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{t.title}</div>
          <div style={{ color: C.inkSoft, fontSize: 12, lineHeight: 1.5, direction: "ltr", textAlign: "left" }}>
            {t.angle || t.summary}
          </div>
        </button>
      ))}
      <button
        onClick={onBack}
        style={{
          marginTop: 8,
          background: "transparent",
          border: "none",
          color: C.creamEdge,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        ← Back
      </button>
    </div>
  );
}

// ── Result rendering ──────────────────────────────────────────────────────────

function ResultDisplay({ format, parsed, raw }) {
  if (!parsed) return null;

  function RawFallback() {
    if (!raw) return null;
    return (
      <div style={{ marginTop: 8 }}>
        <div style={{ color: C.inkSoft, fontSize: 11, marginBottom: 6 }}>
          Raw model output (not parsed):
        </div>
        <pre
          style={{
            color: C.cream,
            fontSize: 12,
            whiteSpace: "pre-wrap",
            background: C.ground2,
            padding: 16,
            borderRadius: 10,
            direction: "rtl",
            margin: 0,
          }}
        >
          {raw}
        </pre>
      </div>
    );
  }

  if (format === "carousel") {
    if (!parsed.slides?.length && !parsed.caption) return <RawFallback />;
    return (
      <div>
        {(parsed.slides || []).map((s, i) => (
          <div
            key={i}
            style={{
              background: C.ground2,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 10,
              direction: "rtl",
            }}
          >
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              Slide {s.num}
            </div>
            <div style={{ color: C.cream, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {s.content}
            </div>
          </div>
        ))}
        {parsed.caption && (
          <div
            style={{
              background: C.ground2,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "14px 16px",
              direction: "rtl",
            }}
          >
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Caption</div>
            <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {parsed.caption}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (format === "telegram") {
    if (!parsed.text) return <RawFallback />;
    return (
      <div
        style={{
          background: C.ground2,
          border: `1px solid ${C.line}`,
          borderRadius: 10,
          padding: "16px",
          color: C.cream,
          fontSize: 14,
          lineHeight: 1.8,
          whiteSpace: "pre-wrap",
          direction: "rtl",
        }}
      >
        {parsed.text || ""}
      </div>
    );
  }

  if (format === "article") {
    if (!parsed.title && !parsed.content) return <RawFallback />;
    return (
      <div style={{ direction: "rtl" }}>
        {parsed.title && (
          <h3 style={{ color: C.cream, fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{parsed.title}</h3>
        )}
        <div
          style={{
            background: C.ground2,
            border: `1px solid ${C.line}`,
            borderRadius: 10,
            padding: "16px",
            color: C.cream,
            fontSize: 14,
            lineHeight: 1.8,
            whiteSpace: "pre-wrap",
          }}
        >
          {parsed.content || ""}
        </div>
      </div>
    );
  }

  if (format === "reel") {
    if (!parsed.hook && !parsed.body) return <RawFallback />;
    const sections = [
      { key: "hook", label: "Hook" },
      { key: "body", label: "Body" },
      { key: "cta", label: "CTA" },
    ];
    return (
      <div style={{ direction: "rtl" }}>
        {sections.map(({ key, label }) =>
          parsed[key] ? (
            <div
              key={key}
              style={{
                background: C.ground2,
                border: `1px solid ${C.line}`,
                borderRadius: 10,
                padding: "14px 16px",
                marginBottom: 10,
              }}
            >
              <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{label}</div>
              <div style={{ color: C.cream, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {parsed[key]}
              </div>
            </div>
          ) : null
        )}
        {parsed.onscreen?.length > 0 && (
          <div
            style={{
              background: C.ground2,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
              On-screen text
            </div>
            {parsed.onscreen.map((line, i) => (
              <div key={i} style={{ color: C.cream, fontSize: 13, lineHeight: 1.7 }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (format === "infographic") {
    if (!parsed.title && !parsed.stats?.length) return <RawFallback />;
    return (
      <div style={{ direction: "rtl" }}>
        {parsed.title && (
          <h3 style={{ color: C.cream, fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{parsed.title}</h3>
        )}
        {parsed.stats?.length > 0 && (
          <div
            style={{
              background: C.ground2,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 10,
            }}
          >
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Stats</div>
            {parsed.stats.map((s, i) => (
              <div key={i} style={{ color: C.cream, fontSize: 13, lineHeight: 1.8 }}>
                • {s}
              </div>
            ))}
          </div>
        )}
        {parsed.comparison && (
          <div
            style={{
              background: C.ground2,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 10,
            }}
          >
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Comparison</div>
            <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {parsed.comparison}
            </div>
          </div>
        )}
        {parsed.roadmap && (
          <div
            style={{
              background: C.ground2,
              border: `1px solid ${C.line}`,
              borderRadius: 10,
              padding: "14px 16px",
            }}
          >
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Roadmap</div>
            <div style={{ color: C.cream, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {parsed.roadmap}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <pre
      style={{
        color: C.cream,
        fontSize: 12,
        whiteSpace: "pre-wrap",
        background: C.ground2,
        padding: 16,
        borderRadius: 10,
        direction: "rtl",
      }}
    >
      {JSON.stringify(parsed, null, 2)}
    </pre>
  );
}

// ── Step 4: Result + Edit ─────────────────────────────────────────────────────

function ResultStep({ result, chosenTopic, onRegenerate, onBack, saved, onSave }) {
  const [feedback, setFeedback] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [genError, setGenError] = useState("");

  async function handleRegen() {
    setGenLoading(true);
    setGenError("");
    await onRegenerate(feedback);
    setGenLoading(false);
    setFeedback("");
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ color: C.cream, fontSize: 20, fontWeight: 700, margin: 0 }}>
          Result
        </h2>
        <span
          style={{
            background: C.slate,
            color: C.creamEdge,
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 12,
            fontWeight: 600,
            letterSpacing: "0.05em",
          }}
        >
          {result.format?.toUpperCase()}
        </span>
      </div>

      <div style={{ marginBottom: 20 }}>
        <ResultDisplay format={result.format} parsed={result.parsed} raw={result.raw} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <FieldLabel>FEEDBACK FOR REGENERATION (optional)</FieldLabel>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Describe what you'd like changed…"
          rows={3}
          style={{
            width: "100%",
            background: C.ground2,
            border: `1px solid ${C.line}`,
            borderRadius: 8,
            color: C.cream,
            padding: "10px 12px",
            fontSize: 13,
            fontFamily: "inherit",
            resize: "vertical",
            direction: "ltr",
            boxSizing: "border-box",
          }}
        />
      </div>

      {genError && (
        <div style={{ color: "#e5484d", fontSize: 13, marginBottom: 10 }}>{genError}</div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <button
          onClick={handleRegen}
          disabled={genLoading}
          style={{
            flex: 1,
            padding: "11px 0",
            borderRadius: 8,
            border: `1.5px solid ${C.orange}`,
            background: "transparent",
            color: C.orange,
            fontSize: 14,
            fontWeight: 600,
            cursor: genLoading ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            opacity: genLoading ? 0.6 : 1,
          }}
        >
          {genLoading ? "Generating…" : "Rewrite with Feedback"}
        </button>
        <button
          onClick={onSave}
          disabled={saved}
          style={{
            flex: 1,
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            background: saved ? C.slate : C.orange,
            color: C.ink,
            fontSize: 14,
            fontWeight: 700,
            cursor: saved ? "default" : "pointer",
            fontFamily: "inherit",
            opacity: saved ? 0.7 : 1,
          }}
        >
          {saved ? "Saved ✓" : "Save to Library"}
        </button>
      </div>

      <button
        onClick={onBack}
        style={{
          background: "transparent",
          border: "none",
          color: C.creamEdge,
          fontSize: 13,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        ← New topic
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContentWizard() {
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState({
    contentApproach: "analytical",
    country: "",
    country2: "",
    comparisonDimensions: [],
    field: "خبرهای مهاجرتی",
    tone: "آموزشی و رسمی",
    format: "carousel",
    slideCount: 7,
    language: "persian",
  });
  const [suggestedTopics, setSuggestedTopics] = useState([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [chosenTopic, setChosenTopic] = useState(null);
  const [result, setResult] = useState(null);
  const [genError, setGenError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  function changeSetting(key, value) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "country") {
        const validFields = fieldsForCountry(value);
        const stillValid = validFields.some((f) => f.value === prev.field);
        if (!stillValid) next.field = validFields[0]?.value || "";
        next.country2 = "";
      }
      if (key === "contentApproach" && value === "analytical") {
        next.country2 = "";
        next.comparisonDimensions = [];
      }
      return next;
    });
  }

  async function handleSetupNext() {
    setSuggestLoading(true);
    setSuggestError("");
    try {
      const isComparison = settings.contentApproach === "comparison";
      const countryParam =
        isComparison && settings.country2
          ? `${settings.country},${settings.country2}`
          : settings.country;
      const res = await fetch("/api/suggest-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: countryParam,
          field: settings.field,
          language: settings.language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load topics / خطا در دریافت موضوعات");
      setSuggestedTopics(data.topics || []);
      setStep(2);
    } catch (err) {
      setSuggestError(err.message);
    } finally {
      setSuggestLoading(false);
    }
  }

  async function generate(topic) {
    setGenerating(true);
    setGenError("");
    setResult(null);
    setStep(3);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: {
            ...topic,
            format: settings.format,
            tone: settings.tone,
            language: settings.language,
            slideCount: settings.slideCount,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate / خطا در تولید محتوا");
      setResult(data);
      setStep(4);
    } catch (err) {
      setGenError(err.message);
      setStep(2);
    } finally {
      setGenerating(false);
    }
  }

  function handlePickTopic(topic) {
    const isComparison = settings.contentApproach === "comparison";
    const countryParam =
      isComparison && settings.country2
        ? `${settings.country},${settings.country2}`
        : settings.country;
    const merged = {
      ...topic,
      country: countryParam,
      field: settings.field,
      tone: settings.tone,
      language: settings.language,
      slideCount: settings.slideCount,
      ...(isComparison && settings.comparisonDimensions.length
        ? { comparisonDimensions: settings.comparisonDimensions }
        : {}),
    };
    setChosenTopic(merged);
    setSaved(false);
    generate(merged);
  }

  async function handleRegenerate(feedback) {
    const updated = { ...chosenTopic, feedback };
    setChosenTopic(updated);
    setSaved(false);
    await generate(updated);
  }

  function handleSave() {
    if (!result) return;
    const item = {
      id: `wizard_${Date.now()}`,
      type: "wizard",
      format: result.format,
      title: chosenTopic?.title || "",
      country: settings.country,
      language: settings.language,
      raw: result.raw,
      parsed: result.parsed,
      savedAt: new Date().toISOString(),
    };
    const existing = loadLibraryLocal();
    const updated = dedupeLibrary([item, ...existing]);
    saveLibraryLocal(updated);
    pushLibraryRemote(updated);
    setSaved(true);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.ground,
        fontFamily: "'Vazirmatn', 'Inter', system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: C.ground2,
          borderBottom: `1px solid ${C.line}`,
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: C.cream, fontWeight: 800, fontSize: 15, letterSpacing: "0.04em" }}>
          SUGIMOTO · Content Wizard
        </span>
        <a
          href="/"
          style={{
            color: C.inkSoft,
            fontSize: 12,
            textDecoration: "none",
            borderBottom: `1px solid ${C.line}`,
            paddingBottom: 1,
          }}
        >
          ← Topic Engine
        </a>
      </div>

      {/* Card */}
      <div
        style={{
          maxWidth: 520,
          margin: "32px auto",
          padding: "0 16px 80px",
        }}
      >
        <StepDots step={step} />

        {step === 1 && (
          <SetupStep
            settings={settings}
            onChange={changeSetting}
            onNext={handleSetupNext}
            loading={suggestLoading}
            error={suggestError}
          />
        )}

        {step === 2 && (
          <SuggestStep
            topics={suggestedTopics}
            onPick={handlePickTopic}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && <Spinner />}

        {step === 4 && result && (
          <ResultStep
            result={result}
            chosenTopic={chosenTopic}
            onRegenerate={handleRegenerate}
            onBack={() => setStep(2)}
            saved={saved}
            onSave={handleSave}
          />
        )}

        {step === 4 && genError && (
          <div style={{ color: "#e5484d", fontSize: 14, textAlign: "center", padding: "32px 0" }}>
            {genError}
          </div>
        )}
      </div>
    </div>
  );
}
