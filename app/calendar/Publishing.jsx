"use client";

// Publishing views: the week planner (posts in their hour, drag to move) and the post lists by
// status (Drafts, Waiting for approval, Scheduled, Published, Failed), as in Zoho Social.

import { whenAll, myZone, zoneName, zoneAbbr, dateLocale } from "../../lib/tz";
import { publishStateOf } from "../../lib/calendar/publishState";
import { L, uiDir } from "../../lib/i18n";
import { useEffect, useRef, useState } from "react";
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, useDraggable } from "@dnd-kit/core";
import { STATUS, effectiveCaption, onNetworks, thumbOf, statusName, netName, publishStateName } from "./channels";
import { NetChip, StatusPill } from "./Composer";
import c from "./publishing.module.css";
import { Clock, Play } from "lucide-react";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeOf = (iso) => new Date(iso).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });

export function captionOf(card) {
  return card.caption || onNetworks(card).map((n) => effectiveCaption(card, n.key)).find(Boolean) || "";
}

// Under the calendar's controls: whose clock the grid uses, and what time it is at the other places.
export function ZoneBanner() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <div className={c.muted} style={{ lineHeight: 1.5 }} dir={uiDir()}>
      <Clock size={12} aria-hidden style={{ verticalAlign: "-1px" }} /> {L("زمان‌ها به وقت ", "Times are in ")}<b>{L("خودت", "your")}</b>{L(" هستند: ", " time zone: ")}{zoneName(myZone())} ({zoneAbbr(now, myZone())}). {L("الان: ", "Right now: ")}{whenAll(now.toISOString(), { withZone: false }).split(" · ").slice(1).join(" · ")}. {L("نشانگر را روی یک پست نگه دار تا زمانش را در هر جا ببینی.", "Hover a post for its time at every place.")}
    </div>
  );
}

export function Tile({ card, onOpen, drag = true }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, disabled: !drag || card.status === "published" });
  const st = STATUS[card.status] || STATUS.draft;
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={`${c.tile} ${isDragging ? c.dragging : ""}`} style={{ borderLeftColor: st.color }} onClick={() => onOpen(card)} title={`${statusName(card.status)}${card.board_name ? " · " + card.board_name : ""}${card.publish_at ? " · " + whenAll(card.publish_at) : ""}`}>
      <b>
        {card.publish_at ? timeOf(card.publish_at) : ""}
        {onNetworks(card).map((n) => (
          <NetChip key={n.key} k={n.key} state={publishStateOf((card.publish || {})[n.key])} />
        ))}
      </b>
      <LabelBars hex={card.label_hex} names={card.label_names} />
      <span dir="auto">{card.title || captionOf(card) || L("پست بی‌عنوان", "Untitled post")}</span>
    </div>
  );
}

