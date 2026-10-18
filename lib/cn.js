// Joins class names and lets a later Tailwind class win over an earlier one (shadcn/ui's cn).
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
