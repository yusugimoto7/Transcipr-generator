"use client";

// A sheet: on a phone it rises from the bottom, on a computer it is a centred window
// (Radix Dialog underneath, so focus, Escape and the backdrop behave correctly).
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetClose = Dialog.Close;

function SheetContent({ className, children, title, description, ...props }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[70] bg-[rgba(9,15,25,0.5)]" />
      <Dialog.Content
        className={cn(
          "fixed z-[71] box-border bg-surface text-ink shadow-[0_-8px_28px_rgba(9,30,66,0.2)] focus:outline-none",
          "inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-[18px] px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-2",
          "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(480px,92vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[16px] md:p-5",
          className
        )}
        {...props}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#d4d4d8] md:hidden" aria-hidden />
        {title && <Dialog.Title className="m-0 mb-1 text-[17px] font-semibold">{title}</Dialog.Title>}
        {description ? <Dialog.Description className="m-0 mb-3 text-sm text-muted">{description}</Dialog.Description> : <Dialog.Description className="sr-only">{title}</Dialog.Description>}
        {children}
        <Dialog.Close className="absolute right-3 top-3 hidden h-8 w-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted hover:bg-[#efebe3] md:flex" aria-label="Close">
          <X size={16} />
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent };
