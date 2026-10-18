"use client";

import * as React from "react";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/cn";

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

function DropdownMenuContent({ className, align = "end", sideOffset = 6, ...props }) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-[80] min-w-[200px] rounded-[10px] border border-solid border-border bg-surface p-1 text-ink shadow-[0_12px_32px_rgba(9,30,66,0.18)]", className)}
        {...props}
      />
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, danger, ...props }) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-[#efebe3] data-[disabled]:opacity-50 [&_svg]:size-4",
        danger && "text-[#b91c1c]",
        className
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }) {
  return <Menu.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
