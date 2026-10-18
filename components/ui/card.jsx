import * as React from "react";
import { cn } from "../../lib/cn";

function Card({ className, ...props }) {
  return <div className={cn("rounded-[12px] border border-solid border-border bg-surface text-ink", className)} {...props} />;
}
function CardHeader({ className, ...props }) {
  return <div className={cn("flex flex-col gap-1 p-4 pb-2", className)} {...props} />;
}
function CardTitle({ className, ...props }) {
  return <h3 className={cn("m-0 text-[15px] font-semibold leading-tight", className)} {...props} />;
}
function CardContent({ className, ...props }) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };
