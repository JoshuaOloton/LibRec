"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Hamburger toggle for small screens. The menu content is rendered on the server and passed in. */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  // The menu is open only for the page it was opened on, so navigating closes it.
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-3 font-bold"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
        {open ? "Close" : "Menu"}
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-full border-b border-rule bg-surface">
          <div className="mx-auto max-w-page space-y-4 px-4 py-4">{children}</div>
        </div>
      )}
    </div>
  );
}
