"use client";

// The menu on a list's header, as in Trello: add a card at the top, rename, copy, move, sort,
// colour, move or archive its cards, archive the list. On a phone it is a sheet from the bottom;
// each row with an arrow opens its own page inside the sheet. Who may do what is decided on the
// server (listAction in lib/calendar/model.js); the rows only hide what would be refused.
// There is no "Watch": the calendar has no notifications to subscribe to.

import { useState } from "react";
import { ArrowDownAZ, ArrowLeft, ArrowRightLeft, Archive, ChevronRight, Copy, MoveHorizontal, MoreHorizontal, Palette, PencilLine, Plus } from "lucide-react";
import { Sheet, SheetContent } from "../../components/ui/sheet";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export const LIST_COLORS = {
  slate: ["Slate", "#32515d"], blue: ["Blue", "#2563eb"], green: ["Green", "#16a34a"], amber: ["Amber", "#d97706"],
  red: ["Red", "#dc2626"], purple: ["Purple", "#7c3aed"], pink: ["Pink", "#db2777"], gray: ["Gray", "#6b7280"],
};
const SORTS = [["newest", "Date created (newest first)"], ["oldest", "Date created (oldest first)"], ["title", "Card name (alphabetically)"], ["date", "Publish date (soonest first)"]];

const row = "flex min-h-12 w-full cursor-pointer items-center gap-3 border-0 border-b border-solid border-border bg-transparent px-1 py-2.5 text-left text-[15px] text-ink hover:bg-[#f3f0ea] disabled:cursor-default disabled:opacity-50";

function Row({ Icon, children, onClick, arrow, danger, disabled }) {
  return (
    <button type="button" className={`${row} ${danger ? "text-[#b91c1c]" : ""}`} onClick={onClick} disabled={disabled}>
      <Icon size={18} className="flex-none text-muted" aria-hidden />
      <span className="flex-1">{children}</span>
      {arrow && <ChevronRight size={18} className="text-muted" aria-hidden />}
    </button>
  );
}