// The card's labels as Trello's small colour bars (Yegane, Nov 10 2026: the calendar showed no label
// colours to organise cards by). `hex` is filled from the board's labels by the calendar page, `names`
// beside it. A tap on the bars shows the labels' names on every card, as in Trello, and again hides
// them (Hamed, Nov 24 2026); the choice is kept on the device.
const LABEL_TEXT_KEY = "cal:labelText";
function useLabelText() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setOn(localStorage.getItem(LABEL_TEXT_KEY) === "1");
      } catch (_) {}
    };
    read();
    window.addEventListener("cal-label-text", read);
    return () => window.removeEventListener("cal-label-text", read);
  }, []);
  const toggle = () => {
    try {
      localStorage.setItem(LABEL_TEXT_KEY, on ? "0" : "1");
    } catch (_) {}
    setOn(!on);
    window.dispatchEvent(new Event("cal-label-text"));
  };
  return [on, toggle];
}
const darkText = (h) => {
  const m = String(h || "").replace("#", "");
  if (m.length < 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
};
export function LabelBars({ hex, names = [] }) {
  const [text, toggle] = useLabelText();
  if (!hex || !hex.length) return null;
  const click = (e) => {
    e.stopPropagation();
    toggle();
  };
  return (
    <span
      onClick={click}
      onPointerDown={(e) => e.stopPropagation()}
      role="button"
      title={text ? L("پنهان کردن نام برچسب‌ها", "Hide label names") : L("نمایش نام برچسب‌ها", "Show label names")}
      style={{ display: "flex", gap: 3, flexWrap: "wrap", margin: "2px 0", cursor: "pointer" }}
    >
      {hex.slice(0, 6).map((h, i) =>
        text && names[i] ? (
          <i key={i} dir="auto" style={{ fontStyle: "normal", fontSize: 11, fontWeight: 700, lineHeight: "16px", padding: "0 6px", borderRadius: 4, background: h, color: darkText(h) ? "#1d2125" : "#fff", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {names[i]}
          </i>
        ) : (
          <i key={i} style={{ display: "block", width: 22, height: 6, borderRadius: 3, background: h }} />
        )
      )}
    </span>
  );
}

function Slot({ id, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${c.slot} ${isOver ? c.over : ""}`}>
      {children}
    </div>
  );
}

const sensorsCfg = [
  [PointerSensor, { activationConstraint: { distance: 6 } }],
  [TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }],
];

export function WeekView({ cards, dueCards = null, onOpen, onOpenCard = null, onMove, onNew, span = 7 }) {
  const sensors = useSensors(useSensor(sensorsCfg[0][0], sensorsCfg[0][1]), useSensor(sensorsCfg[1][0], sensorsCfg[1][1]));
  // a week starts on Monday; the day view (span 1, Hamed Nov 24 2026) starts today
  const startOf = (d0) => {
    const d = new Date(d0);
    d.setHours(0, 0, 0, 0);
    if (span === 7) d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  };
  const [anchor, setAnchor] = useState(() => startOf(new Date()));
  const [active, setActive] = useState(null);
  const scroller = useRef(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 52 * 8; // start the day at 8:00
  }, []);
  const days = Array.from({ length: span }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i));
  // cards with a due date (planning cards too) sit in a row above the hours, as on the month grid
  const dues = {};
  for (const card of dueCards || cards) if (card.due_at) (dues[dayKey(new Date(card.due_at))] ||= []).push(card);
  const slots = {};
  for (const card of cards) {
    if (!card.publish_at) continue;
    const t = new Date(card.publish_at);
    (slots[`${dayKey(t)}-${t.getHours()}`] ||= []).push(card);
  }
  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const card = cards.find((x) => x.id === a.id);
    const [y, m, d, h] = over.id.split("-").map(Number);
    const old = card.publish_at ? new Date(card.publish_at) : null;
    const when = new Date(y, m - 1, d, h, old ? old.getMinutes() : 0);
    if (!old || when.getTime() !== old.getTime()) onMove(card, { publish_at: when.toISOString() });
  };
  const label = span === 1
    ? days[0].toLocaleDateString(dateLocale(), { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : `${days[0].toLocaleDateString(dateLocale(), { month: "short", day: "numeric" })} – ${days[span - 1].toLocaleDateString(dateLocale(), { month: "short", day: "numeric", year: "numeric" })}`;
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(e.active.id)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className={c.row}>
        <button className={c.btn} onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - span))} aria-label={span === 1 ? L("روز قبل", "Previous day") : L("هفتهٔ قبل", "Previous week")}>
          ‹
        </button>
        <button className={c.btn} onClick={() => setAnchor(startOf(new Date()))}>
          {span === 1 ? L("امروز", "Today") : L("این هفته", "This week")}
        </button>
        <button className={c.btn} onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + span))} aria-label={span === 1 ? L("روز بعد", "Next day") : L("هفتهٔ بعد", "Next week")}>
          ›
        </button>
        <strong>{label}</strong>
        <span className={c.muted} dir={uiDir()}>{L("روی یک ساعت دوبار کلیک کن تا برای همان ساعت پست بنویسی. پست‌ها را بکش تا جابه‌جا بشن.", "Double-click an hour to write a post for that time. Drag posts to move them.")}</span>
      </div>
      <div className={c.weekScroll} ref={scroller}>
        <div className={c.week} style={span === 1 ? { gridTemplateColumns: "56px minmax(0, 1fr)", minWidth: 0 } : undefined}>
          <div className={c.wHead} />
          {days.map((d) => (
            <div key={dayKey(d)} className={`${c.wHead} ${dayKey(d) === dayKey(new Date()) ? c.today : ""}`}>
              {d.toLocaleDateString(dateLocale(), { weekday: "short", day: "numeric" })}
            </div>
          ))}
          {days.some((d) => (dues[dayKey(d)] || []).length) && (
            <>
              <div className={c.hour}>{L("موعد", "Due")}</div>
              {days.map((d) => (
                <div key={"due" + dayKey(d)} style={{ display: "flex", flexDirection: "column", gap: 3, padding: 3 }}>
                  {(dues[dayKey(d)] || []).map((card) => (
                    <span key={card.id} className={c.due} onClick={() => (onOpenCard || onOpen)(card)} dir="auto" style={{ cursor: "pointer" }}>
                      <LabelBars hex={card.label_hex} names={card.label_names} />
                      {card.title}
                    </span>
                  ))}
                </div>
              ))}
            </>
          )}
          {Array.from({ length: 24 }, (_, h) => (
            <Hour key={h} h={h} days={days} slots={slots} onOpen={onOpen} onNew={onNew} />
          ))}
        </div>
      </div>
      <DragOverlay>{active ? <div className={c.tile}>{cards.find((x) => x.id === active)?.title}</div> : null}</DragOverlay>
    </DndContext>
  );
}

function Hour({ h, days, slots, onOpen, onNew }) {
  return (
    <>
      <div className={c.hour}>{new Date(2000, 0, 1, h).toLocaleTimeString(dateLocale(), { hour: "numeric" })}</div>
      {days.map((d) => {
        const key = `${dayKey(d)}-${h}`;
        return (
          <div key={key} onDoubleClick={() => onNew(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h).toISOString())}>
            <Slot id={key}>
              {(slots[key] || []).map((card) => (
                <Tile key={card.id} card={card} onOpen={onOpen} />
              ))}
            </Slot>
          </div>
        );
      })}
    </>
  );
}

// Labels are pairs, read with L() where the tabs are drawn.
export const LIST_TABS = [
  ["draft", ["پیش‌نویس‌ها", "Drafts"]],
  ["pending", ["در انتظار تأیید", "Waiting for approval"]],
  ["scheduled", ["زمان‌بندی‌شده", "Scheduled"]],
  ["published", ["منتشرشده", "Published"]],
  ["failed", ["ناموفق", "Failed"]],
];

// Cards brought over from Trello are planning cards: they join the Posts lists once a network is
// switched on or a time is set, so 1,000 old cards do not bury the real drafts.
const planningOnly = (card) => !!card.trello && !card.publish_at && !card.review && !Object.values(card.channels || {}).some((x) => x && x.on);

export function inTab(card, tab) {
  if (planningOnly(card)) return false;
  if (tab === "scheduled") return ["scheduled", "approved", "publishing"].includes(card.status);
  return card.status === tab;
}

export function PostList({ cards, tab, admin, onOpen, onAction }) {
  const rows = cards
    .filter((x) => inTab(x, tab))
    .sort((a, b) => {
      const ta = a.publish_at ? new Date(a.publish_at).getTime() : Infinity;
      const tb = b.publish_at ? new Date(b.publish_at).getTime() : Infinity;
      return tab === "published" ? tb - ta : ta - tb;
    });
  if (!rows.length) {
    const empty = {
      draft: L("پیش‌نویسی نیست. با «پست جدید» یکی شروع کن.", "No drafts. Start one with New post."),
      pending: L("چیزی در انتظار تأیید نیست.", "Nothing is waiting for approval."),
      scheduled: L("هنوز چیزی زمان‌بندی نشده.", "Nothing scheduled yet."),
      published: L("هنوز چیزی منتشر نشده.", "Nothing published yet."),
      failed: L("پست ناموفقی نیست.", "No failed posts."),
    };
    return <div className={`${c.list} ${c.empty}`} dir={uiDir()}>{empty[tab]}</div>;
  }
  return (
    <div className={c.list}>
      {rows.map((card) => {
        const thumb = thumbOf(card.media);
        const fails = Object.entries(card.publish || {}).filter(([, p]) => ["failed", "unknown", "missed"].includes(p.status));
        return (
          <div key={card.id} className={c.listRow} onClick={() => onOpen(card)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <b style={{ fontSize: 14 }} title={card.publish_at ? whenAll(card.publish_at) : ""}>
                {card.publish_at ? new Date(card.publish_at).toLocaleString(dateLocale(), { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : L("بدون تاریخ", "No date")}
              </b>
              <span className={c.muted}>{card.board_name}</span>
            </div>
            <div className={c.rowThumb} style={thumb ? { backgroundImage: `url(${thumb})` } : { background: "#c9ced6" }}>
              {card.media && card.media.kind === "video" ? <Play size={16} fill="currentColor" aria-hidden /> : ""}
            </div>
            <div className={c.rowText}>
              <div className={c.row} style={{ gap: 6 }}>
                {onNetworks(card).map((n) => (
                  <NetChip key={n.key} k={n.key} state={publishStateOf((card.publish || {})[n.key])} />
                ))}
                <b dir="auto">{card.title || L("پست بی‌عنوان", "Untitled post")}</b>
              </div>
              <p dir="auto">{captionOf(card)}</p>
              {fails.map(([k, p]) => (
                <span key={k} style={{ color: "#b42318", fontSize: 12 }}>
                  {netName(k)}: {p.error || publishStateName(publishStateOf(p))}
                </span>
              ))}
            </div>
            <div className={c.rowActs} onClick={(e) => e.stopPropagation()}>
              <StatusPill status={card.status} />
              {admin && card.status === "pending" && (
                <>
                  <button className={`${c.btn} ${c.blue}`} onClick={() => onAction(card, "approve")}>
                    {L("تأیید", "Approve")}
                  </button>
                  <button className={`${c.btn} ${c.danger}`} onClick={() => onAction(card, "reject")}>
                    {L("برگرداندن", "Send back")}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
