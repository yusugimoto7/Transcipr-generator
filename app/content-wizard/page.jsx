"use client";
import { useState } from "react";

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
  { label: "کانادا", value: "canada", flag: "🇨🇦" },
  { label: "فنلاند", value: "finland", flag: "🇫🇮" },
  { label: "آلمان", value: "germany", flag: "🇩🇪" },
  { label: "هلند", value: "netherlands", flag: "🇳🇱" },
  { label: "اسپانیا", value: "spain", flag: "🇪🇸" },
  { label: "فرانسه", value: "france", flag: "🇫🇷" },
];

const FIELDS_BY_COUNTRY = {
  canada: [
    { label: "Express Entry", value: "Express Entry" },
    { label: "PNP", value: "PNP" },
    { label: "Startup Visa", value: "Startup Visa" },
    { label: "ورک پرمیت", value: "ورک پرمیت" },
    { label: "تحصیل", value: "تحصیل" },
    { label: "مهاجرت خانوادگی", value: "مهاجرت خانوادگی" },
    { label: "اقامت دائم", value: "اقامت دائم" },
    { label: "سیاست‌گذاری", value: "سیاست‌گذاری" },
    { label: "مقایسه‌ای", value: "مقایسه‌ای" },
    { label: "خبرهای مهاجرتی", value: "خبرهای مهاجرتی" },
    { label: "عمومی", value: "عمومی" },
  ],
  europe: [
    { label: "تحصیل", value: "تحصیل" },
    { label: "ورک پرمیت", value: "ورک پرمیت" },
    { label: "Startup Visa", value: "Startup Visa" },
    { label: "مهاجرت خانوادگی", value: "مهاجرت خانوادگی" },
    { label: "سیاست‌گذاری", value: "سیاست‌گذاری" },
    { label: "مقایسه‌ای", value: "مقایسه‌ای" },
    { label: "خبرهای مهاجرتی", value: "خبرهای مهاجرتی" },
    { label: "عمومی", value: "عمومی" },
  ],
};

const EUROPE_COUNTRIES = ["finland", "germany", "netherlands", "spain", "france"];

function fieldsForCountry(country) {
  if (!country) return FIELDS_BY_COUNTRY.canada;
  return EUROPE_COUNTRIES.includes(country) ? FIELDS_BY_COUNTRY.europe : FIELDS_BY_COUNTRY.canada;
}

const TONES = [
  { label: "آموزشی و رسمی", value: "آموزشی و رسمی" },
  { label: "صمیمی و ساده", value: "صمیمی و ساده" },
  { label: "فوری و خبری", value: "فوری و خبری" },
  { label: "تحلیلی و عمیق", value: "تحلیلی و عمیق" },
  { label: "انگیزشی", value: "انگیزشی" },
];

const FORMATS = [
  { label: "کاروسل", value: "carousel" },
  { label: "اینفوگرافیک", value: "infographic" },
  { label: "ریل", value: "reel" },
  { label: "مقاله", value: "article" },
  { label: "تلگرام", value: "telegram" },
];

const SLIDE_COUNTS = [5, 7, 10, 12];

const LANGUAGES = [
  { label: "فارسی", value: "persian" },
  { label: "English", value: "english" },
];

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
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, direction: "rtl" }}>
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

