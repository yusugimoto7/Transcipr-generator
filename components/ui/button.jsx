"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-[inherit] text-sm font-medium leading-none no-underline transition-colors cursor-pointer border border-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-white border-transparent hover:bg-primary-deep",
        secondary: "bg-[#efebe3] text-ink border-transparent hover:bg-[#e5e0d5]",
        outline: "bg-surface text-ink border-border hover:bg-ground",
        ghost: "bg-transparent text-ink border-transparent hover:bg-[#efebe3]",
        destructive: "bg-transparent text-[#b91c1c] border-transparent hover:bg-[#fef2f2]",
        link: "bg-transparent text-primary border-transparent underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const Button = React.forwardRef(function Button({ className, variant, size, asChild = false, ...props }, ref) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
});

export { Button, buttonVariants };
