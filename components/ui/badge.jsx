import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/cn";

// Post status and small markers. Status colours stay apart in lightness too, so they
// read without relying on hue alone.
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium leading-5 whitespace-nowrap", {
  variants: {
    variant: {
      default: "bg-primary-soft text-primary-deep",
      draft: "bg-[#f1efe9] text-[#3f3f46]",
      pending: "bg-[#fff7ed] text-[#9a3412]",
      scheduled: "bg-[#eff6ff] text-[#1d4ed8]",
      published: "bg-[#f0fdf4] text-[#15803d]",
      failed: "bg-[#fef2f2] text-[#b91c1c]",
      outline: "border border-solid border-border text-ink bg-surface",
    },
  },
  defaultVariants: { variant: "default" },
});

function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