function FieldLabel({ children }) {
  return (
    <div
      style={{
        color: C.creamEdge,
        fontSize: 12,
        fontWeight: 600,
        marginBottom: 8,
        letterSpacing: "0.06em",
        direction: "rtl",
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
      <div>در حال تولید محتوا…</div>
    </div>
  );
}

// ── Step 1: Setup ──────────────────────────────────────────────────────────────

function SetupStep({ settings, onChange, onNext, loading, error }) {
  const fields = fieldsForCountry(settings.country);
  const isComparison = settings.field === "مقایسه‌ای";
  // second country must differ from first and not be empty
  const country2Options = COUNTRIES.filter((c) => c.value !== settings.country);
  const ready = settings.country && settings.format && (!isComparison || settings.country2);
  return (
    <div>
      <h2 style={{ color: C.cream, fontSize: 20, fontWeight: 700, marginBottom: 24, direction: "rtl" }}>
        تنظیمات محتوا
      </h2>
      <Section label="کشور">
        <PillSelect options={COUNTRIES} value={settings.country} onChange={(v) => onChange("country", v)} />
      </Section>
      <Section label="حوزه">
        <PillSelect options={fields} value={settings.field} onChange={(v) => onChange("field", v)} />
      </Section>
      {isComparison && (
        <Section label="کشور دوم (مقایسه)">
          <PillSelect options={country2Options} value={settings.country2} onChange={(v) => onChange("country2", v)} />
        </Section>
      )}
      <Section label="لحن">
        <PillSelect options={TONES} value={settings.tone} onChange={(v) => onChange("tone", v)} />
      </Section>
      <Section label="فرمت">
        <PillSelect options={FORMATS} value={settings.format} onChange={(v) => onChange("format", v)} />
      </Section>
      {settings.format === "carousel" && (
        <Section label="تعداد اسلاید">
          <PillSelect
            options={SLIDE_COUNTS.map((n) => ({ label: String(n), value: n }))}
            value={settings.slideCount}
            onChange={(v) => onChange("slideCount", v)}
          />
        </Section>
      )}
      <Section label="زبان خروجی">
        <PillSelect options={LANGUAGES} value={settings.language} onChange={(v) => onChange("language", v)} />
      </Section>
      {error && (
        <div style={{ color: "#e5484d", fontSize: 13, marginBottom: 12, direction: "rtl" }}>{error}</div>
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
          direction: "rtl",
        }}
      >
        {loading ? "در حال جستجو…" : "پیشنهاد موضوع ←"}
      </button>
    </div>
  );
}

// ── Step 2: Topic Suggestions ─────────────────────────────────────────────────

function SuggestStep({ topics, onPick, onBack }) {
  return (
    <div>
      <h2 style={{ color: C.cream, fontSize: 20, fontWeight: 700, marginBottom: 8, direction: "rtl" }}>
        انتخاب موضوع
      </h2>
      <p style={{ color: C.inkSoft, fontSize: 13, marginBottom: 20, direction: "rtl" }}>
        یکی از موضوعات زیر را انتخاب کنید
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
          <div style={{ color: C.inkSoft, fontSize: 12, lineHeight: 1.5 }}>{t.summary}</div>
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
          direction: "rtl",
          fontFamily: "inherit",
        }}
      >
        ← بازگشت
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
        <div style={{ color: C.inkSoft, fontSize: 11, marginBottom: 6, direction: "rtl" }}>
          خروجی خام مدل (پارس نشد):
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
              اسلاید {s.num}
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
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>کپشن</div>
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
      { key: "hook", label: "هوک" },
      { key: "body", label: "متن" },
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
              متن روی صفحه
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
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>آمار</div>
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
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>مقایسه</div>
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
            <div style={{ color: C.orange, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>نقشه راه</div>
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
        <h2 style={{ color: C.cream, fontSize: 20, fontWeight: 700, direction: "rtl", margin: 0 }}>
          نتیجه
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
        <FieldLabel>بازخورد برای تولید مجدد (اختیاری)</FieldLabel>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="مثلاً: لحن رسمی‌تر، یک اسلاید درباره هزینه‌ها اضافه کن…"
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
            direction: "rtl",
            boxSizing: "border-box",
          }}
        />
      </div>

      {genError && (
        <div style={{ color: "#e5484d", fontSize: 13, marginBottom: 10, direction: "rtl" }}>{genError}</div>
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
          {genLoading ? "در حال تولید…" : "تولید مجدد"}
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
          {saved ? "ذخیره شد ✓" : "ذخیره در کتابخانه"}
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
          direction: "rtl",
          fontFamily: "inherit",
        }}
      >
        ← موضوع جدید
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ContentWizard() {
  const [step, setStep] = useState(1);
  const [settings, setSettings] = useState({
    country: "",
    country2: "",
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
      // When country changes, reset field to first valid option for new country
      if (key === "country") {
        const validFields = fieldsForCountry(value);
        const stillValid = validFields.some((f) => f.value === prev.field);
        if (!stillValid) next.field = validFields[0]?.value || "";
        next.country2 = "";
      }
      return next;
    });
  }

  async function handleSetupNext() {
    setSuggestLoading(true);
    setSuggestError("");
    try {
      const countryParam =
        settings.field === "مقایسه‌ای" && settings.country2
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
      if (!res.ok) throw new Error(data.error || "خطا در دریافت موضوعات");
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
      if (!res.ok) throw new Error(data.error || "خطا در تولید محتوا");
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
    const countryParam =
      settings.field === "مقایسه‌ای" && settings.country2
        ? `${settings.country},${settings.country2}`
        : settings.country;
    const merged = {
      ...topic,
      country: countryParam,
      field: settings.field,
      tone: settings.tone,
      language: settings.language,
      slideCount: settings.slideCount,
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
        direction: "rtl",
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
          <div style={{ color: "#e5484d", fontSize: 14, direction: "rtl", textAlign: "center", padding: "32px 0" }}>
            {genError}
          </div>
        )}
      </div>
    </div>
  );
}
