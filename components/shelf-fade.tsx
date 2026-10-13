"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Books this browser tab has already shown on a shelf, and whether the first page has finished hydrating.
const seen = new Set<number>();
let ready = false;

/**
 * The one deliberate motion (STYLE.md): when Your shelf refreshes after a rating, picks that were not there before
 * fade in. The first paint of the page never animates, and reduced-motion users get no animation (globals.css).
 */
export function Fade({ id, className, children }: { id: number; className?: string; children: ReactNode }) {
  const [fresh] = useState(() => ready && !seen.has(id));
  useEffect(() => {
    seen.add(id);
    ready = true;
  }, [id]);
  return <div className={cn(className, fresh && "fade-in")}>{children}</div>;
}
