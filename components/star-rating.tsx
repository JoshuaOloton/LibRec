"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

function Star({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("size-7", className)}>
      <path
        d="M12 2.8l2.78 5.63 6.22.9-4.5 4.39 1.06 6.2L12 16.99l-5.56 2.93 1.06-6.2L3 9.33l6.22-.9L12 2.8z"
        fill={filled ? "var(--brass)" : "none"}
        stroke="var(--brass)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Props = {
  /** Current rating, 0 for none. */
  value?: number;
  onChange?: (value: number) => void;
  /** Display only (cards, lists). */
  readOnly?: boolean;
  label?: string;
  className?: string;
};

/**
 * Five brass stars. Interactive mode is a radio group: Tab focuses it, arrow keys change the
 * value, each star is a 44px touch target.
 */
export function StarRating({ value = 0, onChange, readOnly = false, label = "Rating", className }: Props) {
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  if (readOnly) {
    return (
      <span role="img" aria-label={`${value} out of 5 stars`} className={cn("inline-flex", className)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} filled={n <= Math.round(value)} className="size-4" />
        ))}
      </span>
    );
  }

  const shown = hover || value;
  const focusStar = (n: number) => {
    const next = Math.min(5, Math.max(1, n));
    onChange?.(next);
    refs.current[next - 1]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex", className)} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          ref={(el) => {
            refs.current[n - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          // Roving tabindex: the selected star (or the first, when unrated) is the tab stop.
          tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
          className="grid size-11 place-items-center rounded-md"
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange?.(n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              focusStar((value || 0) + 1);
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              focusStar((value || 2) - 1);
            }
          }}
        >
          <Star filled={n <= shown} />
        </button>
      ))}
    </div>
  );
}
