import * as React from "react";
import { cn } from "../../lib/cn";

const field = "w-full box-border rounded-md border border-solid border-border bg-surface px-3 font-[inherit] text-sm text-ink placeholder:text-muted focus:outline-none focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:opacity-50";

const Input = React.forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(field, "h-10", className)} {...props} />;
});

const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(field, "min-h-[80px] py-2 leading-relaxed resize-y", className)} {...props} />;
});

export { Input, Textarea };