export default function ListMenu({ list, lists, cards, admin, onAddTop, onOp }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("root");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const published = cards.filter((x) => x.status === "published").length;
  const others = lists.filter((l) => l.id !== list.id);

  const show = (v, t = "") => {
    setError("");
    setText(t);
    setView(v);
  };
  const run = async (body, close = true) => {
    setBusy(true);
    setError("");
    try {
      await onOp({ list_id: list.id, ...body });
      if (close) setOpen(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const ask = (msg, body) => window.confirm(msg) && run(body);
  const title = { root: list.name, rename: "Rename list", copy: "Copy list", move: "Move list", sort: "Sort list", color: "Change list color", move_all: "Move all cards in this list" }[view];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        className="grid h-7 w-7 flex-none cursor-pointer place-items-center rounded-md border-0 bg-transparent text-muted hover:bg-[#e5e0d5]"
        aria-label={`Actions for the list ${list.name}`}
        onClick={() => (show("root"), setOpen(true))}
      >
        <MoreHorizontal size={16} aria-hidden />
      </button>
      <SheetContent title={title} className="md:w-[min(420px,92vw)]">
        {view !== "root" && (
          <button type="button" className="mb-2 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-sm text-muted" onClick={() => show("root")}>
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
        )}

        {view === "root" && (
          <div className="mt-2 flex flex-col">
            <Row Icon={Plus} onClick={() => (setOpen(false), onAddTop())}>Add card to top of list</Row>
            {admin && <Row Icon={PencilLine} arrow onClick={() => show("rename", list.name)}>Rename list</Row>}
            {admin && <Row Icon={Copy} arrow onClick={() => show("copy", `${list.name} (copy)`)}>Copy list</Row>}
            {admin && <Row Icon={MoveHorizontal} arrow onClick={() => show("move")}>Move list</Row>}
            <Row Icon={ArrowDownAZ} arrow onClick={() => show("sort")} disabled={cards.length < 2}>Sort list</Row>
            {admin && <Row Icon={Palette} arrow onClick={() => show("color")}>Change list color</Row>}
            <Row Icon={ArrowRightLeft} arrow onClick={() => show("move_all")} disabled={!cards.length || !others.length}>Move all cards in this list</Row>
            {admin && (
              <>
                <Row Icon={Archive} disabled={!published || busy} onClick={() => ask(`Archive the ${published} published post${published > 1 ? "s" : ""} in “${list.name}”?`, { action: "archive_published" })}>
                  Archive published posts
                </Row>
                <Row Icon={Archive} disabled={!cards.length || busy} onClick={() => ask(`Archive all ${cards.length} cards in “${list.name}”?`, { action: "archive_all" })}>
                  Archive all cards in this list
                </Row>
                <Row Icon={Archive} danger disabled={!!list.role || busy} onClick={() => ask(cards.length ? `Archive the list “${list.name}” and its ${cards.length} card${cards.length > 1 ? "s" : ""}?` : `Archive the list “${list.name}”?`, { action: "archive_list", with_cards: true })}>
                  {list.role ? "Archive list (publishing uses this list)" : "Archive list"}
                </Row>
              </>
            )}
          </div>
        )}

        {(view === "rename" || view === "copy") && (
          <form
            className="mt-2 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run({ action: view, name: text });
            }}
          >
            <label htmlFor="list-name" className="text-sm text-muted">{view === "copy" ? "Name of the new list (its cards are copied as drafts)" : "Name"}</label>
            <Input id="list-name" autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={60} dir="auto" />
            <Button disabled={busy || !text.trim()}>{view === "copy" ? "Create list" : "Rename"}</Button>
          </form>
        )}

        {view === "move" && (
          <div className="mt-2 flex flex-col">
            <p className="m-0 mb-1 text-sm text-muted">Choose the new position.</p>
            {lists.map((l, i) => (
              <button key={l.id} type="button" className={row} disabled={busy} onClick={() => run({ action: "move", to: i + 1 })}>
                <span className="w-6 text-muted">{i + 1}</span>
                <span className="flex-1" dir="auto">{l.name}{l.id === list.id ? " (current)" : ""}</span>
              </button>
            ))}
          </div>
        )}

        {view === "sort" && (
          <div className="mt-2 flex flex-col">
            {SORTS.map(([k, label]) => (
              <button key={k} type="button" className={row} disabled={busy} onClick={() => run({ action: "sort", by: k })}>
                {label}
              </button>
            ))}
          </div>
        )}

        {view === "color" && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Object.entries(LIST_COLORS).map(([k, [name, hex]]) => (
              <button key={k} type="button" disabled={busy} onClick={() => run({ action: "color", color: k })} className="flex h-11 cursor-pointer items-center gap-2 rounded-[10px] border border-solid border-border bg-surface px-3 text-sm text-ink" style={list.color === k ? { outline: `2px solid ${hex}` } : undefined}>
                <span className="h-4 w-4 rounded-full" style={{ background: hex }} aria-hidden /> {name}
              </button>
            ))}
            <button type="button" disabled={busy} onClick={() => run({ action: "color", color: "" })} className="col-span-2 h-10 cursor-pointer rounded-[10px] border border-dashed border-border bg-transparent text-sm text-muted">
              Remove color
            </button>
          </div>
        )}

        {view === "move_all" && (
          <div className="mt-2 flex flex-col">
            <p className="m-0 mb-1 text-sm text-muted">Move all {cards.length} cards to:</p>
            {others.map((l) => (
              <button key={l.id} type="button" className={row} disabled={busy} onClick={() => run({ action: "move_all", to_list_id: l.id })}>
                <span dir="auto">{l.name}</span>
              </button>
            ))}
          </div>
        )}

        {error && <p className="m-0 mt-3 text-sm text-[#b91c1c]" role="alert">{error}</p>}
      </SheetContent>
    </Sheet>
  );
}
